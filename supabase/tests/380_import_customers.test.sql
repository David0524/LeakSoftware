-- Importing customers (owner, 2026-10-16): customers, pools, and visit plans in one go; a plan
-- puts its visits on the schedule; techs can't import; a bad record stops the whole import.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated;

create temp table batch on commit drop as select jsonb_build_array(
  jsonb_build_object(
    'customer', jsonb_build_object('name', 'Ana Rivera', 'email', 'ana@x.test', 'phone', '+14805550101'),
    'property', jsonb_build_object('address_line1', '1 Palm Ln', 'city', 'Mesa', 'state', 'AZ',
                                   'approx_gallons', 18000, 'pool_type', 'gunite_plaster'),
    'plan', jsonb_build_object('starts_on', current_date + 1, 'interval_weeks', 1,
                               'price_cents', 4000, 'tech_id', (select tech_a from ids))),
  jsonb_build_object(
    'customer', jsonb_build_object('name', 'Bo Lee'),
    'property', null, 'plan', null)
) as records;
grant select on batch to authenticated;

select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select import_customers(%L, %L::jsonb) $$, (select ca from ids), (select records from batch)),
  '42501', null, 'techs can''t import');
reset role;

select tests.authenticate_as((select owner_b from ids));
select throws_ok(format($$ select import_customers(%L, %L::jsonb) $$, (select ca from ids), (select records from batch)),
  '42501', null, 'nor can another shop''s owner');
reset role;

select tests.authenticate_as((select owner_a from ids));
select is(import_customers((select ca from ids), (select records from batch)),
  '{"customers": 2, "pools": 1, "plans": 1}'::jsonb, 'an owner imports customers, pools, and plans');
select is((select count(*)::int from customer where name in ('Ana Rivera', 'Bo Lee')), 2, 'the customers are there');
select is((select approx_gallons from property where address_line1 = '1 Palm Ln'), 18000, 'with their pool');
select ok((select count(*) from job j join service_plan p on p.id = j.service_plan_id
           where p.price_cents = 4000) > 0, 'and the plan''s visits are on the schedule');

-- One bad record (a pool with no address) stops the whole import: nothing half done.
select throws_ok(format($$ select import_customers(%L, %L::jsonb) $$, (select ca from ids),
  jsonb_build_array(
    jsonb_build_object('customer', jsonb_build_object('name', 'Cy Park')),
    jsonb_build_object('customer', jsonb_build_object('name', 'Di Ng'),
                       'property', jsonb_build_object('address_line1', null)))),
  '23502', null, 'a bad record stops the import');
select is((select count(*)::int from customer where name = 'Cy Park'), 0, 'and nothing from it was kept');
reset role;

select * from finish();
rollback;
