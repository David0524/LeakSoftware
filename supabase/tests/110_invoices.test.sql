-- Invoices (M9): drafts from a job, totals, sending, frozen invoices, customer page, payments
-- from Stripe and from the office, the job reaching "paid", and void.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
-- Written for a shop whose techs see every job (new shops start with only their own,
-- 2026-10-20; 190_job_visibility covers that).
update company set settings = settings || '{"techs_see_all_jobs": true}'
  where id in (select (a ->> 'company')::uuid from fx);
-- These rules need a deposit and a tech discount limit (new shops start with neither).
update company set settings = settings || '{"deposit": {"type": "percent", "value_bps": 5000, "minimum_cents": 0},
                                            "tech_discount_limit_bps": 1000}'::jsonb
where id in (((select a from fx) ->> 'company')::uuid, ((select b from fx) ->> 'company')::uuid);
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'property')::uuid as prop_a,
  (a ->> 'customer')::uuid as cust_a, (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on ids to authenticated, anon, service_role;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon, service_role;
create temp view v as select k, v from st;
grant select on v to authenticated, anon, service_role;

-- 8.25% tax. The figures match INVOICE_FIXTURE in packages/core/test/invoice.test.ts.
update company set settings = jsonb_set(settings, '{tax_rate_bps}', '825') where id = (select ca from ids);

-- A repair quote, sent, accepted by the customer, with its 50% deposit paid.
select tests.authenticate_as((select tech_a from ids));
with x as (
  insert into quote (company_id, job_id, discount_cents)
  values ((select ca from ids), (select job_a from ids), 10000) returning id)
insert into st select 'q1', id from x;
insert into quote_line_item (company_id, quote_id, description, quantity, unit_price_cents, taxable, sort_order)
select (select ca from ids), (select v::uuid from st where k = 'q1'), d, qty, price, tx, n
from (values ('Repair return line', 1.0, 85000, true, 1), ('Fittings', 2.5, 12999, true, 2),
             ('Labor', 1.0, 15000, false, 3)) v(d, qty, price, tx, n);
insert into st select 'qtok', send_quote((select v::uuid from st where k = 'q1')) ->> 'token';
reset role;
set local role anon;
select accept_quote_by_link((select v from st where k = 'qtok'), 'Sam', true);
reset role;
set local role service_role;
select stripe_record_quote_payment((select v::uuid from st where k = 'q1'), 'cs_dep', null, 65730, 'card', 'succeeded', 'acct_a');
reset role;
insert into st select 'repair', repair_job_id::text from quote where id = (select v::uuid from st where k = 'q1');

-- Drafts
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select create_invoice(%L) $$, (select v from st where k = 'repair')),
  '23514', null, 'a job that has not started cannot be invoiced');
update job set status = 'in_progress' where id = (select v::uuid from st where k = 'repair');
insert into st select 'inv', create_invoice((select v::uuid from st where k = 'repair'))::text;
select is(create_invoice((select v::uuid from st where k = 'repair'))::text,
  (select v from st where k = 'inv'), 'creating again returns the same draft');
select results_eq(
  format($$ select kind, description, quantity, unit_price_cents, taxable from invoice_line_item
            where invoice_id = %L order by sort_order $$, (select v from st where k = 'inv')),
  $$ values ('item', 'Repair return line', 1.00, 85000, true), ('item', 'Fittings', 2.50, 12999, true),
            ('item', 'Labor', 1.00, 15000, false),
            ('deposit_credit', 'Deposit paid on quote #' || (select number from quote where id = (select v::uuid from st where k = 'q1')),
             1.00, -65730, false) $$,
  'a repair invoice copies the accepted quote and credits the deposit paid');
select results_eq(
  format('select quote_id, discount_cents, status from invoice where id = %L', (select v from st where k = 'inv')),
  format('select %L::uuid, 10000, %L', (select v from st where k = 'q1'), 'draft'),
  'with the quote''s discount, as a draft');
