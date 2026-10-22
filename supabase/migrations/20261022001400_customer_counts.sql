-- Customer counts (owner, 2026-10-22: "have a number showing the total next to each thing" in
-- the Customers list's Show menu, and "a tracker of total customers, and customers actively on
-- a plan on the dashboard"). One query for the website; the apps count their synced rows with
-- the same rules (packages/core/src/customer-counts.ts).
--
--   all       customers not deleted (searched, when a search is given)
--   plan      those with a current maintenance plan: not deleted, and not ended before the
--             shop's today (a paused plan still counts)
--   no_plan   the rest
--   kinds     each kind's count (kinds with none are left out)
--   added     those added in the last 30 days (the Dashboard's "+4 in 30 days")
--
-- `search` matches as the website's list does (lib/data.ts listCustomers): name, email, or
-- phone containing it, ignoring case. Row security decides which customers the caller sees.
create or replace function public.customer_counts(target_company uuid, search text default null)
returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  with today as (
    select (now() at time zone coalesce(
      (select timezone from public.company where id = target_company), 'UTC'))::date as d
  ),
  c as (
    select c.kind, c.created_at,
      exists (
        select 1 from public.service_plan p, today
        where p.customer_id = c.id and p.company_id = c.company_id and p.deleted_at is null
          and (p.ends_on is null or p.ends_on >= today.d)
      ) as on_plan
    from public.customer c
    where c.company_id = target_company and c.deleted_at is null
      and (coalesce(btrim(search), '') = ''
        or c.name ilike '%' || btrim(search) || '%'
        or c.email ilike '%' || btrim(search) || '%'
        or c.phone ilike '%' || btrim(search) || '%')
  )
  select jsonb_build_object(
    'all', count(*),
    'plan', count(*) filter (where on_plan),
    'no_plan', count(*) filter (where not on_plan),
    'kinds', coalesce((select jsonb_object_agg(kind, n)
                       from (select kind, count(*) as n from c group by kind) k), '{}'::jsonb),
    'added', count(*) filter (where created_at >= now() - interval '30 days'))
  from c
$$;
revoke all on function public.customer_counts(uuid, text) from public, anon;
grant execute on function public.customer_counts(uuid, text) to authenticated;
