-- A failed payment locks the shop a week after it went past due, even though Stripe has
-- already moved the subscription's period a month ahead (security review, 2026-10-25).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a
  from fx;
grant select on ids to authenticated;

insert into subscription (company_id, status, stripe_subscription_id, current_period_end)
values ((select ca from ids), 'active', 'sub_pastdue', now() + interval '20 days')
on conflict (company_id) do update set status = 'active', stripe_subscription_id = 'sub_pastdue',
  current_period_end = excluded.current_period_end;
select is((select past_due_since from subscription where company_id = (select ca from ids)), null,
  'an active subscription is not past due');

-- The renewal fails: Stripe sends past_due with the new period, a month out.
update subscription set status = 'past_due', current_period_end = now() + interval '30 days'
where company_id = (select ca from ids);
select ok((select past_due_since > now() - interval '1 minute'
           from subscription where company_id = (select ca from ids)),
  'going past due is noted');
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update job set summary_notes = 'grace' where id = %L $$, (select job_a from ids)),
  'just past due: members still work');
reset role;

-- Later webhooks while still past due keep the date.
update subscription set past_due_since = now() - interval '8 days'
where company_id = (select ca from ids);
update subscription set current_period_end = now() + interval '22 days', updated_at = now()
where company_id = (select ca from ids);
select ok((select past_due_since < now() - interval '7 days'
           from subscription where company_id = (select ca from ids)),
  'another update while past due keeps when it started');
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ update job set summary_notes = 'x' where id = %L $$, (select job_a from ids)),
  'TL423', null, 'past due for 8 days, period still ahead: read-only');
select results_eq(format($$ select (company_access(%L) ->> 'locked')::boolean $$, (select ca from ids)),
  $$ values (true) $$, 'the app is told it is read-only');
reset role;

-- Paid: active again, and the date is cleared.
update subscription set status = 'active' where company_id = (select ca from ids);
select is((select past_due_since from subscription where company_id = (select ca from ids)), null,
  'paying clears it');
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update job set summary_notes = 'paid' where id = %L $$, (select job_a from ids)),
  'once paid, members work again');
reset role;

-- A second failure starts a fresh week.
update subscription set status = 'past_due' where company_id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update job set summary_notes = 'again' where id = %L $$, (select job_a from ids)),
  'a new failure gets a new week');
reset role;

select * from finish();
rollback;
