-- Quotes (M8): totals, sending, frozen quotes, acceptance online and on site, the repair
-- job, and Stripe payments recorded once.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'job')::uuid as job_a, (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on ids to authenticated, anon, service_role;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon, service_role;

-- 8.25% tax. The figures match QUOTE_FIXTURE in packages/core/test/quote.test.ts.
update company set settings = jsonb_set(settings, '{tax_rate_bps}', '825') where id = (select ca from ids);

select tests.authenticate_as((select tech_a from ids));
with x as (
  insert into quote (company_id, job_id, discount_cents)
  values ((select ca from ids), (select job_a from ids), 10000) returning id)
insert into st select 'q1', id from x;
insert into quote_line_item (company_id, quote_id, finding_id, description, quantity, unit_price_cents, taxable, sort_order)
select (select ca from ids), (select v::uuid from st where k = 'q1'),
       (select id from finding where job_id = (select job_a from ids) limit 1), d, qty, price, tx, n
from (values ('Repair return line', 1.0, 85000, true, 1), ('Fittings', 2.5, 12999, true, 2),
             ('Labor', 1.0, 15000, false, 3)) v(d, qty, price, tx, n);

insert into st select 'sent1', send_quote((select v::uuid from st where k = 'q1'))::text;
select ok((select length(v::jsonb ->> 'token') = 32 from st where k = 'sent1'), 'sending returns a customer link');
select results_eq(
  format('select subtotal_cents, discount_cents, tax_cents, total_cents, deposit_cents, status from quote where id = %L',
         (select v from st where k = 'q1')),
  $$ values (132498, 10000, 8962, 131460, 65730, 'sent') $$,
  'the server computes the same totals and the 50% deposit');
select is((select deposit_rule ->> 'value_bps' from quote where id = (select v::uuid from st where k = 'q1')),
  '5000', 'the deposit rule is copied onto the quote');
select ok((select valid_until is not null from quote where id = (select v::uuid from st where k = 'q1')),
  'a sent quote has a valid-until date');
select is((select status from finding where job_id = (select job_a from ids) limit 1), 'quoted',
  'findings on the quote are marked quoted');
select is(send_quote((select v::uuid from st where k = 'q1')) ->> 'token',
  (select v::jsonb ->> 'token' from st where k = 'sent1'), 'sending again returns the same link');

select throws_ok(format($$ update quote set discount_cents = 0 where id = %L $$, (select v from st where k = 'q1')),
  '23514', null, 'a sent quote cannot be edited');
select throws_ok(format($$ insert into quote_line_item (company_id, quote_id, description, unit_price_cents) values (%L, %L, 'Extra', 100) $$,
  (select ca from ids), (select v from st where k = 'q1')), '23514', null, 'nor can lines be added');

-- Other companies cannot send it.
reset role;
select tests.authenticate_as((select tech_b from ids));
select throws_ok(format($$ select send_quote(%L) $$, (select v from st where k = 'q1')),
  '42501', null, 'another company cannot send the quote');
reset role;

-- Tech discount limit (10%): a tech cannot send 20% off; an owner can.
select tests.authenticate_as((select tech_a from ids));
with x as (
  insert into quote (company_id, job_id, discount_cents)
  values ((select ca from ids), (select job_a from ids), 2000) returning id)
insert into st select 'q2', id from x;
insert into quote_line_item (company_id, quote_id, description, unit_price_cents)
values ((select ca from ids), (select v::uuid from st where k = 'q2'), 'Patch', 10000);
select throws_ok(format($$ select send_quote(%L) $$, (select v from st where k = 'q2')),
  '23514', null, 'a tech cannot send a discount over the limit');
reset role;
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ select send_quote(%L) $$, (select v from st where k = 'q2')),
  'an owner can');
reset role;

-- The customer page, signed out.
set local role anon;
select is((select (quote_for_token((select v::jsonb ->> 'token' from st where k = 'sent1')) ->> 'total_cents')::int),
  131460, 'the customer link shows the quote');
select is((select jsonb_array_length(quote_for_token((select v::jsonb ->> 'token' from st where k = 'sent1')) -> 'lines')),
  3, 'with its lines');
select is((select (quote_for_token((select v::jsonb ->> 'token' from st where k = 'sent1')) ->> 'can_pay')::boolean),
  false, 'no pay button until the shop can take payments');
select is(quote_for_token('nope'), null, 'an unknown link shows nothing');

select throws_ok(format($$ select accept_quote_by_link(%L, 'Sam', false) $$, (select v::jsonb ->> 'token' from st where k = 'sent1')),
  '23514', null, 'accepting needs the terms box');
select throws_ok(format($$ select accept_quote_by_link(%L, '  ', true) $$, (select v::jsonb ->> 'token' from st where k = 'sent1')),
  '23514', null, 'and a name');
select is(accept_quote_by_link((select v::jsonb ->> 'token' from st where k = 'sent1'), 'Sam Customer', true,
  '203.0.113.9', 'Test browser') ->> 'status', 'accepted', 'the customer accepts online');
