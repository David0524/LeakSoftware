-- Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check"): a recorded
-- payment's method and check number, the receipt log with its Activity event, and the
-- customer's page listing each payment.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
update company set settings = settings || '{"techs_see_all_jobs": true}'
  where id in (select (a ->> 'company')::uuid from fx);
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated, anon, service_role;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon, service_role;

-- A $649.00 invoice, sent.
update job set status = 'in_progress' where id = (select job_a from ids);
select tests.authenticate_as((select owner_a from ids));
insert into st select 'inv', create_invoice((select job_a from ids))::text;
update invoice_line_item set deleted_at = now() where invoice_id = (select v::uuid from st where k = 'inv');
insert into invoice_line_item (company_id, invoice_id, description, unit_price_cents, taxable)
select (select ca from ids), (select v::uuid from st where k = 'inv'), 'Leak detection', 64900, false;
insert into st select 'token', send_invoice((select v::uuid from st where k = 'inv')) ->> 'token';
select is((select total_cents from invoice where id = (select v::uuid from st where k = 'inv')), 64900,
  'the invoice is $649.00');

-- Recording: cash, check with a number, the old two-argument call.
select throws_ok(format($$ select record_invoice_payment(%L, 100, 'card') $$, (select v from st where k = 'inv')),
  '23514', 'Pick Cash, Check, or Other', 'only cash, check, or other can be recorded');
select throws_ok(format($$ select record_invoice_payment(%L, 100, 'check', '123456789012345678901') $$,
  (select v from st where k = 'inv')), '23514', 'Enter a check number up to 20 characters',
  'a check number is at most 20 characters');
insert into st select 'cash', record_invoice_payment((select v::uuid from st where k = 'inv'), 10000, 'cash')::text;
select is((select v::jsonb ->> 'status' from st where k = 'cash'), 'partially_paid', 'cash: partly paid');
select results_eq(
  format($$ select method, check_number, amount_cents from payment where id = %L $$,
    (select v::jsonb ->> 'payment_id' from st where k = 'cash')),
  $$ values ('cash', null::text, 10000) $$, 'it returns the payment, recorded as cash');
insert into st select 'check', record_invoice_payment((select v::uuid from st where k = 'inv'), 20000, 'check', ' #1234 ')::text;
select results_eq(
  format($$ select method, check_number from payment where id = %L $$,
    (select v::jsonb ->> 'payment_id' from st where k = 'check')),
  $$ values ('check', '1234') $$, 'a check keeps its number, without the #');
insert into st select 'cashnum', record_invoice_payment((select v::uuid from st where k = 'inv'), 100, 'cash', '99')::text;
select is((select check_number from payment where id = (select (v::jsonb ->> 'payment_id')::uuid from st where k = 'cashnum')),
  null, 'cash keeps no check number');
insert into st select 'old', record_invoice_payment((select v::uuid from st where k = 'inv'), 100)::text;
select is((select method from payment where id = (select (v::jsonb ->> 'payment_id')::uuid from st where k = 'old')),
  'other', 'an older phone''s call records other');
reset role;

select tests.authenticate_as((select tech_a from ids));
-- Techs record payments too since 20261022001800 (730_tech_payments): past the role check, the
-- balance check still applies.
select throws_ok(format($$ select record_invoice_payment(%L, 99999999, 'cash') $$, (select v from st where k = 'inv')),
  '23514', 'Enter an amount up to the balance due', 'a tech gets past the role check');

-- Receipts: any member who sees the invoice can log one; it shows in Activity.
insert into st select 'msg', log_receipt((select (v::jsonb ->> 'payment_id')::uuid from st where k = 'check'),
  'sms', '+16025550142', 'sent', 'SM1')::text;
select results_eq(
  format($$ select channel, recipient, template, status, job_id from message where id = %L $$,
    (select v from st where k = 'msg')),
  format($$ values ('sms', '+16025550142', 'receipt', 'sent', %L::uuid) $$, (select job_a from ids)),
  'a texted receipt is logged on the job');
select results_eq(
  format($$ select kind, actor_id, amount_cents, preview from activity where subject_id = %L $$,
    (select v from st where k = 'msg')),
  format($$ values ('receipt_sent', %L::uuid, 20000, 'text') $$, (select tech_a from ids)),
  'and in Activity: who sent it, the payment, and how');
reset role;

select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ select log_receipt(%L, 'email', 'sam@example.com', 'sent') $$,
  (select v::jsonb ->> 'payment_id' from st where k = 'check')), 'the same receipt can be sent again');
select is((select count(*)::int from activity where kind = 'receipt_sent'), 2, 'each send is an event');
insert into st select 'failed', log_receipt((select (v::jsonb ->> 'payment_id')::uuid from st where k = 'cash'),
  'email', 'sam@example.com', 'failed', null, 'Bounced')::text;
select is((select status from message where id = (select v::uuid from st where k = 'failed')), 'failed',
  'a failed send is logged');
select is((select count(*)::int from activity where subject_id = (select v::uuid from st where k = 'failed')), 0,
  'but is not in Activity');
select throws_ok(format($$ select log_receipt(%L, 'fax', 'x', 'sent') $$,
  (select v::jsonb ->> 'payment_id' from st where k = 'cash')), '22023', null, 'email or text only');
select ok(exists (select 1 from jsonb_array_elements(
    activity_feed((select ca from ids)) -> 'events') e
  where e ->> 'kind' = 'receipt_sent' and e ->> 'preview' = 'email'), 'the feed hands it out');
reset role;

select tests.authenticate_as((select owner_b from ids));
select throws_ok(format($$ select log_receipt(%L, 'email', 'x@example.com', 'sent') $$,
  (select v::jsonb ->> 'payment_id' from st where k = 'cash')), '42501', null,
  'another shop cannot log a receipt');
reset role;

-- The customer's page lists each payment's method and check number (in the order paid; one
-- transaction here, so compared as a set; make_company's invoice has a card payment).
set local role anon;
select set_eq(
  format($$ select p ->> 'method' as m, p ->> 'check_number' as n, (p ->> 'amount_cents')::int as c
            from jsonb_array_elements((invoice_for_token(%L, false)) -> 'payments') p $$,
    (select v from st where k = 'token')),
  $$ values ('cash', null::text, 10000), ('check', '1234', 20000), ('cash', null, 100),
            ('other', null, 100), ('card', null, 18500) $$,
  'the customer page shows each payment');
reset role;

select * from finish();
rollback;
