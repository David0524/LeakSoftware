-- The card fee on receipts (owner, 2026-11-24: customers see the card fee they were charged).
-- Only the server saves a payment's fee, only on its own shop's account, never more than 3% of
-- the charge; the customer's invoice page gets it with each payment.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'property')::uuid as prop_a, (a ->> 'customer')::uuid as cust_a
  from fx;
grant select on fx, ids to authenticated, anon, service_role;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon, service_role;

-- A $100 invoice, paid by card on A's account ($103 charged with a 3% card fee).
select tests.authenticate_as((select owner_a from ids));
with x as (
  insert into job (company_id, property_id, bill_to_customer_id, status, fee_cents)
  values ((select ca from ids), (select prop_a from ids), (select cust_a from ids), 'in_progress', 10000)
  returning id)
insert into st select 'job', id from x;
insert into st select 'inv', create_invoice((select v::uuid from st where k = 'job'))::text;
insert into st select 'sent', send_invoice((select v::uuid from st where k = 'inv'))::text;
reset role;
set local role service_role;
select stripe_record_invoice_payment((select v::uuid from st where k = 'inv'), 'cs_f', 'pi_f', 10000,
  'card', 'succeeded', 'acct_a');
reset role;
select is((select fee_cents from payment where stripe_checkout_session_id = 'cs_f'), 0,
  'a new payment starts with no fee');

select tests.authenticate_as((select owner_a from ids));
select throws_ok($$ select stripe_record_card_fee('cs_f', null, 300, 'acct_a') $$, '42501', null,
  'only the server saves a card fee');
reset role;

set local role service_role;
select throws_ok($$ select stripe_record_card_fee('cs_f', null, 300, 'acct_b') $$, '42501', null,
  'and only on the payment''s own shop''s account');
select is(stripe_record_card_fee('cs_f', null, 300, 'acct_a'), 300, 'the fee is saved by session');
select is(stripe_record_card_fee('cs_f', null, 300, 'acct_a'), 300, 'the same event again is fine');
select is(stripe_record_card_fee(null, 'pi_f', 9999, 'acct_a'), 300,
  'by intent too, and never more than 3% of the charge');
select is(stripe_record_card_fee('cs_none', null, 1, 'acct_a'), null, 'an unknown payment is ignored');
reset role;

set local role anon;
select results_eq(format($$ select (p ->> 'amount_cents')::int, (p ->> 'fee_cents')::int
                           from jsonb_array_elements(invoice_for_token(%L, false) -> 'payments') p $$,
                         (select v::jsonb ->> 'token' from st where k = 'sent')),
  $$ values (10000, 300) $$, 'the customer''s receipt has the payment and its card fee');
select is((invoice_for_token((select v::jsonb ->> 'token' from st where k = 'sent'), false)
           -> 'lines' -> 0) ? 'unit', true, 'and still everything it had');
reset role;

select * from finish();
rollback;
