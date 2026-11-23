-- Promo and referral codes (owner, 2026-11-23). Promo codes are staff-only; every shop has its
-- own referral code, which only its owner reads; one code per shop, before it subscribes; the
-- referring shop's free month is given once.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b,
  tests.make_company('c') as c, tests.make_company('d') as d;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (b ->> 'company')::uuid as cb, (b ->> 'owner')::uuid as owner_b,
  (c ->> 'company')::uuid as cc, (c ->> 'owner')::uuid as owner_c,
  (d ->> 'company')::uuid as cd, (d ->> 'owner')::uuid as owner_d
  from fx;
grant select on fx, ids to authenticated, service_role;

-- New shops waiting on their card, with a 30-day trial.
update subscription set status = 'trialing', trial_ends_at = now() + interval '30 days',
  card_required = true, stripe_subscription_id = null, plan = 'standard'
where company_id in (select unnest(array[ca, cb, cc, cd]) from ids);

-- Every shop has its own readable code.
select is((select count(distinct referral_code) from subscription
           where company_id in (select unnest(array[ca, cb, cc, cd]) from ids)), 4::bigint,
  'every shop has its own referral code');
select is((select referral_code from subscription where company_id = (select ca from ids)),
  'COMPANYA', 'it is the shop''s name, in capitals, letters and numbers only');
select is(app.referral_stem('Blue Wave Pools, LLC'), 'BLUEWAVEPOOLS',
  'without LLC, Inc and the like');
select is(app.make_referral_code('Company A Inc.'), 'COMPANYA2',
  'a number is added only when another shop has the name');
create temp table codes as select
  (select referral_code from subscription where company_id = (select ca from ids)) as ref_a,
  (select referral_code from subscription where company_id = (select cb from ids)) as ref_b;
grant select on codes to authenticated, service_role;

-- Owners read their own code, never another shop's; techs don't read billing.
select tests.authenticate_as((select owner_a from ids));
select is((select referral_code from subscription where company_id = (select ca from ids)),
  (select ref_a from codes), 'an owner reads their shop''s referral code');
select is((select count(*) from subscription where company_id = (select cb from ids)), 0::bigint,
  'but not another shop''s');
select is((referral_summary((select ca from ids)) ->> 'code'), (select ref_a from codes),
  'and sees it on the summary');
select throws_ok(format($$ select referral_summary(%L) $$, (select cb from ids)), '42501', null,
  'not another shop''s summary');
select throws_ok($$ select * from app.promo_code $$, '42501', null,
  'shops can''t read the promo code list');
select throws_ok($$ select admin_codes() $$, '42501', null, 'nor the portal''s list');
select throws_ok($$ select admin_add_promo_code('MINE', 12, 100, null, null, null, null, 'x') $$,
  '42501', null, 'nor make a code');
select throws_ok(format($$ select referral_reward(%L, 'trial') $$, (select ca from ids)),
  '42501', null, 'nor give themselves a reward');
reset role;

select tests.authenticate_as((select tech_a from ids));
select is((select count(*) from subscription), 0::bigint, 'techs read no billing rows');
select throws_ok(format($$ select referral_summary(%L) $$, (select ca from ids)), '42501', null,
  'nor the referral summary');
select throws_ok(format($$ select redeem_code(%L, 'X') $$, (select ca from ids)), '42501', null,
  'nor use a code');
reset role;

-- Staff make codes (service role, after the website checks staff and two-step).
set local role service_role;
select is(admin_add_promo_code(' meet 26 ', 3, 20, 12, null, 2, 'Pool meetup', 'staff@sundeck.test'),
  'MEET26', 'a promo code is saved in capitals, spaces dropped');
select is(admin_add_promo_code('once', 0, 50, null, null, 1, null, 'staff@sundeck.test'),
  'ONCE', 'a code can be a percent off for good, used once');
select throws_ok(format($$ select admin_add_promo_code(%L, 1, null, null, null, null, null, 'x') $$,
                        (select ref_b from codes)),
  '23505', 'That code is taken. Choose another.', 'a shop''s referral code can''t be a promo code');
