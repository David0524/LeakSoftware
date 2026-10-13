-- Reports (M7): snapshot, draft, send, and the customer link. BUILD_PLAN 6.2, 6.3, 6.5.
--
-- Server-owned report columns (ai_draft, data_snapshot, status, ...) are written only by the
-- SECURITY DEFINER functions below. Each checks that the caller is a member of the job's
-- company. The web server calls them as the signed-in user, so no service-role key is needed.

-- ---------------------------------------------------------------------------
-- Snapshot: everything a report shows, built from synced rows (never from client text)
-- ---------------------------------------------------------------------------

create or replace function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with j as (select * from public.job where id = target_job and deleted_at is null),
  c as (select * from public.company where id = (select company_id from j)),
  p as (select * from public.property where id = (select property_id from j)),
  cu as (
    select * from public.customer
    where id = coalesce((select bill_to_customer_id from j), (select customer_id from p))
  )
  select jsonb_build_object(
    'company', (select jsonb_build_object(
      'name', c.name, 'legal_name', c.legal_name, 'phone', c.phone, 'email', c.email,
      'address', concat_ws(', ', c.address_line1, nullif(c.address_line2, ''), c.city,
                           nullif(concat_ws(' ', c.state, c.postal_code), '')),
      'logo_path', c.logo_path, 'brand_primary', c.brand_primary,
      'brand_secondary', c.brand_secondary, 'timezone', c.timezone) from c),
    'customer', (select jsonb_build_object('name', cu.name, 'email', cu.email, 'phone', cu.phone)
                 from cu),
    'property', (select jsonb_build_object(
      'address', concat_ws(', ', p.address_line1, nullif(p.address_line2, ''), p.city,
                           nullif(concat_ws(' ', p.state, p.postal_code), '')),
      'pool_type', p.pool_type, 'has_spa', p.has_spa, 'diagram_shape', p.diagram_shape) from p),
    'job', (select jsonb_build_object(
      'id', j.id, 'number', j.number, 'type', j.type, 'started_at', j.started_at,
      'scheduled_start', j.scheduled_start, 'summary_notes', j.summary_notes,
      'tech_name', (select coalesce(pr.full_name, pr.email) from public.profile pr
                    where pr.id = j.assigned_user_id)) from j),
    'components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', jc.id, 'result_id', r.id, 'label', jc.label, 'type_key', t.key,
        'type_name', t.name, 'status', coalesce(r.status, 'pending'), 'method', r.method,
        'exclusion_reason', r.exclusion_reason, 'notes', r.notes)
        order by jc.sort_order, jc.label)
      from public.job_component jc
      join public.component_type t on t.id = jc.component_type_id
      left join public.checklist_item_result r
        on r.job_component_id = jc.id and r.deleted_at is null
      where jc.job_id = target_job and jc.deleted_at is null), '[]'::jsonb),
    'tests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tr.id, 'type_key', tt.key, 'type_name', tt.name, 'calculator', tt.calculator,
        'field_schema', tt.field_schema, 'component_id', tr.job_component_id,
        'data', tr.data, 'outcome', tr.outcome, 'performed_at', tr.performed_at,
        'notes', tr.notes)
        order by tr.performed_at nulls last, tr.id)
      from public.test_result tr
      join public.test_type tt on tt.id = tr.test_type_id
      where tr.job_id = target_job and tr.deleted_at is null), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'title', f.title, 'severity_key', f.severity_key,
        'severity_name', coalesce(sl.name, f.severity_key),
        'severity_color', coalesce(sl.color, '#5B6B7A'),
        'must_mention', coalesce(sl.must_mention, false), 'location_text', f.location_text,
        'component_id', f.job_component_id, 'pin_x', f.pin_x, 'pin_y', f.pin_y,
        'status', f.status, 'notes', f.notes)
        order by f.id)
      from public.finding f
      left join public.severity_level sl
        on sl.company_id = f.company_id and sl.key = f.severity_key and sl.deleted_at is null
      where f.job_id = target_job and f.deleted_at is null), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'storage_path', m.storage_path, 'mime_type', m.mime_type,
        'caption', m.caption, 'markup', m.markup, 'width', m.width, 'height', m.height,
        'captured_at', m.captured_at, 'finding_id', m.finding_id,
        'component_id', m.job_component_id, 'test_id', m.test_result_id,
        'transcript', m.transcript)
        order by m.captured_at nulls last, m.id)
      from public.media m
      where m.job_id = target_job and m.deleted_at is null
        and m.upload_state = 'uploaded' and m.storage_path is not null), '[]'::jsonb),
    'signatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'purpose', s.purpose, 'signer_name', s.signer_name,
        'signer_role', s.signer_role, 'signed_at', s.signed_at, 'image_path', s.image_path)
        order by s.signed_at)
      from public.signature s
      where s.job_id = target_job and s.deleted_at is null and s.purpose <> 'quote_acceptance'),
      '[]'::jsonb),
    'component_types', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.key, 'name', t.name) order by t.sort_order)
      from public.component_type t
      where t.company_id = (select company_id from j) and t.deleted_at is null), '[]'::jsonb)
  )
  from j
