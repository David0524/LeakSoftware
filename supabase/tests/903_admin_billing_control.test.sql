-- Full control of a shop's billing from the Admin portal, and refunds (owner, 2026-11-24).
-- Price lists anyone reads and only staff write; a subscribed shop keeps its list; a shop's own
-- price; staff switch the package and apply codes and free months; refunds of a shop's
-- payments, all or part, by owners and admins only (never techs or staff sessions), recorded
-- once whatever order Stripe's events come in.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'property')::uuid as prop_a, (a ->> 'customer')::uuid as cust_a,
  (b ->> 'company')::uuid as cb, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on fx, ids to authenticated, anon, service_role;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon, service_role;

update subscription set status = 'trialing', trial_ends_at = now() + interval '10 days',
  card_required = true, stripe_subscription_id = null, price_list_id = null, plan = 'standard'
where company_id in (select unnest(array[ca, cb]) from ids);

-- 1. Price lists
set local role anon;
select is((current_prices() -> 'maintenance' -> 'tiers' -> 1 ->> 'price_cents')::int, 14900,
  'anyone reads the prices (the home page shows them)');
select throws_ok($$ select * from price_list $$, '42501', null, 'but not the table');
select throws_ok($$ select admin_save_prices('{}'::jsonb, null, 'x') $$, '42501', null,
  'nor save a list');
reset role;
select tests.authenticate_as((select owner_a from ids));
select throws_ok($$ select admin_price_lists() $$, '42501', null, 'owners can''t list them');
select throws_ok(format($$ select admin_set_custom_price(%L, 'fixed', 1, null, null, null) $$,
  (select ca from ids)), '42501', null, 'nor set their own price');
select throws_ok(format($$ select admin_set_services(%L, 'pool') $$, (select ca from ids)),
  '42501', null, 'nor use the staff package switch');
reset role;

set local role service_role;
-- B subscribes under the launch list.
update subscription set stripe_subscription_id = 'sub_b', status = 'active'
where company_id = (select cb from ids);
insert into st select 'launch', (select price_list_id from subscription where company_id = (select cb from ids));
select is((select v::bigint from st where k = 'launch'), (select max(id) from price_list),
  'a shop that subscribes keeps the newest list');
select throws_ok($$ select admin_save_prices('{"maintenance": {}}'::jsonb, null, 'x') $$, '23514',
  null, 'a list needs both packages and the add-on');
insert into st select 'raised', admin_save_prices(jsonb_set(current_prices(),
  '{maintenance,tiers,1,price_cents}', '15900'), 'Up $10', 'staff@sundeck.test');
select is((current_prices() -> 'maintenance' -> 'tiers' -> 1 ->> 'price_cents')::int, 15900,
  'staff save a new list and it is what new shops pay');
select is((shop_prices((select cb from ids)) -> 'maintenance' -> 'tiers' -> 1 ->> 'price_cents')::int,
  14900, 'the subscribed shop keeps its price');
select is((shop_prices((select ca from ids)) -> 'maintenance' -> 'tiers' -> 1 ->> 'price_cents')::int,
  15900, 'a shop still on its trial sees the new prices');
select is((select (l ->> 'shops')::int from jsonb_array_elements(admin_price_lists()) l
           where (l ->> 'id')::bigint = (select v::bigint from st where k = 'launch')), 1,
  'the portal counts the shops on each list');

-- 2. A shop's own price
select lives_ok(format($$ select admin_set_custom_price(%L, 'fixed', 9900, null, '2099-01-31', 'Pilot') $$,
  (select cb from ids)), 'staff set a fixed price until a date');
select results_eq(format($$ select s ->> 'custom_price_kind', (s ->> 'custom_price_cents')::int,
                                  s ->> 'custom_price_until', (s -> 'price_list') is not null
                           from shop_billing_price(%L) s $$, (select cb from ids)),
  $$ values ('fixed', 9900, '2099-01-31', true) $$, 'the website reads it with the shop''s list');
select throws_ok(format($$ select admin_set_custom_price(%L, 'percent', null, 0, null, null) $$,
  (select cb from ids)), '22023', 'Percent off is 1 to 100.', 'a percent is 1 to 100');
select throws_ok(format($$ select admin_set_custom_price(%L, 'fixed', 100, null, '2001-01-01', null) $$,
  (select cb from ids)), '22023', 'The end date has passed.', 'the end date is ahead');
select lives_ok(format($$ select admin_set_custom_price(%L, 'percent', null, 25, null, null) $$,
  (select cb from ids)), 'a percent off for good replaces it');
select results_eq(format($$ select custom_price_kind, custom_price_cents, custom_percent_off, custom_price_until
                           from subscription where company_id = %L $$, (select cb from ids)),
  $$ values ('percent'::text, null::int, 25::smallint, null::date) $$, 'only the percent is kept');
select lives_ok(format($$ select admin_set_custom_price(%L, null, null, null, null, null) $$,
  (select cb from ids)), 'and staff put the standard price back');
select is((select custom_price_kind from subscription where company_id = (select cb from ids)), null,
  'nothing is left of it');

-- 3. Package, codes, free months
select is(admin_set_services((select ca from ids), 'pool'), 'both', 'staff switch the package');
select is((select settings ->> 'services' from company where id = (select ca from ids)), 'pool',
  'the shop is Pool Maintenance now');
select throws_ok(format($$ select admin_set_services(%L, 'spa') $$, (select ca from ids)), '22023',
  null, 'only the three packages');
