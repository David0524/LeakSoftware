-- Feedback loops (owner, 2026-10-22): the customer's first open of a report and a Stripe payment
-- are each told once, and the weekly summary email goes once per shop, week, and person, to the
-- owners and admins who want it, with the right numbers, and its link turns it off.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp table ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a, (a ->> 'quote')::uuid as quote_a,
  (a ->> 'invoice')::uuid as invoice_a, (a ->> 'report')::uuid as report_a,
  (b ->> 'company')::uuid as cb, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated;

-- Company A's clock: Phoenix (no daylight saving). Company B: New York.
update company set timezone = 'America/Phoenix' where id = (select ca from ids);
update company set timezone = 'America/New_York' where id = (select cb from ids);

-- ---------------------------------------------------------------------------
-- 1. The first open of a report
-- ---------------------------------------------------------------------------

update report set status = 'sent', sent_at = now() where id = (select report_a from ids);
create temp table tok as select token from share_link where report_id = (select report_a from ids);
grant select on tok to authenticated;

select is((select count(*)::int from activity where kind = 'report_opened'), 0,
  'the helper''s unopened links were not counted as opened');

select is((select record_report_opened((select token from tok)) ->> 'job_id'),
  (select job_a::text from ids), 'the first open is recorded and returned for the push');
select is((select record_report_opened((select token from tok))), null,
  'a second open returns nothing (no second push)');
select is((select count(*)::int from activity where kind = 'report_opened'
           and subject_id = (select report_a from ids) and deleted_at is null), 1,
  'one report_opened in Activity');
select isnt((select notified_at from activity where kind = 'report_opened'
             and subject_id = (select report_a from ids)), null, 'marked as told');
select is((select customer_name from activity where kind = 'report_opened'
           and subject_id = (select report_a from ids)), 'Customer a', 'with the customer''s name');
select is(record_report_opened('nope'), null, 'a made-up link records nothing');

-- A visit report isn't told (a pool route sends dozens).
create temp table visit (report_id uuid, token text);
with r as (
  insert into report (company_id, job_id, template_key, version, status, sent_at)
  select ca, job_a, 'maintenance', 1, 'sent', now() from ids returning id)
insert into visit (report_id) select id from r;
insert into share_link (company_id, job_id, report_id)
  select ca, job_a, (select report_id from visit) from ids;
update visit set token = (select token from share_link where report_id = visit.report_id);
select is(record_report_opened((select token from visit)), null, 'visit reports are left out');

-- A revoked link records nothing.
update share_link set revoked_at = now() where token = (select token from visit);
select is(record_report_opened((select token from visit)), null, 'a turned-off link: nothing');

-- Only the server calls it.
select tests.authenticate_as((select owner_a from ids));
select throws_ok($$ select record_report_opened('x') $$, '42501', null,
  'signed-in people can''t record opens');
select throws_ok($$ select claim_payment_notification('x') $$, '42501', null,
  'or claim payment pushes');
select throws_ok($$ select weekly_summaries_due() $$, '42501', null, 'or list weekly summaries');
select throws_ok($$ select weekly_summary_data((select ca from ids), '2026-10-12') $$, '42501',
  null, 'or read another way into the numbers');
reset role;
set role anon;
select throws_ok($$ select record_report_opened('x') $$, '42501', null, 'nor can customers');
reset role;

-- ---------------------------------------------------------------------------
-- 2. A payment's push, once
-- ---------------------------------------------------------------------------

insert into payment (company_id, invoice_id, amount_cents, method, status, paid_at,
                     stripe_checkout_session_id)
select ca, invoice_a, 65000, 'card', 'succeeded', now(), 'cs_test_once' from ids;
select is((select claim_payment_notification('cs_test_once') ->> 'amount_cents'), '65000',
  'the first claim returns the payment');
select is((select claim_payment_notification('cs_test_once') ->> 'customer_name'), null,
  'a retried webhook claims nothing');
select is(claim_payment_notification('cs_unknown'), null, 'an unknown session: nothing');
insert into payment (company_id, invoice_id, amount_cents, method, status,
                     stripe_checkout_session_id)
