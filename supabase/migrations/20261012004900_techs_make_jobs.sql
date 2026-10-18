-- Owners decide whether techs can make new jobs (owner, 2026-10-18: "Create an owner setting
-- toggle that allows techs to make new jobs"). company.settings.techs_make_jobs: true (the
-- default, as before) lets every member add jobs from the phone or the website; false leaves it
-- to owners. Jobs the server makes (plan visits, accepted repairs) are not affected.

-- The caller's companies where they can make jobs, looked up once per query (as in
-- 20261012003200_fast_row_security.sql).
create or replace function app.job_maker_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(m.company_id), '{}')
  from public.membership m join public.company c on c.id = m.company_id
  where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
    and (m.role = 'owner' or coalesce((c.settings ->> 'techs_make_jobs')::boolean, true))
$$;

revoke all on function app.job_maker_companies() from public;
grant execute on function app.job_maker_companies() to authenticated;

create policy job_makers on public.job as restrictive for insert to authenticated
  with check (company_id = any ((select app.job_maker_companies())::uuid[]));
