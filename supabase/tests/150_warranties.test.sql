-- Warranties (M10): a paid repair job gets one warranty per accepted line with a term,
-- once, from the day it was paid; other companies can't see them.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'job')::uuid as job_a, (a ->> 'property')::uuid as prop_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'tech')::uuid as tech_a, (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on ids to authenticated, anon, service_role;
create temp table st (k text primary key, v uuid);
grant all on st to authenticated, anon, service_role;

-- A repair job from an accepted quote: a 12-month line, a line without a term.
with x as (
  insert into job (company_id, property_id, bill_to_customer_id, type, status)
  values ((select ca from ids), (select prop_a from ids), (select cust_a from ids), 'repair', 'scheduled')
  returning id)
insert into st select 'repair', id from x;
with x as (
  insert into quote (company_id, job_id, total_cents)
  values ((select ca from ids), (select job_a from ids), 30000) returning id)
insert into st select 'q', id from x;
insert into quote_line_item (company_id, quote_id, description, unit_price_cents, warranty_months, sort_order)
values ((select ca from ids), (select v from st where k = 'q'), 'Skimmer throat repair', 22500, 12, 1),
       ((select ca from ids), (select v from st where k = 'q'), 'Haul away', 7500, null, 2);
set local app.quote_server = 'on';
update quote set status = 'accepted', repair_job_id = (select v from st where k = 'repair')
where id = (select v from st where k = 'q');

select is((select count(*)::int from warranty where repair_job_id = (select v from st where k = 'repair')),
  0, 'no warranty before the repair is paid');
update job set status = 'in_progress' where id = (select v from st where k = 'repair');
update job set status = 'invoiced' where id = (select v from st where k = 'repair');
update job set status = 'paid' where id = (select v from st where k = 'repair');

select results_eq(
  format($$ select description, ends_on - starts_on between 365 and 366, terms from warranty
            where repair_job_id = %L $$, (select v from st where k = 'repair')),
  $$ values ('Skimmer throat repair', true, '12-month warranty on parts and labor') $$,
  'the paid repair gets a 12-month warranty for the line with a term');

-- Only once, even if the job's status is set again.
update job set status = 'paid' where id = (select v from st where k = 'repair');
select is((select count(*)::int from warranty where repair_job_id = (select v from st where k = 'repair')),
  1, 'warranties are recorded once');

select tests.authenticate_as((select tech_a from ids));
select ok((select count(*) from warranty) >= 1, 'the shop sees its warranties');
reset role;
select tests.authenticate_as((select tech_b from ids));
select is((select count(*)::int from warranty where repair_job_id = (select v from st where k = 'repair')),
  0, 'another company does not');
reset role;

select * from finish();
rollback;