select ca, invoice_a, 1000, 'ach', 'pending', 'cs_test_pending' from ids;
select is(claim_payment_notification('cs_test_pending'), null, 'a pending bank payment: not yet');
update payment set status = 'succeeded', paid_at = now()
where stripe_checkout_session_id = 'cs_test_pending';
select isnt(claim_payment_notification('cs_test_pending'), null, 'once it settles, it''s told');

-- ---------------------------------------------------------------------------
-- 3. The weekly summary
-- ---------------------------------------------------------------------------

-- Monday Oct 19, 2026, 8:45 AM in Phoenix (15:45 UTC): A's last week is Oct 12 to 18.
select is(app.last_week_monday('2026-10-19'), '2026-10-12'::date, 'Monday: the week before');
select is(app.last_week_monday('2026-10-20'), '2026-10-12'::date, 'Tuesday: the same week');
select is(app.last_week_monday('2026-10-25'), '2026-10-12'::date, 'Sunday: still the same week');

select is(app.wants_weekly_summary('{}', 'owner'), true, 'owners: on unless turned off');
select is(app.wants_weekly_summary('{}', 'admin'), false, 'admins: off unless turned on');
select is(app.wants_weekly_summary('{"weekly": true}', 'admin'), true, 'an admin who turned it on');
select is(app.wants_weekly_summary('{"weekly": false}', 'owner'), false, 'an owner who turned it off');
select is(app.wants_weekly_summary('{"weekly": "no"}', 'owner'), true, 'only a real false turns it off');
select is(app.wants_weekly_summary('{"weekly": true}', 'tech'), false, 'never techs');

-- Who's due on Monday morning (the helper's rows are for whatever week the tests run in).
delete from weekly_summary where company_id in ((select ca from ids), (select cb from ids));
update profile set notification_prefs = '{"weekly": true}' where id = (select admin_a from ids);
create temp table due as
  select d from jsonb_array_elements(weekly_summaries_due('2026-10-19T15:45:00Z')) d;
select is((select d ->> 'week_of' from due where d ->> 'company_id' = (select ca::text from ids)),
  '2026-10-12', 'A is due for the week of Oct 12');
select is((select jsonb_array_length(d -> 'recipients') from due
           where d ->> 'company_id' = (select ca::text from ids)), 2,
  'its owner and the admin who turned it on, not the tech');
select is(jsonb_array_length(weekly_summaries_due('2026-10-21T15:45:00Z')), 0,
  'nobody on a Wednesday');
-- New York on Monday 12:30 AM local is still Sunday in Phoenix.
select is((select count(*)::int from jsonb_array_elements(weekly_summaries_due('2026-10-19T04:30:00Z')) d
           where d ->> 'company_id' = (select ca::text from ids)), 0,
  'each shop by its own clock (Sunday night in Phoenix)');
-- From 7 AM Monday in the shop's own time zone (owner, 2026-10-22; Phoenix is UTC-7).
select is((select count(*)::int from jsonb_array_elements(weekly_summaries_due('2026-10-19T13:30:00Z')) d
           where d ->> 'company_id' = (select ca::text from ids)), 0,
  'not yet at 6:30 AM Monday in Phoenix');
select is((select count(*)::int from jsonb_array_elements(weekly_summaries_due('2026-10-19T14:05:00Z')) d
           where d ->> 'company_id' = (select ca::text from ids)), 1,
  'due at 7:05 AM Monday in Phoenix');

-- Claims: once per shop, week, and person.
select isnt(claim_weekly_summary((select ca from ids), '2026-10-12', (select owner_a from ids),
  'a-owner@test.local'), null, 'the first run claims the owner''s');
select is(claim_weekly_summary((select ca from ids), '2026-10-12', (select owner_a from ids),
  'a-owner@test.local'), null, 'a second run doesn''t');
select is((select jsonb_array_length(d -> 'recipients') from jsonb_array_elements(
             weekly_summaries_due('2026-10-19T16:00:00Z')) d
           where d ->> 'company_id' = (select ca::text from ids)), 1,
  'claimed: only the admin is still due');

-- A failed send is tried again, up to 3 times.
select finish_weekly_summary((select token from weekly_summary where company_id = (select ca from ids)
  and week_of = '2026-10-12' and user_id = (select owner_a from ids)), false, null, 'Resend down');
