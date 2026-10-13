-- Billing (M10): an ended trial, a canceled subscription, or a long-past-due payment makes
-- the shop read-only for its members; reading still works, nothing is deleted, and the
-- server and customers are not blocked.
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

insert into subscription (company_id, status, trial_ends_at)
values ((select ca from ids), 'trialing', now() + interval '10 days')
on conflict (company_id) do update set status = 'trialing', trial_ends_at = excluded.trial_ends_at;

select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update job set summary_notes = 'trial' where id = %L $$, (select job_a from ids)),
  'during the trial, members work as usual');
select results_eq(format($$ select (company_access(%L) ->> 'locked')::boolean $$, (select ca from ids)),
  $$ values (false) $$, 'not read-only during the trial');
reset role;

-- The trial ends without a subscription.
update subscription set trial_ends_at = now() - interval '1 day' where company_id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ update job set summary_notes = 'late' where id = %L $$, (select job_a from ids)),
  'TL423', null, 'after the trial, members cannot change anything');
select throws_ok(format($$ insert into finding (company_id, job_id, title, severity_key)
                         values (%L, %L, 'Crack', 'minor') $$, (select ca from ids), (select job_a from ids)),
  'TL423', null, 'or add anything');
select is((select summary_notes from job where id = (select job_a from ids)), 'trial',
  'but everything can still be read');
select results_eq(format($$ select (company_access(%L) ->> 'locked')::boolean $$, (select ca from ids)),
  $$ values (true) $$, 'the app is told it is read-only');
reset role;

set local role service_role;
select lives_ok(format($$ update job set summary_notes = 'server' where id = %L $$, (select job_a from ids)),
  'the server is not blocked (webhooks, the daily job)');
reset role;

-- Subscribed: Stripe moves it to active.
update subscription set status = 'active', stripe_subscription_id = 'sub_test',
  current_period_end = now() + interval '30 days' where company_id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update job set summary_notes = 'paid' where id = %L $$, (select job_a from ids)),
  'once paid, members work again');
reset role;

-- A failed renewal: a week's grace, then read-only.
update subscription set status = 'past_due', current_period_end = now() - interval '3 days'
where company_id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update job set summary_notes = 'grace' where id = %L $$, (select job_a from ids)),
  'past due for 3 days: still working');
reset role;
update subscription set current_period_end = now() - interval '8 days' where company_id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ update job set summary_notes = 'x' where id = %L $$, (select job_a from ids)),
  'TL423', null, 'past due for 8 days: read-only');
reset role;

update subscription set status = 'canceled' where company_id = (select ca from ids);
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ update company set phone = '1' where id = %L $$, (select ca from ids)),
  'TL423', null, 'canceled: owners are read-only too');
reset role;

-- Another company is unaffected and can't look.
select tests.authenticate_as((select tech_b from ids));
select throws_ok(format('select company_access(%L)', (select ca from ids)), '42501', null,
  'other companies cannot see the billing state');
reset role;

select * from finish();
rollback;