select admin_add_promo_code('STAFF3', 3, 10, 6, null, 1, null, 'staff@sundeck.test');
select is((admin_apply_promo((select ca from ids), 'staff3') ->> 'subscribed')::boolean, false,
  'staff apply a code to a shop on its trial');
select results_eq(format($$ select promo_code, promo_free_months::int, card_required,
                                  trial_ends_at >= created_at + interval '3 months'
                           from subscription where company_id = %L $$, (select ca from ids)),
  $$ values ('STAFF3', 3, false, true) $$, 'its trial runs to the code''s free months');
select is((admin_apply_promo((select cb from ids), 'STAFF3') ->> 'subscribed')::boolean, true,
  'and to a subscribed shop (the website gives the Stripe credit)');
select throws_ok(format($$ select admin_apply_promo(%L, 'NOPE') $$, (select ca from ids)), '22023',
  'No promo code NOPE.', 'an unknown code is named');
insert into st select 'trial', (select trial_ends_at from subscription where company_id = (select ca from ids));
select ok(admin_trial_months((select ca from ids), 2) > (select v::timestamptz from st where k = 'trial'),
  'free months lengthen a trial');
select throws_ok(format($$ select admin_trial_months(%L, 1) $$, (select cb from ids)), '22023',
  'Stripe bills this shop; its free months are a credit.', 'a subscribed shop gets a credit instead');
reset role;

-- 4. Refunds: an invoice of $649 paid by card on A's account.
select tests.authenticate_as((select owner_a from ids));
with x as (
  insert into job (company_id, property_id, bill_to_customer_id, status, fee_cents)
  values ((select ca from ids), (select prop_a from ids), (select cust_a from ids), 'in_progress', 64900)
  returning id)
insert into st select 'job', id from x;
insert into st select 'inv', create_invoice((select v::uuid from st where k = 'job'))::text;
select send_invoice((select v::uuid from st where k = 'inv'));
reset role;
set local role service_role;
select stripe_record_invoice_payment((select v::uuid from st where k = 'inv'), 'cs_r', 'pi_r', 64900,
  'card', 'succeeded', 'acct_a');
reset role;
insert into st select 'pay', (select id from payment where stripe_payment_intent_id = 'pi_r');
select is((select status from job where id = (select v::uuid from st where k = 'job')), 'paid', 'paid');

select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select payment_refund_info(%L) $$, (select v from st where k = 'pay')),
  '42501', null, 'techs can''t refund');
reset role;
select tests.authenticate_as((select owner_b from ids));
select throws_ok(format($$ select payment_refund_info(%L) $$, (select v from st where k = 'pay')),
  '42501', null, 'nor another shop''s owner');
select throws_ok($$ select stripe_record_refund('pi_r', 100, 100, 'acct_a') $$, '42501', null,
  'and nobody but the server records one');
reset role;
select tests.authenticate_as((select owner_a from ids));
select results_eq(format($$ select i ->> 'intent_id', i ->> 'account', (i ->> 'amount_cents')::int
                           from payment_refund_info(%L) i $$, (select v from st where k = 'pay')),
  $$ values ('pi_r', 'acct_a', 64900) $$, 'the owner gets what Stripe needs');
reset role;

set local role service_role;
-- The charge was $668.47 ($649 plus a $19.47 card fee).
select throws_ok($$ select stripe_record_refund('pi_r', 5000, 66847, 'acct_b') $$, '42501', null,
  'a refund only counts on the payment''s own shop''s account');
select results_eq($$ select (r ->> 'refunded_cents')::int, r ->> 'status', (r ->> 'changed')::boolean
                    from stripe_record_refund('pi_r', 5000, 66847, 'acct_a') r $$,
  $$ values (5000, 'succeeded', true) $$, 'part refunded');
select results_eq(format($$ select amount_cents, refunded_cents from payment where id = %L $$,
                         (select v from st where k = 'pay')),
  $$ values (59900, 5000) $$, 'the payment keeps what wasn''t refunded');
select results_eq(format($$ select status, amount_paid_cents from invoice where id = %L $$,
                         (select v from st where k = 'inv')),
  $$ values ('partially_paid'::text, 59900) $$, 'the invoice is partly paid again');
select is((select status from job where id = (select v::uuid from st where k = 'job')), 'invoiced',
  'and the job is back to invoiced');
select is((stripe_record_refund('pi_r', 5000, 66847, 'acct_a') ->> 'changed')::boolean, false,
  'the same event again changes nothing');
select is((stripe_record_refund('pi_r', 2000, 66847, 'acct_a') ->> 'refunded_cents')::int, 5000,
  'nor does an older one');
select results_eq($$ select (r ->> 'refunded_cents')::int, r ->> 'status'
                    from stripe_record_refund('pi_r', 66847, 66847, 'acct_a') r $$,
  $$ values (64900, 'refunded') $$, 'the rest refunded, card fee and all');
select results_eq(format($$ select amount_cents, refunded_cents, status from payment where id = %L $$,
                         (select v from st where k = 'pay')),
  $$ values (64900, 64900, 'refunded'::text) $$, 'refunded in full keeps its original amount');
select results_eq(format($$ select status, amount_paid_cents from invoice where id = %L $$,
                         (select v from st where k = 'inv')),
  $$ values ('sent'::text, 0) $$, 'the invoice is owed again');
select is(stripe_record_refund('pi_nothing', 1, 1, 'acct_a'), null, 'an unknown charge is ignored');
reset role;
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select payment_refund_info(%L) $$, (select v from st where k = 'pay')),
  '23514', null, 'a refunded payment can''t be refunded again');
reset role;

select * from finish();
rollback;
