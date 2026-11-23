-- Referral codes end on a whole word (20261022005300_referral_code_words.sql).
begin;
set search_path = public, extensions;
select no_plan();

select is(app.referral_stem('Canyon State Leak Detections'), 'CANYONSTATELEAK',
  'a long name keeps the whole words that fit in 20 letters');
select is(app.referral_stem('Blue Wave Pools, LLC'), 'BLUEWAVEPOOLS', 'a short name is unchanged');
select is(app.referral_stem('Cole''s Pool Cleaning'), 'COLESPOOLCLEANING', 'exactly as before when it fits');
select is(app.referral_stem('Supercalifragilisticexpialidocious Pools'), 'SUPERCALIFRAGILISTIC',
  'a first word longer than 20 is cut');
select is(app.referral_stem('Canyon State Leak Detections LLC'), 'CANYONSTATELEAK',
  'the company-type ending is dropped first');

-- A new shop with a long name gets the whole-word code, and typing its full name finds it.
create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, service_role;
update company set name = 'Canyon State Leak Detections' where id = (select (a ->> 'company')::uuid from fx);
update subscription set referral_code = null where company_id = (select (a ->> 'company')::uuid from fx);
update subscription set referral_code = app.make_referral_code('Canyon State Leak Detections')
  where company_id = (select (a ->> 'company')::uuid from fx);
select is((select referral_code from subscription where company_id = (select (a ->> 'company')::uuid from fx)),
  'CANYONSTATELEAK', 'the shop''s code ends on a whole word');

update subscription set status = 'trialing', trial_ends_at = now() + interval '30 days',
  card_required = true, stripe_subscription_id = null
  where company_id = (select (b ->> 'company')::uuid from fx);
select tests.authenticate_as((select (b ->> 'owner')::uuid from fx));
select lives_ok(format($$ select redeem_code(%L, 'Canyon State Leak Detections') $$,
  (select (b ->> 'company')::uuid from fx)), 'typing the full name finds the shop');
reset role;
select is((select referred_by from subscription where company_id = (select (b ->> 'company')::uuid from fx)),
  (select (a ->> 'company')::uuid from fx), 'and the new shop is referred by it');

select * from finish();
rollback;
