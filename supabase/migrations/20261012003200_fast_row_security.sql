-- Faster row security (2026-10-15, owner: "make this app faster ... older content loads faster").
--
-- Every policy called app.is_member(company_id) (and the job visibility checks) once per row.
-- They are SECURITY DEFINER functions, which Postgres can't fold into the query, so each row
-- paid for a membership lookup: about 0.1 ms a row. Lists and counts got slower as a shop's
-- history grew (counting three years of photos took 0.8 s; a year of jobs, 0.3 s).
--
-- Now the caller's companies are looked up once per query, as arrays, and each row only
-- checks company_id against them:
--   app.is_member(company_id)  ->  company_id = any ((select app.member_companies())::uuid[])
-- The job visibility checks keep their meaning: the per-row function only runs for techs in
-- shops that limit them to their own jobs.
--
-- app.speed_up_policies() rewrites every policy in public that still uses the per-row form.
-- A table added later with policies made the 20261012000600 way calls it once after; the
-- test 280_fast_row_security fails until it does.

create or replace function app.member_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(company_id), '{}') from public.membership
  where user_id = auth.uid() and status = 'active' and deleted_at is null
$$;

create or replace function app.owner_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(company_id), '{}') from public.membership
  where user_id = auth.uid() and role = 'owner' and status = 'active' and deleted_at is null
$$;

create or replace function app.all_jobs_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(m.company_id), '{}')
  from public.membership m join public.company c on c.id = m.company_id
  where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
    and (m.role = 'owner' or coalesce((c.settings ->> 'techs_see_all_jobs')::boolean, true))
$$;

revoke all on function app.member_companies(), app.owner_companies(), app.all_jobs_companies() from public;
grant execute on function app.member_companies(), app.owner_companies(), app.all_jobs_companies() to authenticated;

/** Rewrites every public policy that uses a per-row check; returns how many it changed. */
create or replace function app.speed_up_policies() returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  p record;
  qual text;
  chk text;
  n integer := 0;
begin
  for p in
    select pol.polname, c.relname, pg_get_expr(pol.polqual, pol.polrelid) as q,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as w
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
  loop
    qual := p.q; chk := p.w;
    qual := app.fast_check(qual);
    chk := app.fast_check(chk);
    if qual is distinct from p.q then
      execute format('alter policy %I on public.%I using (%s)', p.polname, p.relname, qual);
      n := n + 1;
    end if;
    if chk is distinct from p.w then
      execute format('alter policy %I on public.%I with check (%s)', p.polname, p.relname, chk);
      n := n + 1;
    end if;
  end loop;
  return n;
end
$$;

/** One policy expression with the per-row checks replaced by their once-per-query forms. */
create or replace function app.fast_check(expr text) returns text
language sql immutable as $$
  -- Already rewritten (it uses the per-query lookups): leave it, so running this twice is safe.
  select case when expr ~ 'app\.(member|owner|all_jobs)_companies\(\)' then expr else
  regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(expr,
    'app\.is_member\(company_id\)', '(company_id = ANY ((SELECT app.member_companies())::uuid[]))', 'g'),
    'app\.is_owner\(company_id\)', '(company_id = ANY ((SELECT app.owner_companies())::uuid[]))', 'g'),
    'app\.job_row_visible\(company_id, ([a-z_]+), ([a-zA-Z_:]+)\)',
      '((company_id = ANY ((SELECT app.all_jobs_companies())::uuid[])) OR (\1 = (SELECT auth.uid())) OR (\2 = (SELECT auth.uid())))', 'g'),
    'app\.job_visible\(company_id, ([a-z_]+)\)',
      '((company_id = ANY ((SELECT app.all_jobs_companies())::uuid[])) OR app.job_visible(company_id, \1))', 'g'),
    'app\.linked_job_visible\(company_id, ([^)]+)\)',
      '((company_id = ANY ((SELECT app.all_jobs_companies())::uuid[])) OR app.linked_job_visible(company_id, \1))', 'g')
  end
$$;

select app.speed_up_policies();
revoke all on function app.speed_up_policies(), app.fast_check(text) from public;

