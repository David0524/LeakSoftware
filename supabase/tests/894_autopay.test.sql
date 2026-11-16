-- Autopay (20261022004400_autopay.sql): saved methods are the shop's managers' to read and the
-- server's to write; autopay turns on only with consent (the server) and off from the office;
-- charges are recorded once, retried on schedule, and settled from Stripe's events.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a, (a ->> 'customer')::uuid as cust_a,
  (a ->> 'invoice')::uuid as inv_a, (b ->> 'owner')::uuid as owner_b,
  (b ->> 'customer')::uuid as cust_b
  from fx;
grant select on ids to authenticated, anon, service_role;

-- The helper's invoice, sent, with its helper payment taken away: $185.00 owed.
update payment set deleted_at = now() where invoice_id = (select inv_a from ids);
select set_config('app.invoice_server', 'on', true);
update invoice set status = 'sent', sent_at = now() where id = (select inv_a from ids);
select set_config('app.invoice_server', 'off', true);
insert into share_link (company_id, job_id, invoice_id, token)
  select ca, (a ->> 'job')::uuid, inv_a, 'autopay-token-a' from ids, fx;

-- Who reads saved methods.
select tests.authenticate_as((select tech_a from ids));
select is((select count(*) from customer_payment_method), 0::bigint, 'techs don''t see saved cards');
select throws_ok(format($$ select autopay_details(%L) $$, (select inv_a from ids)), '42501', null,
  'techs can''t read an invoice''s autopay details');
select throws_ok(format($$ select set_customer_autopay(%L, false) $$, (select cust_a from ids)),
  '42501', null, 'techs can''t change autopay');
reset role;

select tests.authenticate_as((select admin_a from ids));
select is((select count(*) from customer_payment_method), 1::bigint, 'admins see their shop''s card');
reset role;

select tests.authenticate_as((select owner_b from ids));
select is((select count(*) from customer_payment_method where customer_id = (select cust_a from ids)),
  0::bigint, 'another shop sees none of them');
select throws_ok(format($$ select autopay_details(%L) $$, (select inv_a from ids)), '42501', null,
  'nor another shop''s invoice');
select throws_ok(format($$ select remove_payment_method(%L) $$, (select cust_a from ids)), '42501',
  null, 'nor removes another shop''s card');
reset role;

-- Nobody writes them through the API, and autopay isn't a client column.
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ update customer set autopay = true where id = %L $$,
  (select cust_a from ids)), '42501', null, 'customer.autopay is server-written');
select throws_ok(format($$ insert into customer_payment_method (company_id, customer_id, kind, last4,
  stripe_account_id, stripe_customer_id, stripe_payment_method_id)
  values (%L, %L, 'card', '1111', 'acct_a', 'cus_x', 'pm_x') $$, (select ca from ids),
  (select cust_a from ids)), '42501', null, 'saved methods are server-written');
select throws_ok(format($$ update customer_payment_method set last4 = '0000'
  where customer_id = %L $$, (select cust_a from ids)), '42501', null, 'and can''t be changed');
select is((autopay_details((select inv_a from ids)) -> 'method' ->> 'label'), 'Visa •••• 4242',
  'owners read the invoice''s card for Charge Card on File');
select is((autopay_details((select inv_a from ids)) ->> 'balance_cents')::int, 18500, 'and what''s owed');
select set_customer_autopay((select cust_a from ids), true);
select is((select autopay from customer where id = (select cust_a from ids)), true,
  'owners turn autopay on with a card saved');
select set_customer_autopay((select cust_a from ids), false);
select is((select autopay from customer where id = (select cust_a from ids)), false, 'and off');
reset role;

-- Saving a method (the webhook, as the server).
set local role service_role;
select is(autopay_save_method((select cust_a from ids), 'acct_b', 'cus_1', 'pm_new', 'card', 'Visa',
  '4242', 1, 2031, null, true), null, 'a method on another shop''s account is ignored');
select is(autopay_save_method((select cust_a from ids), 'acct_a', 'cus_a', 'pm_bank',
  'us_bank_account', null, '6789', null, null, 'STRIPE TEST BANK', true) -> 'replaced',
  '["pm_a"]'::jsonb, 'a new method replaces the old one, for the server to detach');
reset role;
select is((select array_agg(stripe_payment_method_id) from customer_payment_method
           where customer_id = (select cust_a from ids) and deleted_at is null),
  array['pm_bank'], 'one live method per customer');
