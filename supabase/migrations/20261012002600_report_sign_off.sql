-- Review, then sign (owner request, 2026-10-13): the customer reads the report on the tech's
-- phone and signs at the bottom, and signing finishes the report: the version they read is
-- locked, so what they signed is what they get. When nobody can sign ("Customer Not Here"),
-- the report says why. The PDF never waits for a signature.
--
-- * send_report gains the reason nobody signed. Finishing gives this version the signatures
--   taken since the last one (signature.report_id), so a later version shows which version
--   was signed.
-- * report_preview: the draft as the customer will see it, for the review screen.

-- The snapshot's signatures say which version they were given on.
alter function app.report_snapshot(uuid) rename to report_snapshot_m8;

create or replace function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when s is null then null else s || jsonb_build_object(
    'signatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sg.id, 'purpose', sg.purpose, 'signer_name', sg.signer_name,
        'signer_role', sg.signer_role, 'signed_at', sg.signed_at, 'image_path', sg.image_path,
        'report_version', r.version)
        order by sg.signed_at)
      from public.signature sg
      left join public.report r on r.id = sg.report_id
      where sg.job_id = target_job and sg.deleted_at is null
        and sg.purpose <> 'quote_acceptance'), '[]'::jsonb))
  end
  from app.report_snapshot_m8(target_job) s
$$;
revoke all on function app.report_snapshot(uuid), app.report_snapshot_m8(uuid) from public;

drop function public.send_report(uuid);

-- Finishes the report: final snapshot, locked, earlier versions superseded, a customer link,
-- and the job moves to "report sent". unsigned_reason (for example "Customer not present")
-- goes on the report when nobody signs this version. Returns {token, report_id, version}.
create or replace function public.send_report(target_report uuid, unsigned_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  rep public.report;
  link text;
  pending int;
  snap jsonb;
  reason text := nullif(trim(coalesce(unsigned_reason, '')), '');
begin
  select * into rep from public.report where id = target_report and deleted_at is null for update;
  if rep.id is null or not app.is_member(rep.company_id)
     or not app.job_visible(rep.company_id, rep.job_id) then
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

  -- Signatures taken since the last version belong to this one.
  update public.signature set report_id = rep.id
  where job_id = rep.job_id and report_id is null and purpose <> 'quote_acceptance'
    and deleted_at is null;
  snap := app.report_snapshot(rep.job_id);
  if reason is not null and not exists (
    select 1 from public.signature
    where report_id = rep.id and deleted_at is null) then
    snap := snap || jsonb_build_object('sign_off', jsonb_build_object('unsigned_reason', reason));
  end if;

  update public.report set status = 'superseded'
  where job_id = rep.job_id and template_key = rep.template_key and status = 'sent'
    and deleted_at is null;
  update public.report set status = 'sent', sent_at = now(), data_snapshot = snap
  where id = rep.id;
  insert into public.share_link (company_id, job_id, report_id)
  values (rep.company_id, rep.job_id, rep.id)
  returning token into link;
  update public.job set status = 'report_sent'
  where id = rep.job_id and status = 'in_progress';
  return jsonb_build_object('token', link, 'report_id', rep.id, 'version', rep.version);
end
$$;

-- The draft as the customer will see it, built fresh (the review screen), with what still
-- stops it from being finished. Returns null for a report the caller cannot see.
create or replace function public.report_preview(target_report uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  rep public.report;
  pending int;
begin
  select * into rep from public.report where id = target_report and deleted_at is null;
  if rep.id is null or not app.is_member(rep.company_id) or not app.job_visible(rep.company_id, rep.job_id) then
    return null;
  end if;
  select count(*) into pending
  from public.job_component jc
  left join public.checklist_item_result r on r.job_component_id = jc.id and r.deleted_at is null
  where jc.job_id = rep.job_id and jc.deleted_at is null and coalesce(r.status, 'pending') = 'pending';
  return jsonb_build_object(
    'report_id', rep.id, 'job_id', rep.job_id, 'template_key', rep.template_key,
    'version', rep.version, 'status', rep.status, 'sent_at', rep.sent_at,
    'final_sections', rep.final_sections,
    'snapshot', case when rep.status = 'draft' then app.report_snapshot(rep.job_id)
                     else rep.data_snapshot end,
    'pending', pending);
end
$$;

revoke all on function public.send_report(uuid, text), public.report_preview(uuid) from public;
grant execute on function public.send_report(uuid, text), public.report_preview(uuid)
  to authenticated;