select throws_ok(format($$ insert into invoice_line_item (company_id, invoice_id, kind, description, unit_price_cents)
                           values (%L, %L, 'deposit_credit', 'Free money', -5000) $$,
  (select ca from ids), (select v from st where k = 'inv')),
  '42501', null, 'members cannot add credits themselves');
select throws_ok(format($$ update invoice set status = 'paid' where id = %L $$, (select v from st where k = 'inv')),
  '42501', null, 'nor set the status');
select lives_ok(format($$ update invoice set notes = 'Thanks!' where id = %L $$, (select v from st where k = 'inv')),
  'a draft can be edited');

-- Sending
insert into st select 'sent', send_invoice((select v::uuid from st where k = 'inv'))::text;
select ok((select length(v::jsonb ->> 'token') = 32 from st where k = 'sent'), 'sending returns a customer link');
select results_eq(
  format($$ select subtotal_cents, discount_cents, tax_cents, credit_cents, total_cents, status,
                   due_date is not null from invoice where id = %L $$, (select v from st where k = 'inv')),
  $$ values (132498, 10000, 8962, 65730, 65730, 'sent', true) $$,
  'the server computes the same totals, due on receipt');
select is((select status from job where id = (select v::uuid from st where k = 'repair')), 'invoiced',
  'the job is invoiced');
select throws_ok(format($$ update invoice set notes = 'x' where id = %L $$, (select v from st where k = 'inv')),
  '23514', null, 'a sent invoice cannot be edited');
select throws_ok(format($$ insert into invoice_line_item (company_id, invoice_id, description, unit_price_cents) values (%L, %L, 'Extra', 100) $$,
  (select ca from ids), (select v from st where k = 'inv')), '23514', null, 'nor can lines be added');
select is((invoice_mail_details((select v::uuid from st where k = 'inv')) ->> 'token'),
  (select v::jsonb ->> 'token' from st where k = 'sent'), 'members can read what the email needs');
reset role;

select tests.authenticate_as((select tech_b from ids));
select throws_ok(format($$ select send_invoice(%L) $$, (select v from st where k = 'inv')),
  '42501', null, 'another company cannot send the invoice');
select throws_ok(format($$ select invoice_mail_details(%L) $$, (select v from st where k = 'inv')),
  '42501', null, 'nor read its email details');
reset role;

-- The customer page, signed out.
set local role anon;
select results_eq(
  format($$ select (j ->> 'balance_cents')::int, jsonb_array_length(j -> 'lines'), j ->> 'status'
            from invoice_for_token(%L) j $$, (select v::jsonb ->> 'token' from st where k = 'sent')),
  $$ values (65730, 4, 'sent') $$, 'the customer link shows the balance and every line');
select is(invoice_for_token('not-a-token'), null, 'a wrong link shows nothing');
select throws_ok(format($$ select record_invoice_payment(%L, 100) $$, (select v from st where k = 'inv')),
  '42501', null, 'visitors cannot record payments');
reset role;

-- A check the office records, then the rest by bank through Stripe.
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select record_invoice_payment(%L, 20000) $$, (select v from st where k = 'inv')),
  '42501', null, 'techs cannot record payments');
reset role;
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select record_invoice_payment(%L, 99999999) $$, (select v from st where k = 'inv')),
  '23514', null, 'a payment cannot be more than the balance');
select is((record_invoice_payment((select v::uuid from st where k = 'inv'), 20000) ->> 'status'),
  'partially_paid', 'an owner records a check: partly paid');
reset role;

set local role service_role;
select is((stripe_record_invoice_payment((select v::uuid from st where k = 'inv'), 'cs_inv', null, 45730, 'ach', 'pending', 'acct_a') ->> 'status'),
  'partially_paid', 'a bank payment in progress leaves it partly paid');
select is((invoice_checkout_details((select v::jsonb ->> 'token' from st where k = 'sent')) ->> 'payment_pending')::boolean,
  true, 'checkout knows a payment is processing');