select throws_ok($$ select admin_add_promo_code('vip26', 1, null, null, null, null, null, 'x') $$,
  '23505', 'That code is taken. Choose another.', 'nor a demo code');
select throws_ok($$ select admin_add_promo_code('EMPTY', 0, null, null, null, null, null, 'x') $$,
  '22023', 'Give the code free months, a percent off, or both.', 'an offer is needed');
select throws_ok($$ select admin_add_promo_code('LOTS', 13, null, null, null, null, null, 'x') $$,
  '22023', 'Free months are 0 to 12.', 'at most 12 free months');
reset role;

-- A shop uses a promo code: extra months on the trial, and the offer kept on the shop.
select tests.authenticate_as((select owner_a from ids));
select is((redeem_code((select ca from ids), ' meet-26 ') ->> 'kind'), 'promo',
  'the owner enters a promo code, any case, spaces and dashes ignored');
select is((redeem_code((select ca from ids), 'MEET26') ->> 'trial_ends_at')::timestamptz,
  now() + interval '3 months', '3 free months: the trial ends 3 months after sign-up');
reset role;
select results_eq(format($$ select promo_code, promo_kind, promo_free_months::int, promo_percent_off::int,
                                   promo_percent_months::int, trial_ends_at, promo_applied_at
                            from subscription where company_id = %L $$, (select ca from ids)),
  $$ values ('MEET26', 'promo', 3, 20, 12, now() + interval '3 months', now()) $$,
  'the code, its offer and when are recorded');
select tests.authenticate_as((select owner_a from ids));
select is((redeem_code((select ca from ids), 'MEET26') ->> 'free_months'), '3',
  'entering the same code again changes nothing');
select throws_ok(format($$ select redeem_code(%L, %L) $$, (select ca from ids), (select ref_b from codes)),
  '22023', 'Your shop already used code MEET26. It’s one code per shop.',
  'one code per shop: no referral code on top');
select throws_ok(format($$ select redeem_code(%L, 'NOPE') $$, (select ca from ids)),
  '22023', 'That code isn’t valid.', 'an unknown code is refused');
reset role;
select is((select trial_ends_at from subscription where company_id = (select ca from ids)),
  now() + interval '3 months', 'the trial was set once');

-- Referral codes: a month for the new shop; not your own.
select tests.authenticate_as((select owner_b from ids));
select throws_ok(format($$ select redeem_code(%L, %L) $$, (select cb from ids), (select ref_b from codes)),
  '22023', 'That’s your own shop’s code. Share it with other pool companies.',
  'a shop can''t use its own code');
reset role;

select tests.authenticate_as((select owner_c from ids));
select results_eq(format($$ select r ->> 'kind', r ->> 'free_months', r ->> 'referrer_name'
                            from redeem_code(%L, 'company a, llc') r $$, (select cc from ids)),
  $$ values ('referral', '1', 'Company a') $$, 'a new shop types another shop''s name as its code');
reset role;
select results_eq(format($$ select referred_by, trial_ends_at from subscription where company_id = %L $$,
                         (select cc from ids)),
  format($$ values (%L::uuid, now() + interval '30 days' + interval '1 month') $$, (select ca from ids)),
  'who referred it is recorded, and its trial is a month longer');

-- An owner of both shops can't refer themselves through the second.
insert into membership (company_id, user_id, role) select cd, owner_a, 'owner' from ids;
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select redeem_code(%L, %L) $$, (select cd from ids), (select ref_a from codes)),
  '22023', 'That code is from a shop you belong to. Share it with other pool companies.',
  'not through a second shop you own');
select results_eq(format($$ select r ->> 'used', r ->> 'earned' from referral_summary(%L) r $$, (select ca from ids)),
  $$ values ('1', '0') $$, 'the referrer sees one shop used its code, nothing earned yet');
reset role;

-- The referring shop's month, once.
set local role service_role;
select is(referral_reward((select cc from ids), 'trial'), true,
  'the referrer (no Stripe subscription yet) gets a month on its trial');
