-- Require a Photo (owner, 2026-10-25: "In the owner's settings add a 'require photo to send
-- report' button. This is a feature Skimmer has").
--
-- company.settings.require_report_photo (off unless true): a maintenance visit's report can't be
-- sent until the visit has at least one photo. A photo still uploading from a phone counts (its
-- media row is here), as with the Complete Job photo rule (require_finish_photo).
--
-- * Send Visit Report by hand is refused with "Add a photo to send this report." (hint
--   photo_required), which the apps and the website show with a way to add one.
-- * An automatic send ({automatic: true}) is skipped ('no_photo') and waits: the phone keeps it
--   queued until the visit has a photo, and the daily catch-up lists the visit only once it has
--   one (within its two days).
-- * The monthly report isn't held up: it goes with the month's invoice, which never waits for a
--   photo. Only one visit's own report does.
--
-- As 20261012006400_visit_reports_server.sql (send_visit_report) and
-- 20261012006300_visit_reports.sql (visit_reports_due) otherwise.

/** Does the shop require a photo before a visit's report is sent? */
create or replace function app.requires_report_photo(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(c.settings -> 'require_report_photo' = 'true'::jsonb, false)
  from public.company c where c.id = target_company
$$;

/** Does the job have a photo (not deleted)? */
create or replace function app.job_has_photo(target_job uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.media m where m.job_id = target_job and m.kind = 'photo'
                 and m.deleted_at is null)
$$;
revoke all on function app.requires_report_photo(uuid), app.job_has_photo(uuid) from public;

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
  -- The server's daily catch-up calls this as the service role (current_setting('role') is
  -- the caller's role even inside this security definer function); everyone else is a member.
  if j.id is null or (current_setting('role', true) is distinct from 'service_role'
                     and not app.is_member(j.company_id)) then
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
  -- Require a Photo (owner, 2026-10-25): an automatic send waits for one.
  if app.requires_report_photo(j.company_id) and not app.job_has_photo(target_job) then
    if automatic then return jsonb_build_object('skipped', 'no_photo'); end if;
    raise exception 'Add a photo to send this report.'
      using errcode = 'check_violation', hint = 'photo_required';
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
grant execute on function public.send_visit_report(uuid, boolean) to authenticated, service_role;

-- The daily catch-up: as before, and with Require a Photo on, only visits that have one.
create or replace function public.visit_reports_due() returns table (job_id uuid, company_id uuid)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select j.id, j.company_id from public.job j
  where j.type = 'maintenance' and j.status = 'done' and j.deleted_at is null
    and coalesce(j.completed_at, j.updated_at) > now() - interval '2 days'
    and app.visit_report_mode(j.company_id) = 'auto'
    and (not app.requires_report_photo(j.company_id) or app.job_has_photo(j.id))
    and not exists (select 1 from public.report r where r.job_id = j.id
                    and r.template_key = 'maintenance' and r.status <> 'draft'
                    and r.deleted_at is null)
$$;
revoke all on function public.visit_reports_due() from public, authenticated, anon;
grant execute on function public.visit_reports_due() to service_role;
