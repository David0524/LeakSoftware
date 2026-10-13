-- Deleting customers: owners only, never with open work, and history stays.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'job')::uuid as job_a,
  (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated;

-- A second customer with nothing on file.
insert into customer (company_id, name) select ca, 'Pat Empty' from ids;
insert into property (company_id, customer_id, address_line1)
select ca, (select id from customer where name = 'Pat Empty'), '2 Test St' from ids;

select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select delete_customer(%L) $$, (select cust_a from ids)),
  '42501', null, 'techs cannot delete customers');
reset role;

select tests.authenticate_as((select owner_b from ids));
select throws_ok(format($$ select delete_customer(%L) $$, (select cust_a from ids)),
  '42501', null, 'another company cannot either');
reset role;

select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select delete_customer(%L) $$, (select cust_a from ids)),
  '23514', 'Customer a has 1 open job. Finish or cancel them first.',
  'a customer with an open job cannot be deleted');
reset role;

-- The job is paid, but an invoice still waits for money.
update job set status = 'invoiced' where id = (select job_a from ids);
update job set status = 'paid' where id = (select job_a from ids);
select set_config('app.invoice_server', 'on', true);
update invoice set status = 'sent' where job_id = (select job_a from ids);
select set_config('app.invoice_server', 'off', true);
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select delete_customer(%L) $$, (select cust_a from ids)),
  '23514', null, 'nor one who still owes on an invoice');
reset role;

select set_config('app.invoice_server', 'on', true);
update invoice set status = 'paid' where job_id = (select job_a from ids);
select set_config('app.invoice_server', 'off', true);
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ select delete_customer(%L) $$, (select cust_a from ids)),
  'with everything settled, an owner can delete the customer');
select lives_ok($$ select delete_customer((select id from customer where name = 'Pat Empty')) $$,
  'and a customer with no jobs');
reset role;

select ok((select deleted_at is not null from customer where id = (select cust_a from ids)),
  'the customer is soft-deleted');
select ok(not exists (select 1 from property where customer_id = (select cust_a from ids) and deleted_at is null),
  'and so are their pools');
select ok((select deleted_at is null from job where id = (select job_a from ids)),
  'their finished job keeps its history');

select * from finish();
rollback;
