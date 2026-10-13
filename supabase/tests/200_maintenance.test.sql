-- Maintenance plans (owner request, 2026-10-13): a plan makes weekly (or every 2-4 weeks)
-- visits a few weeks ahead, each a 'maintenance' job with the service checklist; changing,
-- pausing, or ending the plan replaces its upcoming visits that haven't started; a visit is
-- finished as Done. Owners manage plans; techs read them.
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

-- How many upcoming visits the plan has (not deleted).
create function pg_temp.visits() returns bigint language sql as $$
  select count(*) from job j, plan p
  where j.service_plan_id = p.id and j.deleted_at is null
$$;
grant execute on function pg_temp.visits() to authenticated;

select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ insert into service_plan (company_id, customer_id, property_id, starts_on)
  values (%L, %L, %L, current_date) $$, (select ca from ids), (select cust_a from ids),
  (select prop_a from ids)), '42501', null, 'techs cannot make plans');
reset role;

select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ with p as (
    insert into service_plan (company_id, customer_id, property_id, assigned_user_id, starts_on,
                              price_cents)
    values (%L, %L, %L, %L, %L, 9500) returning id)
  insert into plan select id from p $$, (select ca from ids), (select cust_a from ids),
  (select prop_a from ids), (select tech_a from ids), (select today from ids)),
  'owners make a weekly plan');
select is(pg_temp.visits(), 5::bigint, 'it makes weekly visits four weeks ahead (today and four more)');
select results_eq($$
  select distinct j.type, j.status, j.fee_cents, j.arrival_fixed,
         (extract(epoch from j.scheduled_end - j.scheduled_start) / 60)::int
  from job j, plan p where j.service_plan_id = p.id $$,
  $$ values ('maintenance'::text, 'scheduled'::text, 9500, false, 30) $$,
  'each visit: maintenance, scheduled, the price, 30 minutes, no set time');
select results_eq($$
  select count(*)::int from job_component jc join job j on j.id = jc.job_id, plan p
  where j.service_plan_id = p.id and j.plan_date = (select today from ids) $$,
  $$ values (7) $$, 'with the service checklist');
select results_eq($$
  select count(*)::int from checklist_item_result r join job j on j.id = r.job_id, plan p
  where j.service_plan_id = p.id and r.status = 'pending' $$,
  $$ values (35) $$, 'all to do');

-- Every two weeks, at 10:00: the upcoming visits are replaced.
select lives_ok($$ update service_plan set interval_weeks = 2, visit_time = '10:00'
  where id = (select id from plan) $$, 'owners change the plan');
select is(pg_temp.visits(), 3::bigint, 'every two weeks: three visits');
select results_eq($$ select distinct to_char(j.scheduled_start at time zone 'America/New_York', 'HH24:MI'),
  j.arrival_fixed from job j, plan p where j.service_plan_id = p.id and j.deleted_at is null $$,
  $$ values ('10:00'::text, true) $$, 'at the set time, which planning keeps');

-- A visit under way survives a change; the rest are replaced.
update job set status = 'in_progress' where service_plan_id = (select id from plan)
  and plan_date = (select today from ids) and deleted_at is null;
select lives_ok($$ update service_plan set paused = true where id = (select id from plan) $$,
  'owners pause it');
select is(pg_temp.visits(), 1::bigint, 'paused: only the visit under way is left');
select lives_ok($$ update job set status = 'done' where service_plan_id = (select id from plan)
  and deleted_at is null $$, 'a visit is finished as Done');
select lives_ok($$ update service_plan set paused = false where id = (select id from plan) $$,
  'owners resume it');
select is(pg_temp.visits(), 3::bigint, 'resumed: the visits are back, today''s not made twice');
reset role;

select tests.authenticate_as((select tech_a from ids));
select results_eq($$ select count(*)::int from service_plan where id = (select id from plan) $$,
  $$ values (1) $$, 'techs read plans');
select is(tests.rows_affected($$ update service_plan set paused = true where id = (select id from plan) $$),
  0::bigint, 'but cannot change them');
select throws_ok($$ select extend_service_plans() $$, '42501', null,
  'only the server extends plans');
reset role;

-- The morning job: plans keep four weeks of visits as days pass.
select tests.authenticate_as((select owner_a from ids));
update job set deleted_at = now() where service_plan_id = (select id from plan)
  and plan_date > (select today from ids);
reset role;
select is(extend_service_plans(), 2, 'every morning, missing visits are made again');

select * from finish();
rollback;
