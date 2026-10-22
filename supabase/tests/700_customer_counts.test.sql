-- Customer counts (owner, 2026-10-22): customer_counts(company, search) gives the Customers
-- Show menu's counts and the Dashboard's trackers in one query: a customer is On a Plan while a
-- plan of theirs is not deleted and not ended (paused counts); row security decides the rest.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp table ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a,
  (b ->> 'company')::uuid as cb, gen_random_uuid() as builder, gen_random_uuid() as ended,
  gen_random_uuid() as gone
  from fx;
grant select on ids to authenticated;

-- Shop a: make_company's customer (a paused plan), a builder added 40 days ago with no plan,
-- a homeowner whose plan ended yesterday, and a deleted customer.
insert into customer (id, company_id, name, kind, phone, created_at)
  select builder, ca, 'Desert Builders', 'builder', '(602) 555-0188', now() - interval '40 days'
  from ids;
insert into customer (id, company_id, name, kind) select ended, ca, 'Ended Plan', 'homeowner' from ids;
insert into property (company_id, customer_id, address_line1)
  select ca, ended, '1 Ended Way' from ids;
insert into service_plan (company_id, customer_id, property_id, starts_on, ends_on)
  select ca, ended, (select id from property where customer_id = ended), current_date - 60,
         current_date - 1 from ids;
insert into customer (id, company_id, name, kind, deleted_at)
  select gone, ca, 'Gone', 'insurer', now() from ids;

select tests.authenticate_as((select owner_a from ids));

create function pg_temp.counts(q text default null) returns jsonb
language sql as $$ select customer_counts((select ca from ids), q) $$;

select is((pg_temp.counts() ->> 'all')::int, 3, 'deleted customers don''t count');
select is((pg_temp.counts() ->> 'plan')::int, 1, 'a paused plan counts; an ended one doesn''t');
select is((pg_temp.counts() ->> 'no_plan')::int, 2, 'No Plan is the rest');
select is(pg_temp.counts() -> 'kinds', '{"homeowner": 2, "builder": 1}'::jsonb, 'each kind');
select is((pg_temp.counts() ->> 'added')::int, 2, 'added in the last 30 days');
select is((pg_temp.counts('desert') ->> 'all')::int, 1, 'a search counts what it finds (name)');
select is((pg_temp.counts('0188') ->> 'all')::int, 1, '(phone)');
select is((pg_temp.counts('  ') ->> 'all')::int, 3, 'a blank search counts everyone');

-- Plan ends today: still on it.
reset role;
update service_plan set ends_on = current_date where customer_id = (select ended from ids);
select tests.authenticate_as((select owner_a from ids));
select is((pg_temp.counts() ->> 'plan')::int, 2, 'a plan ending today still counts');

-- Another shop's customers are never counted.
select is((customer_counts((select cb from ids)) ->> 'all')::int, 0, 'another shop counts nothing');

reset role;
select is(has_function_privilege('anon', 'public.customer_counts(uuid, text)', 'execute'), false,
  'signed-out visitors can''t ask');

select * from finish();
rollback;