select is((select autopay from customer where id = (select cust_a from ids)), true,
  'saving with consent turns autopay on');

-- The customer's page sees how it stands, without signing in.
set local role anon;
select is((invoice_autopay_for_token('autopay-token-a') ->> 'customer_autopay')::boolean, true,
  'the invoice page knows the customer pays automatically');
select throws_ok($$ select card_request_details('x') $$, '42501', null,
  'the card request lookup is the server''s');
reset role;

-- A failed charge, then its retry.
set local role service_role;
select autopay_record((select inv_a from ids), 'failed', 'pi_fail', 18500, 'ach',
  'STRIPE TEST BANK •••• 6789', 'Your bank declined the payment.', '2027-01-04', 'acct_a');
reset role;
select is((select array[autopay_status, autopay_tries::text, autopay_next_try::text]
           from invoice where id = (select inv_a from ids)),
  array['failed', '1', '2027-01-04'], 'a failed charge counts a try and sets the next');
select is((select count(*) from payment where invoice_id = (select inv_a from ids)
           and deleted_at is null), 0::bigint, 'and records no payment');
set local role service_role;
select is((select count(*) from autopay_retries_due('2027-01-03 18:00Z')), 0::bigint,
  'not before its day');
select is((select invoice_id from autopay_retries_due('2027-01-04 18:00Z')),
  (select inv_a from ids), 'on its day, it''s handed out to try again');
select is((select count(*) from autopay_retries_due('2027-01-04 19:00Z')), 0::bigint, 'once');

-- A bank charge processes, then settles.
select autopay_record((select inv_a from ids), 'processing', 'pi_bank', 18500, 'ach',
  'STRIPE TEST BANK •••• 6789', null, null, 'acct_a');
reset role;
select is((select status from payment where stripe_payment_intent_id = 'pi_bank'), 'pending',
  'a bank charge is pending');
set local role service_role;
select autopay_record((select inv_a from ids), 'processing', 'pi_bank', 18500, 'ach',
  'STRIPE TEST BANK •••• 6789', null, null, 'acct_a');
select is((autopay_settle('pi_bank', 'succeeded', 'acct_b', null, null)), null,
  'only the shop''s own account settles it');
select is((autopay_settle('pi_bank', 'succeeded', 'acct_a', null, null) ->> 'paid_now')::boolean,
  true, 'it settles and pays the invoice');
select is((autopay_settle('pi_bank', 'failed', 'acct_a', 'x', null) ->> 'changed')::boolean, false,
  'a payment never goes back');
reset role;
select is((select count(*) from payment where stripe_payment_intent_id = 'pi_bank'), 1::bigint,
  'recorded once');
select is((select array[status, autopay_status] from invoice where id = (select inv_a from ids)),
  array['paid', 'succeeded'], 'paid automatically');
select is((select count(*) from activity where kind = 'payment_received'
           and subject_id = (select id from payment where stripe_payment_intent_id = 'pi_bank')),
  1::bigint, 'it shows in Activity');
set local role service_role;
select isnt(claim_intent_notification('pi_bank'), null, 'its push is claimed once');
select is(claim_intent_notification('pi_bank'), null, 'and only once');
reset role;

-- Request Card on File and Remove Card (owners and admins).
select tests.authenticate_as((select owner_a from ids));
select is((card_request_link((select cust_a from ids)) ->> 'token'),
  (card_request_link((select cust_a from ids)) ->> 'token'), 'an open link is reused');
create temp table tok as select card_request_link((select cust_a from ids)) ->> 'token' as t;
grant select on tok to service_role;
reset role;
set local role service_role;
select is((card_request_details((select t from tok)) ->> 'saved'), 'STRIPE TEST BANK •••• 6789',
  'the request page shows what''s saved');
select is((card_request_details('nope')), null, 'an unknown link shows nothing');
reset role;
select tests.authenticate_as((select owner_a from ids));
select is((remove_payment_method((select cust_a from ids)) ->> 'stripe_payment_method_id'), 'pm_bank',
  'Remove Card hands the method to the server to detach');
select throws_ok(format($$ select set_customer_autopay(%L, true) $$, (select cust_a from ids)),
  '23514', null, 'autopay needs a saved method');
reset role;
select is((select autopay from customer where id = (select cust_a from ids)), false,
  'removing the card turns autopay off');
select is((select count(*) from customer_payment_method where customer_id = (select cust_a from ids)
           and deleted_at is null), 0::bigint, 'and nothing is saved');

select * from finish();
rollback;