select is(referral_reward((select cc from ids), 'credit', 9900), false, 'and only once');
reset role;
select is((select trial_ends_at from subscription where company_id = (select ca from ids)),
  now() + interval '3 months' + interval '1 month',
  'a month was added to the referrer''s trial');
select results_eq(format($$ select referral_reward, referral_reward_cents, referral_rewarded_at
                            from subscription where company_id = %L $$, (select cc from ids)),
  $$ values ('trial', null::int, now()) $$, 'the reward and when are recorded on the referred shop');
select tests.authenticate_as((select owner_a from ids));
select results_eq(format($$ select r ->> 'used', r ->> 'earned' from referral_summary(%L) r $$, (select ca from ids)),
  $$ values ('1', '1') $$, 'and the referrer sees the month earned');
reset role;

-- Ended, turned-off and used-up codes; subscribed shops.
set local role service_role;
select lives_ok($$ select admin_set_promo_code_active('meet26', false) $$, 'staff turn a code off');
reset role;
update subscription set promo_code = null, promo_kind = null where company_id = (select cd from ids);
select tests.authenticate_as((select owner_d from ids));
select throws_ok(format($$ select redeem_code(%L, 'MEET26') $$, (select cd from ids)),
  '22023', 'That code isn’t valid.', 'a turned-off code is refused');
reset role;
select is((select promo_code from subscription where company_id = (select ca from ids)), 'MEET26',
  'and the shop that used it keeps it');

update subscription set stripe_subscription_id = 'sub_test_d', status = 'active'
where company_id = (select cd from ids);
select tests.authenticate_as((select owner_d from ids));
select throws_ok(format($$ select redeem_code(%L, 'ONCE') $$, (select cd from ids)),
  '22023', 'Codes are for shops that haven’t subscribed yet.', 'a subscribed shop can''t use a code');
reset role;
update subscription set stripe_subscription_id = null, status = 'trialing'
where company_id = (select cd from ids);
select tests.authenticate_as((select owner_d from ids));
select is((redeem_code((select cd from ids), 'once') ->> 'percent_off'), '50',
  'a percent-off code is applied');
reset role;
select is((select trial_ends_at from subscription where company_id = (select cd from ids)),
  now() + interval '30 days', 'without free months the trial is unchanged');
select tests.authenticate_as((select owner_b from ids));
select throws_ok(format($$ select redeem_code(%L, 'ONCE') $$, (select cb from ids)),
  '22023', 'That code isn’t valid.', 'a code used up is refused');
-- Demo codes still work from the same field.
select is((redeem_code((select cb from ids), 'vip26') ->> 'kind'), 'demo', 'demo codes still work');
reset role;

-- The portal sees who used what.
set local role service_role;
select is((select jsonb_array_length(p -> 'shops') from jsonb_array_elements(admin_codes() -> 'promo') p
           where p ->> 'code' = 'MEET26'), 1, 'the portal lists the shops that used a code');
select is((select r ->> 'referrer_name' from jsonb_array_elements(admin_codes() -> 'referrals') r
           where (r ->> 'id')::uuid = (select cc from ids)), 'Company a', 'and every referral');
select results_eq(format($$ select r ->> 'promo_code', r ->> 'referred_by_name', r ->> 'referral_code'
                            from jsonb_array_elements(admin_shops()) r where (r ->> 'id')::uuid = %L $$,
                         (select cc from ids)),
  format($$ values (%L, 'Company a', (select referral_code from subscription where company_id = %L)) $$,
         (select ref_a from codes), (select cc from ids)),
  'and each shop''s code and referrer');
select is((select (r ->> 'referrals')::int from jsonb_array_elements(admin_shops()) r
           where (r ->> 'id')::uuid = (select ca from ids)), 1, 'and how many it referred');
select is(jsonb_array_length(admin_shop_referrals((select ca from ids))), 1,
  'a shop''s page lists the shops it referred');
reset role;

select * from finish();
rollback;
