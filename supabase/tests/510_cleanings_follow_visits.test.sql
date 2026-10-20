-- A plan's cleanings follow its visits (owner, 2026-10-20: "It should also auto add to
-- checklists"): a canceled visit hands its cleaning to the next one.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a,
  (now() at time zone 'America/New_York')::date as today
  from fx;
grant select on ids to authenticated;
create temp table plan (id uuid);
grant select, insert on plan to authenticated;
create function pg_temp.placed() returns setof date language sql as $$
  select j.plan_date from job_component x join job j on j.id = x.job_id, plan p
  where j.service_plan_id = p.id and j.deleted_at is null and x.deleted_at is null
    and x.plan_cleaning_id is not null
  order by 1
$$;
grant execute on function pg_temp.placed() to authenticated;

select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ with p as (
    insert into service_plan (company_id, customer_id, property_id, assigned_user_id, starts_on)
    values (%L, %L, %L, %L, %L) returning id)
  insert into plan select id from p $$, (select ca from ids), (select cust_a from ids),
  (select prop_a from ids), (select tech_a from ids), (select today from ids)),
  'a weekly plan');
select lives_ok(format($$ insert into plan_cleaning (company_id, service_plan_id,
                           component_type_id, every_months, next_due)
  values (%L, (select id from plan),
          (select id from component_type where company_id = %L and key = 'svc_salt_clean'),
          6, %L) $$, (select ca from ids), (select ca from ids), (select today + 3 from ids)),
  'a salt cell cleaning due in 3 days');
select results_eq($$ select * from pg_temp.placed() $$,
  format($$ values (%L::date) $$, (select today + 7 from ids)),
  'it is on the next week''s visit');
reset role;

update job set status = 'canceled'
  where service_plan_id = (select id from plan) and plan_date = (select today + 7 from ids);
select results_eq($$ select * from pg_temp.placed() $$,
  format($$ values (%L::date) $$, (select today + 14 from ids)),
  'canceling that visit moves the cleaning to the next one');

select * from finish();
rollback;
