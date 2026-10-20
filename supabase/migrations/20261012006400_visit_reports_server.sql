-- Visit reports, sent by the server's daily catch-up (20261012006300): the service role may
-- send a visit's report too, so a visit completed on a phone that never told the server still
-- gets its automatic report within a day.

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