select results_eq(
  format($$ select j ->> 'status', (j ->> 'paid_now')::boolean
            from stripe_record_invoice_payment(%L, 'cs_inv', 'pi_inv', 45730, 'ach', 'succeeded', 'acct_a') j $$,
         (select v from st where k = 'inv')),
  $$ values ('paid', true) $$, 'when it clears the invoice is paid, once');
select results_eq(
  format($$ select j ->> 'status', (j ->> 'paid_now')::boolean
            from stripe_record_invoice_payment(%L, 'cs_inv', null, 45730, 'ach', 'pending', 'acct_a') j $$,
         (select v from st where k = 'inv')),
  $$ values ('paid', false) $$, 'a late event changes nothing');
select is((invoice_mail_details((select v::uuid from st where k = 'inv')) ->> 'balance_cents')::int, 0,
  'the server can read the receipt details');
reset role;
select results_eq(
  format('select amount_paid_cents, paid_at is not null from invoice where id = %L', (select v from st where k = 'inv')),
  $$ values (65730, true) $$, 'paid in full, with the date');
select is((select status from job where id = (select v::uuid from st where k = 'repair')), 'paid',
  'and the job is paid');

select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select void_invoice(%L) $$, (select v from st where k = 'inv')),
  '23514', null, 'an invoice with payments cannot be voided');
reset role;

-- A detection job: its fee, sent, voided by an owner, and invoiced again.
select tests.authenticate_as((select tech_a from ids));
with x as (
  insert into job (company_id, property_id, bill_to_customer_id, status, fee_cents)
  values ((select ca from ids), (select prop_a from ids), (select cust_a from ids), 'in_progress', 64900)
  returning id)
insert into st select 'det', id from x;
insert into st select 'inv2', create_invoice((select v::uuid from st where k = 'det'))::text;
select results_eq(
  format('select kind, description, unit_price_cents, taxable from invoice_line_item where invoice_id = %L',
         (select v from st where k = 'inv2')),
  $$ values ('item', 'Leak detection', 64900, false) $$, 'a detection invoice bills the fee, untaxed');
insert into st select 'tok2', send_invoice((select v::uuid from st where k = 'inv2')) ->> 'token';
select is((select total_cents from invoice where id = (select v::uuid from st where k = 'inv2')), 64900,
  'the fee is the total');
select throws_ok(format($$ select void_invoice(%L) $$, (select v from st where k = 'inv2')),
  '42501', null, 'techs cannot void a sent invoice');
reset role;
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ select void_invoice(%L) $$, (select v from st where k = 'inv2')), 'owners can');
reset role;
set local role anon;
select is((invoice_for_token((select v from st where k = 'tok2')) ->> 'status'), 'void',
  'the customer link shows it as void');
reset role;
select tests.authenticate_as((select tech_a from ids));
select isnt(create_invoice((select v::uuid from st where k = 'det'))::text, (select v from st where k = 'inv2'),
  'the job can be invoiced again');
reset role;

-- A deposit still clearing blocks the invoice, so the credit is never wrong.
select tests.authenticate_as((select owner_a from ids));
with x as (
  insert into quote (company_id, job_id) values ((select ca from ids), (select job_a from ids)) returning id)
insert into st select 'q2', id from x;
insert into quote_line_item (company_id, quote_id, description, unit_price_cents)
values ((select ca from ids), (select v::uuid from st where k = 'q2'), 'Skimmer rebuild', 40000);
insert into st select 'qtok2', send_quote((select v::uuid from st where k = 'q2')) ->> 'token';
reset role;
set local role anon;
select accept_quote_by_link((select v from st where k = 'qtok2'), 'Sam', true);
reset role;
set local role service_role;
select stripe_record_quote_payment((select v::uuid from st where k = 'q2'), 'cs_dep2', null, 21650, 'ach', 'pending', 'acct_a');
reset role;
update job set status = 'in_progress'
where id = (select repair_job_id from quote where id = (select v::uuid from st where k = 'q2'));
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select create_invoice(%L) $$,
  (select repair_job_id from quote where id = (select v::uuid from st where k = 'q2'))),
  '23514', null, 'a deposit still clearing blocks the invoice');
reset role;

select * from finish();
rollback;