$$;
revoke all on function app.report_snapshot(uuid) from public;

-- ---------------------------------------------------------------------------
-- Drafts
-- ---------------------------------------------------------------------------

-- The open draft for this job and template (creating it if needed), with a fresh snapshot.
-- Returns {report_id, version, snapshot, tone}.
create or replace function public.prepare_report(target_job uuid, template text)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  co uuid;
  tmpl public.report_template;
  rep public.report;
  snap jsonb;
begin
  select company_id into co from public.job where id = target_job and deleted_at is null;
  if co is null or not app.is_member(co) then
    raise exception 'Job not found' using errcode = 'insufficient_privilege';
  end if;
  select * into tmpl from public.report_template
  where company_id = co and key = template and deleted_at is null;
  if tmpl.id is null or not tmpl.enabled then
    raise exception 'The % report is not available', template using errcode = 'invalid_parameter_value';
  end if;

  snap := app.report_snapshot(target_job);
  select * into rep from public.report
  where job_id = target_job and template_key = template and status = 'draft' and deleted_at is null
  order by version desc limit 1 for update;
  if rep.id is null then
    insert into public.report (company_id, job_id, template_key, version, data_snapshot)
    values (co, target_job, template,
            coalesce((select max(version) from public.report
                      where job_id = target_job and template_key = template), 0) + 1,
            snap)
    returning * into rep;
  else
    update public.report set data_snapshot = snap where id = rep.id returning * into rep;
  end if;
  return jsonb_build_object('report_id', rep.id, 'version', rep.version, 'snapshot', snap,
                            'tone', tmpl.tone, 'final_sections', rep.final_sections);
end
$$;

-- Record the AI draft (and its problems) for the record, and start the editable text from it
-- unless the tech already has text.
create or replace function public.save_report_draft(
  target_report uuid, draft jsonb, final jsonb, model_id text, prompt text, problems jsonb)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  rep public.report;
begin
  select * into rep from public.report where id = target_report and deleted_at is null for update;
  if rep.id is null or not app.is_member(rep.company_id) then
    raise exception 'Report not found' using errcode = 'insufficient_privilege';
  end if;
  if rep.status <> 'draft' then
    raise exception 'This report has been sent' using errcode = 'check_violation';
  end if;
  update public.report
  set ai_draft = jsonb_build_object('narrative', draft, 'problems', coalesce(problems, '[]'),
                                    'created_at', now()),
      model = model_id, prompt_version = prompt,
      final_sections = final
  where id = target_report;
end
$$;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- Freezes the report: final snapshot, sent, earlier versions superseded, a customer link,
-- and the job moves to "report sent". Returns {token, report_id, version}.
create or replace function public.send_report(target_report uuid) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  rep public.report;
  link text;
  pending int;
begin
  select * into rep from public.report where id = target_report and deleted_at is null for update;
  if rep.id is null or not app.is_member(rep.company_id) then
    raise exception 'Report not found' using errcode = 'insufficient_privilege';
  end if;
  if rep.status <> 'draft' then
    raise exception 'This report has already been sent' using errcode = 'check_violation';
  end if;
  if rep.final_sections is null or jsonb_typeof(rep.final_sections) <> 'array'
     or jsonb_array_length(rep.final_sections) = 0
     or not exists (select 1 from jsonb_array_elements(rep.final_sections) s
                    where length(trim(coalesce(s ->> 'text', ''))) > 0) then
    raise exception 'Write the report before sending it' using errcode = 'check_violation';
  end if;
  -- BUILD_PLAN 6.1: every checklist item is inspected or excluded with a reason.
  select count(*) into pending
  from public.job_component jc
  left join public.checklist_item_result r on r.job_component_id = jc.id and r.deleted_at is null
  where jc.job_id = rep.job_id and jc.deleted_at is null and coalesce(r.status, 'pending') = 'pending';
  if pending > 0 then
    raise exception '% checklist item(s) are still to do. Inspect them or mark them not inspected with a reason.', pending
      using errcode = 'check_violation', hint = 'checklist_pending';
  end if;

  update public.report set status = 'superseded'
  where job_id = rep.job_id and template_key = rep.template_key and status = 'sent'
    and deleted_at is null;
  update public.report
  set status = 'sent', sent_at = now(), data_snapshot = app.report_snapshot(rep.job_id)
  where id = rep.id;
  insert into public.share_link (company_id, job_id, report_id)
  values (rep.company_id, rep.job_id, rep.id)
  returning token into link;
  update public.job set status = 'report_sent'
  where id = rep.job_id and status = 'in_progress';
  return jsonb_build_object('token', link, 'report_id', rep.id, 'version', rep.version);
