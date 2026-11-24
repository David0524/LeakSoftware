-- Standalone quotes (20261022005700_standalone_quotes.sql): a quote-only job is hidden, has no
-- job number, needs no pool, and becomes the repair job when the customer accepts.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated, anon, service_role;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon, service_role;

-- A tech makes a quote for a customer with no pool picked (as the phones do: job and quote).
select tests.authenticate_as((select tech_a from ids));
insert into customer (company_id, name, phone) values ((select ca from ids), 'Pat Walk-in', '6025550111');
insert into st select 'cust2', id from customer where name = 'Pat Walk-in';
select lives_ok(format($$
  insert into job (company_id, type, status, bill_to_customer_id, assigned_user_id)
  values (%L, 'repair', 'quote', %L, %L) $$,
  (select ca from ids), (select v from st where k = 'cust2'), (select tech_a from ids)),
  'a quote job needs no pool');
insert into st select 'job', id from job where bill_to_customer_id = (select v::uuid from st where k = 'cust2');
select is((select number from job where id = (select v::uuid from st where k = 'job')), null,
  'and takes no job number');
reset role;
select throws_ok(format($$
  insert into job (company_id, type, status, bill_to_customer_id) values (%L, 'repair', 'unscheduled', %L) $$,
  (select ca from ids), (select v from st where k = 'cust2')),
  '23514', null, 'any other job still needs a pool');
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$
  insert into job (company_id, type, status, property_id) values (%L, 'detection', 'quote', %L) $$,
  (select ca from ids), (select prop_a from ids)),
  '23514', null, 'a quote job is a repair');
select throws_ok(format($$ update job set status = 'unscheduled' where id = %L $$,
  (select v from st where k = 'job')), null, null, 'people cannot turn a quote job into a job');

with x as (insert into quote (company_id, job_id) values ((select ca from ids), (select v::uuid from st where k = 'job')) returning id)
insert into st select 'q', id from x;
insert into quote_line_item (company_id, quote_id, description, unit_price_cents)
values ((select ca from ids), (select v::uuid from st where k = 'q'), 'Replace skimmer', 45000);
insert into st select 'sent', send_quote((select v::uuid from st where k = 'q'))::text;
select is((select status from job where id = (select v::uuid from st where k = 'job')), 'quote',
  'sending leaves it a quote job');
reset role;

-- Hidden from the dashboard's job counts and from search's jobs.
select tests.authenticate_as((select owner_a from ids));
select ok(not (owner_dashboard((select ca from ids)) -> 'statuses' ? 'quote'),
  'the dashboard does not count quote jobs');
select is(jsonb_array_length(search_candidates((select ca from ids), array['walk'], null) -> 'jobs'), 0,
  'search does not list the quote job');
select is(jsonb_array_length(search_candidates((select ca from ids), array['walk'], null) -> 'quotes'), 1,
  'but finds its quote');
reset role;

-- The customer accepts with no pool anywhere: the quote is accepted and waits for one.
set local role anon;
select is((quote_for_token((select v::jsonb ->> 'token' from st where k = 'sent')) ->> 'total_cents')::int,
  45000, 'the customer link works without a pool');
select lives_ok(format($$ select accept_quote_by_link(%L, 'Pat Walk-in', true) $$,
  (select v::jsonb ->> 'token' from st where k = 'sent')), 'the customer accepts');
reset role;
select results_eq(
  format('select q.status, q.repair_job_id, j.status, j.number is null from quote q join job j on j.id = q.job_id where q.id = %L',
         (select v from st where k = 'q')),
  format($$ values ('accepted'::text, %L::uuid, 'quote'::text, true) $$, (select v from st where k = 'job')),
  'with no pool it stays a quote job, already pointing at itself as the repair');
select is((select count(*)::int from activity where kind = 'quote_accepted'
           and subject_id = (select v::uuid from st where k = 'q')), 1, 'the acceptance shows in Activity');

-- Adding the pool makes it the repair job.
select tests.authenticate_as((select tech_a from ids));
insert into property (company_id, customer_id, address_line1)
values ((select ca from ids), (select v::uuid from st where k = 'cust2'), '12 Palm Ln');
update job set property_id = (select id from property where address_line1 = '12 Palm Ln')
where id = (select v::uuid from st where k = 'job');
reset role;
select results_eq(
  format('select status, number is not null, type from job where id = %L', (select v from st where k = 'job')),
  $$ values ('unscheduled'::text, true, 'repair'::text) $$,
  'adding the pool makes it an unscheduled, numbered repair job');

-- A quote job for a customer with a pool: accepting takes their pool and makes no second job.
select tests.authenticate_as((select owner_a from ids));
insert into job (company_id, type, status, bill_to_customer_id)
values ((select ca from ids), 'repair', 'quote', (select cust_a from ids));
insert into st select 'job2', id from job where bill_to_customer_id = (select cust_a from ids) and status = 'quote';
with x as (insert into quote (company_id, job_id) values ((select ca from ids), (select v::uuid from st where k = 'job2')) returning id)
insert into st select 'q2', id from x;
insert into quote_line_item (company_id, quote_id, description, unit_price_cents)
values ((select ca from ids), (select v::uuid from st where k = 'q2'), 'Patch', 20000);
insert into st select 'sent2', send_quote((select v::uuid from st where k = 'q2'))::text;
reset role;
insert into st select 'jobs_before', count(*)::text from job where company_id = (select ca from ids);
set local role anon;
select accept_quote_by_link((select v::jsonb ->> 'token' from st where k = 'sent2'), 'Customer A', true);
reset role;
select results_eq(
  format('select status, property_id, number is not null from job where id = %L', (select v from st where k = 'job2')),
  format($$ values ('unscheduled'::text, %L::uuid, true) $$, (select prop_a from ids)),
  'accepting uses the customer''s pool and makes the quote job the repair job');
select is((select count(*)::text from job where company_id = (select ca from ids)),
  (select v from st where k = 'jobs_before'), 'no second job is made');
select is((select repair_job_id from quote where id = (select v::uuid from st where k = 'q2')),
  (select v::uuid from st where k = 'job2'), 'the quote points at its own job as the repair');

select * from finish();
rollback;
