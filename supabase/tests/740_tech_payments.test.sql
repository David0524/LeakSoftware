-- Techs record payments (owner, 2026-10-22: "Techs should be able to record payments"): on
-- invoices of jobs they can see, cash, check or other, as managers do; never on a job they can't
-- see, and still not voiding or writing payments directly.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'invoice')::uuid as inv_a, (a ->> 'customer')::uuid as cust_a,
  (a ->> 'property')::uuid as prop_a, (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on ids to authenticated;
create temp table st (k text primary key, v text);
grant all on st to authenticated;

-- Techs see only their own jobs. The tech's job has a sent $185.00 invoice; another job, not
-- theirs, has a sent $300.00 one.
update company set settings = settings || '{"techs_see_all_jobs": false}'
  where id = (select ca from ids);
delete from payment where invoice_id = (select inv_a from ids);
select set_config('app.invoice_server', 'on', true);
update invoice set status = 'sent', sent_at = now(), amount_paid_cents = 0
  where id = (select inv_a from ids);
with j as (
  insert into job (company_id, property_id, bill_to_customer_id, status, assigned_user_id)
  select ca, prop_a, cust_a, 'in_progress', owner_a from ids returning id)
insert into st select 'job2', id::text from j;
with i as (
  insert into invoice (company_id, job_id, total_cents, status, sent_at)
  select ca, (select v::uuid from st where k = 'job2'), 30000, 'sent', now() from ids returning id)
insert into st select 'inv2', id::text from i;
select set_config('app.invoice_server', 'off', true);

select tests.authenticate_as((select tech_a from ids));
insert into st select 'cash', record_invoice_payment((select inv_a from ids), 5000, 'cash')::text;
select is((select v::jsonb ->> 'status' from st where k = 'cash'), 'partially_paid',
  'a tech records cash on their own job''s invoice');
insert into st select 'check',
  record_invoice_payment((select inv_a from ids), 13500, 'check', '#4521')::text;
select is((select v::jsonb ->> 'status' from st where k = 'check'), 'paid',
  'and a check that pays it in full');
select results_eq(
  format($$ select method, check_number, amount_cents from payment where id = %L $$,
    (select v::jsonb ->> 'payment_id' from st where k = 'check')),
  $$ values ('check', '4521', 13500) $$, 'recorded with its number');
select lives_ok(format($$ select log_receipt(%L, 'email', 'c@example.com', 'sent') $$,
  (select v::jsonb ->> 'payment_id' from st where k = 'check')), 'and logs the receipt after it');

-- Not on a job they can't see.
select throws_ok(format($$ select record_invoice_payment(%L, 100, 'cash') $$,
  (select v from st where k = 'inv2')), '42501', 'Job not found',
  'not on another tech''s job');
select is((select count(*)::int from payment where invoice_id = (select v::uuid from st where k = 'inv2')),
  0, 'nor can they see its payments');

-- Still the managers': voiding, and writing payments other than through the function.
select throws_ok(format($$ select void_invoice(%L) $$, (select inv_a from ids)),
  '42501', null, 'a tech still cannot void an invoice');
select throws_ok(format($$ insert into payment (company_id, invoice_id, amount_cents, method, status)
                           values (%L, %L, 100, 'cash', 'succeeded') $$,
  (select ca from ids), (select v from st where k = 'inv2')),
  '42501', null, 'nor write a payment row directly');
reset role;

-- Another shop's tech: nothing.
select tests.authenticate_as((select tech_b from ids));
select throws_ok(format($$ select record_invoice_payment(%L, 100, 'cash') $$,
  (select v from st where k = 'inv2')), '42501', null, 'another shop''s tech cannot');
reset role;

-- With "Techs see all jobs" on, the other job's invoice is theirs to record on too.
update company set settings = settings || '{"techs_see_all_jobs": true}'
  where id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select is((record_invoice_payment((select v::uuid from st where k = 'inv2'), 30000, 'other') ->> 'status'),
  'paid', 'a tech who sees every job records on any of them');
reset role;

select tests.authenticate_as((select owner_a from ids));
select is((select count(*)::int from payment where invoice_id = (select v::uuid from st where k = 'inv2')
           and status = 'succeeded'), 1, 'the owner sees the tech''s payment');
reset role;

select * from finish();
rollback;