end
$$;

-- The PDF of a sent report lives at documents/{company}/{job}/report-{report}.pdf. It is
-- rendered from the frozen report on first request and stored by the server; the report row
-- itself never changes after sending.

-- Delivery log written by the server (email provider id and errors are not client-writable).
create or replace function public.log_message(
  target_job uuid, via text, sent_to text, template_key text, delivery text,
  provider text default null, failure text default null)
returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  co uuid;
  new_id uuid;
begin
  select company_id into co from public.job where id = target_job;
  if co is null or not app.is_member(co) then
    raise exception 'Job not found' using errcode = 'insufficient_privilege';
  end if;
  insert into public.message (company_id, job_id, channel, recipient, template, status, provider_id, error)
  values (co, target_job, via, sent_to, template_key, delivery, provider, failure)
  returning id into new_id;
  return new_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Customer link (/r/{token}): no sign-in. Returns the frozen report or nothing.
-- ---------------------------------------------------------------------------

create or replace function public.report_for_token(link_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  sl public.share_link;
  rep public.report;
  newest text;
begin
  select * into sl from public.share_link
  where token = link_token and revoked_at is null and (expires_at is null or expires_at > now())
    and deleted_at is null;
  if sl.id is null or sl.report_id is null then
    return null;
  end if;
  select * into rep from public.report
  where id = sl.report_id and status in ('sent', 'superseded') and deleted_at is null;
  if rep.id is null then
    return null;
  end if;
  update public.share_link
  set view_count = view_count + 1, last_viewed_at = now()
  where id = sl.id;
  if rep.status = 'superseded' then
    select l.token into newest
    from public.report r join public.share_link l on l.report_id = r.id and l.revoked_at is null
    where r.job_id = rep.job_id and r.template_key = rep.template_key and r.status = 'sent'
      and r.deleted_at is null
    order by r.version desc, l.id desc limit 1;
  end if;
  return jsonb_build_object(
    'report_id', rep.id, 'template_key', rep.template_key, 'version', rep.version,
    'status', rep.status, 'sent_at', rep.sent_at, 'final_sections', rep.final_sections,
    'snapshot', rep.data_snapshot, 'pdf_path', rep.pdf_path, 'newer_token', newest);
end
$$;

revoke all on function public.prepare_report(uuid, text), public.save_report_draft(uuid, jsonb, jsonb, text, text, jsonb),
  public.send_report(uuid),
  public.log_message(uuid, text, text, text, text, text, text), public.report_for_token(text) from public;
grant execute on function public.prepare_report(uuid, text), public.save_report_draft(uuid, jsonb, jsonb, text, text, jsonb),
  public.send_report(uuid),
  public.log_message(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.report_for_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage for the customer page
-- ---------------------------------------------------------------------------

-- A file shown on a report that has a live customer link: its photos, signatures, logo, PDF.
create or replace function app.shared_object(bucket text, object_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.share_link sl
    join public.report r on r.id = sl.report_id
    where sl.revoked_at is null and sl.deleted_at is null
      and (sl.expires_at is null or sl.expires_at > now())
      and r.status in ('sent', 'superseded') and r.deleted_at is null
      and r.company_id = app.object_company(object_name)
      and case bucket
        when 'media' then
          r.data_snapshot -> 'media' @> jsonb_build_array(jsonb_build_object('storage_path', object_name))
          or r.data_snapshot -> 'signatures' @> jsonb_build_array(jsonb_build_object('image_path', object_name))
        when 'company-assets' then r.data_snapshot -> 'company' ->> 'logo_path' = object_name
        when 'documents' then object_name = r.company_id || '/' || r.job_id || '/report-' || r.id || '.pdf'
        else false
      end
  )
$$;
revoke all on function app.shared_object(text, text) from public;
grant execute on function app.shared_object(text, text) to anon, authenticated;

create policy shared_report_files on storage.objects for select to anon
  using (bucket_id in ('media', 'company-assets', 'documents') and app.shared_object(bucket_id, name));