select isnt(claim_weekly_summary((select ca from ids), '2026-10-12', (select owner_a from ids),
  'a-owner@test.local'), null, 'failed: claimed again (2nd try)');
select finish_weekly_summary((select token from weekly_summary where company_id = (select ca from ids)
  and week_of = '2026-10-12' and user_id = (select owner_a from ids)), false, null, 'Resend down');
select isnt(claim_weekly_summary((select ca from ids), '2026-10-12', (select owner_a from ids),
  'a-owner@test.local'), null, '3rd try');
select finish_weekly_summary((select token from weekly_summary where company_id = (select ca from ids)
  and week_of = '2026-10-12' and user_id = (select owner_a from ids)), false, null, 'Resend down');
select is(claim_weekly_summary((select ca from ids), '2026-10-12', (select owner_a from ids),
  'a-owner@test.local'), null, 'no 4th try');
select is((select status from weekly_summary where company_id = (select ca from ids)
  and week_of = '2026-10-12' and user_id = (select owner_a from ids)), 'failed', 'left as failed');

-- Sent.
select isnt(claim_weekly_summary((select ca from ids), '2026-10-12', (select admin_a from ids),
  'a-admin@test.local'), null, 'the admin''s');
select finish_weekly_summary((select token from weekly_summary where company_id = (select ca from ids)
  and week_of = '2026-10-12' and user_id = (select admin_a from ids)), true, 'em_1');
select is((select status || ' ' || provider_id from weekly_summary where company_id = (select ca from ids)
  and week_of = '2026-10-12' and user_id = (select admin_a from ids)), 'sent em_1', 'recorded as sent');
select is((select count(*)::int from jsonb_array_elements(weekly_summaries_due('2026-10-20T15:45:00Z')) d
           where d ->> 'company_id' = (select ca::text from ids)), 0,
  'Tuesday''s run sends nothing again');

-- A read-only (canceled) shop gets none.
update subscription set status = 'canceled' where company_id = (select cb from ids);
select is((select count(*)::int from jsonb_array_elements(weekly_summaries_due('2026-10-19T15:45:00Z')) d
           where d ->> 'company_id' = (select cb::text from ids)), 0, 'not for a canceled shop');

-- The numbers, for A's week of Oct 12 (Phoenix).
create temp table wk as select
  gen_random_uuid() as j1, gen_random_uuid() as j2, gen_random_uuid() as j3,
  gen_random_uuid() as j4, gen_random_uuid() as q1, gen_random_uuid() as q2;
insert into job (id, company_id, property_id, bill_to_customer_id, type, status, scheduled_start)
select w.j1, i.ca, j.property_id, j.bill_to_customer_id, 'maintenance', 'scheduled', '2026-10-13T16:00:00Z'::timestamptz
from wk w, ids i, job j where j.id = i.job_a
union all
select w.j2, i.ca, j.property_id, j.bill_to_customer_id, 'maintenance', 'scheduled', '2026-10-14T16:00:00Z'::timestamptz
from wk w, ids i, job j where j.id = i.job_a
union all
-- Next week (Oct 19 to 25): two scheduled, one canceled.
select w.j3, i.ca, j.property_id, j.bill_to_customer_id, 'repair', 'scheduled', '2026-10-20T16:00:00Z'::timestamptz
from wk w, ids i, job j where j.id = i.job_a
union all
select w.j4, i.ca, j.property_id, j.bill_to_customer_id, 'repair', 'scheduled', '2026-10-21T16:00:00Z'::timestamptz
from wk w, ids i, job j where j.id = i.job_a;
update job set scheduled_start = '2026-10-25T23:00:00Z' where id = (select job_a from ids);
update job set status = 'canceled' where id = (select j4 from wk);
-- Completions, recorded by Activity: j1 twice (one job), j2 once, and the leak job just after
-- the week ends in Phoenix (Mon Oct 19, 00:30 local).
insert into activity (company_id, kind, job_id, subject_id, created_at)
select ca, 'job_completed', (select j1 from wk), (select j1 from wk), '2026-10-13T18:00:00Z'::timestamptz from ids
union all select ca, 'job_completed', (select j1 from wk), (select j1 from wk), '2026-10-14T18:00:00Z' from ids
union all select ca, 'job_completed', (select j2 from wk), (select j2 from wk), '2026-10-19T06:59:00Z' from ids
union all select ca, 'job_completed', job_a, job_a, '2026-10-19T07:30:00Z' from ids;
-- Money: 650.00 paid in the week, 10.00 the week before; the helper's invoice is still a draft.
update payment set paid_at = '2026-10-15T20:00:00Z' where stripe_checkout_session_id = 'cs_test_once';
update payment set paid_at = '2026-10-09T20:00:00Z' where stripe_checkout_session_id = 'cs_test_pending';
select set_config('app.invoice_server', 'on', true);
update invoice set status = 'sent', sent_at = now(), total_cents = 100000, amount_paid_cents = 65000
where id = (select invoice_a from ids);
select set_config('app.invoice_server', '', true);
-- Quotes waiting: two sent, the older first; the helper's quote is accepted.
select set_config('app.quote_server', 'on', true);
insert into quote (id, company_id, job_id, total_cents, status, sent_at)
select (select q1 from wk), ca, (select j1 from wk), 125000, 'sent', '2026-10-01T16:00:00Z'::timestamptz from ids
union all
select (select q2 from wk), ca, (select j2 from wk), 30000, 'sent', '2026-10-10T16:00:00Z' from ids;
update quote set status = 'accepted', accepted_at = now() where id = (select quote_a from ids);
select set_config('app.quote_server', '', true);

