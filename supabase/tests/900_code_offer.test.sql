-- A sign-up link's code (owner, 2026-11-23): the website's server asks what one code gives,
-- before the person has an account. Only working promo codes and shops' referral codes answer;
-- it never lists codes, and visitors and shops can't call it.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
create temp view ids as select (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a from fx;
grant select on fx, ids to authenticated, service_role;

set local role service_role;
select lives_ok($$ select admin_add_promo_code('SPLASH90', 3, null, null, null, null, 'Meetup', 'staff@sundeck.test') $$,
  'staff make a promo code');
select lives_ok($$ select admin_add_promo_code('HALF', 0, 50, 12, null, null, null, 'staff@sundeck.test') $$,
  'and a percent-off one');
select lives_ok($$ select admin_add_promo_code('GONE', 1, null, null, null, null, null, 'staff@sundeck.test') $$,
  'and one they will turn off');
select lives_ok($$ select admin_set_promo_code_active('GONE', false) $$, 'turned off');

select is(code_offer('splash90'),
  '{"kind": "promo", "code": "SPLASH90", "free_months": 3, "percent_off": null, "percent_months": null}'::jsonb,
  'a promo code''s offer, any case');
select is(code_offer(' Splash-90 ') ->> 'code', 'SPLASH90', 'spaces and dashes ignored');
select is((code_offer('half') ->> 'percent_off')::int, 50, 'a percent off');
select is(code_offer('GONE'), null, 'a turned-off code answers nothing');
select is(code_offer('NOPE'), null, 'nor an unknown code');
select is(code_offer('vip26'), null, 'nor a demo code');
select is(code_offer(''), null, 'nor nothing');
select is(code_offer(null), null, 'nor null');
select results_eq($$ select r ->> 'kind', r ->> 'code', r ->> 'free_months', r ->> 'referrer_name'
                     from code_offer('Company A, LLC') r $$,
  $$ values ('referral', 'COMPANYA', '1', 'Company a') $$,
  'a shop''s name is its referral code, with its LLC too');
reset role;

-- Ended and used-up codes, as redeem_code decides.
set local role service_role;
select lives_ok($$ select admin_add_promo_code('ONCE', 1, null, null, null, 1, null, 'staff@sundeck.test') $$,
  'a code for one shop');
reset role;
update subscription set status = 'trialing', stripe_subscription_id = null, plan = 'standard',
  promo_code = null, promo_kind = null
where company_id = (select ca from ids);
select tests.authenticate_as((select owner_a from ids));
select is(redeem_code((select ca from ids), 'once') ->> 'kind', 'promo', 'a shop uses it');
reset role;
set local role service_role;
select is(code_offer('ONCE'), null, 'a used-up code answers nothing');
reset role;

-- Never for visitors or shops.
select ok(not has_function_privilege('anon', 'public.code_offer(text)', 'execute'),
  'visitors can''t ask');
select tests.authenticate_as((select owner_a from ids));
select throws_ok($$ select code_offer('SPLASH90') $$, '42501', null, 'nor shops');
reset role;

select * from finish();
rollback;