select is(accept_quote_by_link((select v::jsonb ->> 'token' from st where k = 'sent1'), 'Sam Customer', true) ->> 'already',
  'true', 'accepting twice changes nothing');
select throws_ok($$ select * from quote $$, '42501', null, 'signed out, quotes themselves stay closed');
reset role;

select results_eq(
  format('select accepted_by_name, host(accepted_ip), accepted_user_agent from quote where id = %L', (select v from st where k = 'q1')),
  $$ values ('Sam Customer', '203.0.113.9', 'Test browser') $$, 'who accepted, from where, is recorded');
select results_eq(
  format('select j.type, j.status, j.parent_job_id, j.property_id from quote q join job j on j.id = q.repair_job_id where q.id = %L',
         (select v from st where k = 'q1')),
  format('select %L, %L, %L::uuid, property_id from job where id = %L', 'repair', 'unscheduled',
         (select job_a from ids), (select job_a from ids)),
  'accepting creates an unscheduled repair job for the same pool');

-- Expired quotes cannot be accepted.
select set_config('app.quote_server', 'on', true);
update quote set valid_until = current_date - 5 where id = (select v::uuid from st where k = 'q2');
select set_config('app.quote_server', 'off', true);
insert into st select 'tok2', token from share_link where quote_id = (select v::uuid from st where k = 'q2');
set local role anon;
select throws_ok(format($$ select accept_quote_by_link(%L, 'Sam', true) $$,
  (select v from st where k = 'tok2')),
  '23514', null, 'an expired quote cannot be accepted');
select is((select quote_for_token((select v from st where k = 'tok2')) ->> 'status'),
  'expired', 'and shows as expired');
reset role;

-- On site: a quote_acceptance signature synced from the phone accepts a draft.
select tests.authenticate_as((select tech_a from ids));
with x as (
  insert into quote (company_id, job_id) values ((select ca from ids), (select job_a from ids)) returning id)
insert into st select 'q3', id from x;
insert into quote_line_item (company_id, quote_id, description, unit_price_cents)
values ((select ca from ids), (select v::uuid from st where k = 'q3'), 'Skimmer rebuild', 40000);
insert into signature (company_id, job_id, quote_id, purpose, signer_name, signed_at)
values ((select ca from ids), (select job_a from ids), (select v::uuid from st where k = 'q3'),
        'quote_acceptance', 'Pat Pool', now());
reset role;
select results_eq(
  format('select status, accepted_by_name, total_cents, deposit_cents, repair_job_id is not null from quote where id = %L',
         (select v from st where k = 'q3')),
  $$ values ('accepted', 'Pat Pool', 43300, 21650, true) $$,
  'an on-site signature accepts the quote with its totals locked');
select ok(exists (select 1 from share_link where quote_id = (select v::uuid from st where k = 'q3')),
  'and gives it a customer link for paying the deposit');

-- Stripe, as the server.
select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select stripe_claim_event('evt_x', 'test') $$, '42501', null,
  'members cannot call the Stripe functions');
reset role;
set local role anon;
select throws_ok(format($$ select stripe_record_quote_payment(%L, 'cs_x', null, 1, 'card', 'succeeded', 'acct_a') $$,
  (select v from st where k = 'q1')), '42501', null, 'nor can visitors');
reset role;

set local role service_role;
select is(stripe_claim_event('evt_1', 'checkout.session.completed'), true, 'a new event is claimed');
select is(stripe_claim_event('evt_1', 'checkout.session.completed'), false, 'a replayed event is not');
select is(stripe_event_seen('evt_1'), true, 'and is known as handled');
select is(stripe_record_quote_payment((select v::uuid from st where k = 'q1'), 'cs_ach', null, 65730, 'ach', 'pending', 'acct_a'),
  'pending', 'a bank payment starts pending');
select is(stripe_record_quote_payment((select v::uuid from st where k = 'q1'), 'cs_ach', 'pi_ach', 65730, 'ach', 'succeeded', 'acct_a'),
  'succeeded', 'and succeeds when the bank confirms');
select is(stripe_record_quote_payment((select v::uuid from st where k = 'q1'), 'cs_ach', null, 65730, 'ach', 'pending', 'acct_a'),
  'succeeded', 'a late pending event does not undo it');
select is((select (quote_checkout_details((select v::jsonb ->> 'token' from st where k = 'sent1')) ->> 'deposit_paid')::boolean),
  true, 'checkout knows the deposit is paid');
select lives_ok(format($$ select stripe_save_account(null, %L, true, true, true) $$, 'acct_a'),
  'account.updated turns on charges');
reset role;
select results_eq(
  format('select count(*)::int, min(status), min(paid_at) is not null from payment where quote_id = %L', (select v from st where k = 'q1')),
  $$ values (1, 'succeeded', true) $$, 'one payment, succeeded, with the paid date');
set local role anon;
select is((select (quote_for_token((select v::jsonb ->> 'token' from st where k = 'sent1')) ->> 'can_pay')::boolean),
  true, 'the pay button appears once charges are enabled');
reset role;

select * from finish();
rollback;