create temp table summary as select weekly_summary_data((select ca from ids), '2026-10-12') as s;
select is((select s -> 'jobs_done' from summary), '{"maintenance": 2}'::jsonb,
  'jobs done: each job once, by type, inside the shop''s week');
select is((select (s ->> 'collected_cents')::int from summary), 65000, 'collected in the week');
select is((select (s ->> 'owed_cents')::int from summary), 35000, 'still owed on open invoices');
select is((select (s ->> 'owed_count')::int from summary), 1, 'on one invoice');
select is((select s -> 'quotes_waiting' ->> 'count' from summary), '2', 'two quotes waiting');
select is((select s -> 'quotes_waiting' ->> 'total_cents' from summary), '155000', 'their total');
select is((select s -> 'quotes_waiting' -> 'oldest' -> 0 ->> 'total_cents' from summary), '125000',
  'oldest first');
select is((select s -> 'quotes_waiting' -> 'oldest' -> 0 ->> 'customer_name' from summary),
  'Customer a', 'named');
select is((select (s ->> 'scheduled_next')::int from summary), 2,
  'next week: scheduled jobs, not canceled ones');
select is((select s -> 'company' ->> 'name' from summary), 'Company a', 'with the shop''s name');

-- The turn-off link.
create temp table off as select token from weekly_summary
  where company_id = (select ca from ids) and user_id = (select admin_a from ids);
grant select on off to anon;
set role anon;
select is((select weekly_summary_link((select token from off)) ->> 'company_name'), 'Company a',
  'the link shows the shop');
select is(weekly_summary_off((select token from off)), true, 'Turn Off works signed out');
select is(weekly_summary_off('nope'), false, 'a made-up link does nothing');
select throws_ok($$ select * from weekly_summary $$, '42501', null, 'customers can''t read the table');
reset role;
select is((select notification_prefs -> 'weekly' from profile where id = (select admin_a from ids)),
  'false'::jsonb, 'that person''s Weekly Summary is off');
select is((select notification_prefs from profile where id = (select admin_a from ids)) ? 'weekly',
  true, 'other choices are kept');

-- Owners read their own shop's rows; admins and techs read none; nobody writes.
select tests.authenticate_as((select owner_a from ids));
select ok((select count(*) from weekly_summary) >= 1, 'owners see their shop''s summaries');
select is((select count(*)::int from weekly_summary where company_id = (select cb from ids)), 0,
  'not another shop''s');
select throws_ok($$ update weekly_summary set status = 'sent' $$, '42501', null, 'owners can''t write it');
reset role;
select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from weekly_summary), 0, 'techs see none');
reset role;

select * from finish();
rollback;
