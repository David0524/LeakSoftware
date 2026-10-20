-- New Job books maintenance (owner request, 2026-10-13): a single maintenance visit through
-- create_job, and a plan with a new customer and pool through create_service_plan (owners).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
-- Written for a shop whose techs see every job (new shops start with only their own,
-- 2026-10-20; 190_job_visibility covers that).
update company set settings = settings || '{"techs_see_all_jobs": true}'
  where id in (select (a ->> 'company')::uuid from fx);
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated;
create temp table made_jobs (id uuid, asked text);
grant select, insert on made_jobs to authenticated;

select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ insert into made_jobs
  select create_job(%1$L, null, %2$L, null, %3$L, '{"type": "maintenance", "status": "unscheduled"}', '[]'), 'maintenance'
  union all
  select create_job(%1$L, null, %2$L, null, %3$L, '{"type": "repair", "status": "unscheduled"}', '[]'), 'repair' $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)), 'techs book new jobs');
select results_eq($$ select m.asked, j.type from made_jobs m join job j on j.id = m.id order by 1 $$,
  $$ values ('maintenance'::text, 'maintenance'::text), ('repair', 'repair') $$,
  'a single maintenance visit, or a repair (owner, 2026-10-18)');
select throws_ok(format($$ select create_service_plan(%L, '{"name": "New Pool Owner"}', null,
  '{"address_line1": "1 Plan St"}', null, '{"starts_on": "2026-01-05"}') $$, (select ca from ids)),
  '42501', null, 'techs cannot start plans');
reset role;

select tests.authenticate_as((select owner_a from ids));
create temp table made as select create_service_plan((select ca from ids),
  '{"name": "New Pool Owner", "phone": "602-555-0100"}', null,
  '{"address_line1": "1 Plan St", "city": "Phoenix", "state": "AZ"}', null,
  jsonb_build_object('starts_on', current_date, 'interval_weeks', 2, 'duration_minutes', 30,
                     'price_cents', 9500, 'assigned_user_id', (select tech_a from ids))) as r;
select results_eq($$ select c.name, p.address_line1 from made, customer c, property p
  where c.id = (r ->> 'customer')::uuid and p.id = (r ->> 'property')::uuid $$,
  $$ values ('New Pool Owner'::text, '1 Plan St'::text) $$,
  'owners start a plan with a new customer and pool in one step');
select results_eq($$ select interval_weeks::int, price_cents from service_plan, made
  where id = (r ->> 'plan')::uuid $$, $$ values (2, 9500) $$, 'with its settings');
select ok((select count(*) from job, made where service_plan_id = (r ->> 'plan')::uuid) > 0,
  'and its visits are on the schedule');
reset role;

select * from finish();
rollback;
