-- Maintenance visit reports (owner, 2026-10-20: "For the maintenance plan, build a report with
-- the tested chemicals, checklist, cleanings, photos, etc. Then have an option to send the
-- report to customers. Include manual send and auto send. Owner/admin can turn that off in
-- their own settings").
--
-- A visit report is a report row with template_key 'maintenance', frozen when it's sent like
-- every report: the leak report's snapshot (checklist, which holds the cleanings; photos;
-- notes) plus the visit's chemical readings. There is no draft and no written narrative: the
-- visit's own records are the report. The customer opens it at the same /r/{token} link.
--
-- The shop chooses in company.settings.visit_reports: 'manual' (the default: Send Visit
-- Report on the visit), 'auto' (sent by itself when the visit is completed), or 'off'.

do $$
declare
  c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.report'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%template_key%';
  execute format('alter table public.report drop constraint %I', c);
end
$$;
alter table public.report add constraint report_template_key_check
  check (template_key in ('homeowner', 'partner', 'insurance', 'maintenance'));

-- The visit's snapshot: the report snapshot and its chemical readings, newest first.
create or replace function app.visit_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select app.report_snapshot(target_job) || jsonb_build_object(
    'chemicals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recorded_at', cr.recorded_at, 'gallons', cr.gallons, 'fc', cr.fc, 'ph', cr.ph,
        'ta', cr.ta, 'ch', cr.ch, 'cya', cr.cya, 'salt', cr.salt,
        'chlorine_product', cr.chlorine_product, 'acid_product', cr.acid_product,
        'notes', cr.notes)
        order by cr.recorded_at desc)
      from public.chemical_reading cr
      where cr.job_id = target_job and cr.deleted_at is null), '[]'::jsonb),
    'completed_at', (select j.completed_at from public.job j where j.id = target_job))
$$;
revoke all on function app.visit_snapshot(uuid) from public;

-- The shop's choice: 'manual', 'auto', or 'off'.
create or replace function app.visit_report_mode(target_company uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when c.settings ->> 'visit_reports' in ('manual', 'auto', 'off')
              then c.settings ->> 'visit_reports' else 'manual' end
  from public.company c where c.id = target_company
$$;
revoke all on function app.visit_report_mode(uuid) from public;

-- Send a visit's report: freeze it and make the customer link. `automatic` is the sending
-- that follows completing a visit: it happens only when the shop chose 'auto', and only once
-- per visit, so a retry or the daily catch-up never sends twice. Sending by hand again sends a
-- new version (the earlier one is superseded, as with leak reports).
-- Returns {token, report_id, version}, or {skipped: reason} for an automatic send that
-- doesn't apply.
create or replace function public.send_visit_report(target_job uuid, automatic boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  j public.job;
  mode text;
  rep public.report;
  link text;
begin
  select * into j from public.job where id = target_job and deleted_at is null;
  if j.id is null or not app.is_member(j.company_id) then
    raise exception 'Job not found' using errcode = 'insufficient_privilege';
  end if;
  if j.type <> 'maintenance' then
    raise exception 'Visit reports are for maintenance visits' using errcode = 'invalid_parameter_value';
  end if;
  mode := app.visit_report_mode(j.company_id);
  if mode = 'off' then
    if automatic then return jsonb_build_object('skipped', 'off'); end if;
    raise exception 'Visit reports are turned off in Settings' using errcode = 'check_violation';
  end if;
  if automatic then
    if mode <> 'auto' then return jsonb_build_object('skipped', 'manual'); end if;
    if j.status <> 'done' then return jsonb_build_object('skipped', 'not_done'); end if;
    if exists (select 1 from public.report where job_id = target_job
               and template_key = 'maintenance' and status <> 'draft' and deleted_at is null) then
      return jsonb_build_object('skipped', 'sent');
    end if;
  elsif j.status = 'canceled' then
    raise exception 'This visit was canceled' using errcode = 'check_violation';
  end if;

  -- One at a time per visit, so two sends at once can't both make version 1.
  perform pg_advisory_xact_lock(hashtext('visit_report:' || target_job::text));
  update public.report set status = 'superseded'
  where job_id = target_job and template_key = 'maintenance' and status = 'sent'
    and deleted_at is null;
  insert into public.report (company_id, job_id, template_key, version, status, sent_at,
                             data_snapshot, final_sections)
  values (j.company_id, target_job, 'maintenance',
          coalesce((select max(version) from public.report
                    where job_id = target_job and template_key = 'maintenance'), 0) + 1,
          'sent', now(), app.visit_snapshot(target_job), '[]'::jsonb)
  returning * into rep;
  insert into public.share_link (company_id, job_id, report_id)
  values (j.company_id, target_job, rep.id)
  returning token into link;
  return jsonb_build_object('token', link, 'report_id', rep.id, 'version', rep.version);
end
$$;
revoke all on function public.send_visit_report(uuid, boolean) from public;
grant execute on function public.send_visit_report(uuid, boolean) to authenticated;

-- The daily catch-up (the server's service role): visits completed in the last two days in
-- shops that send automatically, with no visit report yet.
create or replace function public.visit_reports_due() returns table (job_id uuid, company_id uuid)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select j.id, j.company_id from public.job j
  where j.type = 'maintenance' and j.status = 'done' and j.deleted_at is null
    and coalesce(j.completed_at, j.updated_at) > now() - interval '2 days'
    and app.visit_report_mode(j.company_id) = 'auto'
    and not exists (select 1 from public.report r where r.job_id = j.id
                    and r.template_key = 'maintenance' and r.status <> 'draft'
                    and r.deleted_at is null)
$$;
revoke all on function public.visit_reports_due() from public, authenticated, anon;
grant execute on function public.visit_reports_due() to service_role;
