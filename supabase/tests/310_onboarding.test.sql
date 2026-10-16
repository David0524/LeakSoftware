-- New-shop onboarding (owner, 2026-10-16): when the server requires a card, the shop is
-- read-only until Checkout makes the subscription; members are told so. Owners can read
-- their answers but never write them or the card requirement.
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

insert into subscription (company_id, status, trial_ends_at, card_required, onboarding)
values ((select ca from ids), 'trialing', now() + interval '14 days', true, '{"goal": "repairs"}')
on conflict (company_id) do update set status = 'trialing', trial_ends_at = excluded.trial_ends_at,
  card_required = true, onboarding = excluded.onboarding, stripe_subscription_id = null,
  onboarded_at = null;

select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ update job set summary_notes = 'no card' where id = %L $$, (select job_a from ids)),
  'TL423', null, 'before the card, the shop is read-only');
select results_eq(format($$ select company_access(%L) ->> 'needs_card', company_access(%L) ->> 'onboarded',
                                   company_access(%L) ->> 'locked' $$,
                         (select ca from ids), (select ca from ids), (select ca from ids)),
  $$ values ('true', 'false', 'true') $$, 'members are told a card is needed');
select is((select onboarding ->> 'goal' from subscription where company_id = (select ca from ids)), 'repairs',
  'owners can read their answers');
select throws_ok(format($$ update subscription set card_required = false where company_id = %L $$, (select ca from ids)),
  '42501', null, 'owners cannot drop the card requirement');
reset role;

-- Checkout made the subscription.
update subscription set stripe_subscription_id = 'sub_onb', onboarded_at = now()
where company_id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update job set summary_notes = 'card in' where id = %L $$, (select job_a from ids)),
  'with the card in, the trial works as usual');
select results_eq(format($$ select company_access(%L) ->> 'needs_card', company_access(%L) ->> 'onboarded' $$,
                         (select ca from ids), (select ca from ids)),
  $$ values ('false', 'true') $$, 'and nothing is left to do');
reset role;

select * from finish();
rollback;
