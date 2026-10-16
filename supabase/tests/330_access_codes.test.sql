-- Demo codes (owner, 2026-10-16): VIP26 lets a new shop in without a card; wrong or
-- turned-off codes are refused; only the shop's owner can use one.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'job')::uuid as job_a
  from fx;
grant select on ids to authenticated, anon, service_role;

-- A new shop waiting on its card: read-only.
insert into subscription (company_id, status, trial_ends_at, card_required)
values ((select ca from ids), 'trialing', now() + interval '14 days', true)
on conflict (company_id) do update set status = 'trialing', trial_ends_at = excluded.trial_ends_at,
  card_required = true, stripe_subscription_id = null, plan = 'standard', access_code = null;

select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select redeem_access_code(%L, 'VIP26') $$, (select ca from ids)),
  '42501', null, 'techs cannot use a code');
reset role;

select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select redeem_access_code(%L, 'VIP25') $$, (select ca from ids)),
  '22023', 'That code isn''t valid.', 'a wrong code is refused');
select lives_ok(format($$ select redeem_access_code(%L, ' vip26 ') $$, (select ca from ids)),
  'VIP26 works, in any case and with spaces around it');
select results_eq(format($$ select company_access(%L) ->> 'plan', company_access(%L) ->> 'locked',
                                   company_access(%L) ->> 'needs_card' $$,
                         (select ca from ids), (select ca from ids), (select ca from ids)),
  $$ values ('demo', 'false', 'false') $$, 'the shop is a demo shop: no card needed, not read-only');
select lives_ok(format($$ update job set summary_notes = 'in with a code' where id = %L $$, (select job_a from ids)),
  'and its team can work');
reset role;
select is((select access_code from subscription where company_id = (select ca from ids)), 'VIP26',
  'the code used is recorded');

-- A code turned off stops new shops using it.
update app.access_code set active = false where code = 'VIP26';
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select redeem_access_code(%L, 'VIP26') $$, (select ca from ids)),
  '22023', 'That code isn''t valid.', 'a turned-off code is refused');
reset role;

select * from finish();
rollback;
