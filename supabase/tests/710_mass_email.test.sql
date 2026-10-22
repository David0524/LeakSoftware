-- Email Customers (owner, 2026-10-22): the filter picks the right customers and leaves out those
-- without an email or unsubscribed; only owners and admins count, start, or read campaigns; a
-- campaign is checked against the confirmed count; results total it; and the unsubscribe link
-- stops later mass emails (and reminders) without touching another shop.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp table ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a, (a ->> 'customer')::uuid as cust_a,
  (b ->> 'company')::uuid as cb, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated;

-- Company A's customers: the helper's "Customer a" (homeowner, c@example.com, a pool on 1 Test St
-- with a job in progress), plus:
--   Rosa   homeowner in Mesa, on a plan, a job 10 days ago
--   Blue   pool company in Phoenix, no plan, no jobs
--   Nora   homeowner, no email
--   Uma    homeowner, unsubscribed
--   Gone   deleted
insert into customer (id, company_id, name, kind, email, marketing_opt_out, deleted_at)
select v.id, ca, v.name, v.kind, v.email, v.opt, v.del from ids, (values
  ('00000000-0000-7000-8000-000000000001'::uuid, 'Rosa Diaz', 'homeowner', 'rosa@example.com', false, null::timestamptz),
  ('00000000-0000-7000-8000-000000000002'::uuid, 'Blue Pools LLC', 'pool_company', ' blue@example.com ', false, null),
  ('00000000-0000-7000-8000-000000000003'::uuid, 'Nora No Email', 'homeowner', '  ', false, null),
  ('00000000-0000-7000-8000-000000000004'::uuid, 'Uma Unsub', 'homeowner', 'uma@example.com', true, null),
  ('00000000-0000-7000-8000-000000000005'::uuid, 'Gone Customer', 'homeowner', 'gone@example.com', false, now())
) v(id, name, kind, email, opt, del);
insert into property (company_id, customer_id, address_line1, city)
select ca, v.cust, v.street, v.city from ids, (values
  ('00000000-0000-7000-8000-000000000001'::uuid, '2 Elm', ' mesa '),
  ('00000000-0000-7000-8000-000000000002'::uuid, '3 Oak', 'Phoenix'),
  ('00000000-0000-7000-8000-000000000004'::uuid, '4 Ash', 'Mesa')) v(cust, street, city);
insert into service_plan (company_id, customer_id, property_id, starts_on)
select ca, '00000000-0000-7000-8000-000000000001'::uuid,
  (select id from property where customer_id = '00000000-0000-7000-8000-000000000001'), current_date - 30
from ids;
insert into job (company_id, property_id, bill_to_customer_id, status, scheduled_start)
select ca, (select id from property where customer_id = '00000000-0000-7000-8000-000000000001'),
  '00000000-0000-7000-8000-000000000001'::uuid, 'scheduled', now() - interval '10 days'
from ids;
-- The helper's job has no date: give it one long ago, so "Last 30 days" leaves Customer a out.
update job set scheduled_start = now() - interval '200 days'
where company_id = (select ca from ids) and bill_to_customer_id = (select cust_a from ids);

-- ---------------------------------------------------------------------------
-- Counting
-- ---------------------------------------------------------------------------

select tests.authenticate_as((select owner_a from ids));
select is(email_audience_count((select ca from ids), '{}'),
  '{"recipients": 3, "no_email": 1, "unsubscribed": 1}'::jsonb,
  'All Customers: 3 with an email, 1 without, 1 unsubscribed; deleted ones not counted');
select is(email_audience_count((select ca from ids), '{"show": "plan"}') ->> 'recipients', '2',
  'On a Plan: Rosa and Customer a (the helper gives them a plan)');
select is(email_audience_count((select ca from ids), '{"show": "no_plan"}'),
  '{"recipients": 1, "no_email": 1, "unsubscribed": 1}'::jsonb, 'No Plan: everyone else');
select is(email_audience_count((select ca from ids), '{"show": "pool_company"}') ->> 'recipients',
  '1', 'a customer kind');
select is(email_audience_count((select ca from ids), '{"city": "MESA"}'),
  '{"recipients": 1, "no_email": 0, "unsubscribed": 1}'::jsonb,
  'a city, in any case and with extra spaces');
select is(email_audience_count((select ca from ids), '{"days": 30}') ->> 'recipients', '1',
  'had a job in the last 30 days: Rosa only');
select is(email_audience_count((select ca from ids), '{"days": 365}') ->> 'recipients', '2',
  'in the last year: Rosa and Customer a');
select is(email_audience_count((select ca from ids), '{"show": "plan", "city": "Phoenix"}') ->> 'recipients',
  '0', 'filters combine');

select is(jsonb_array_length(email_campaign_setup((select ca from ids)) -> 'cities'), 2,
  'cities: Mesa and Phoenix, each once');
select is(lower(email_campaign_setup((select ca from ids)) -> 'cities' ->> 0), 'mesa',
  'cities A to Z, as typed (trimmed)');
select is((email_campaign_setup((select ca from ids)) ->> 'used_today')::int, 0, 'nothing sent today');

select throws_ok(format('select email_audience_count(%L, ''{}'')', (select cb from ids)),
  '42501', null, 'not another shop''s customers');
reset role;

select tests.authenticate_as((select admin_a from ids));
select is(email_audience_count((select ca from ids), '{}') ->> 'recipients', '3', 'admins count too');
reset role;

select tests.authenticate_as((select tech_a from ids));
select throws_ok(format('select email_audience_count(%L, ''{}'')', (select ca from ids)),
  '42501', null, 'techs can''t');
select throws_ok(format('select start_email_campaign(%L, ''Hi'', ''Hello'', ''{}'', 3)', (select ca from ids)),
  '42501', null, 'techs can''t send');
select is((select count(*)::int from email_campaign), 0, 'techs don''t see the history');
reset role;

-- ---------------------------------------------------------------------------
-- Starting and finishing
-- ---------------------------------------------------------------------------

select tests.authenticate_as((select owner_a from ids));
select throws_ok(format('select start_email_campaign(%L, ''Fall'', ''Hi {first name}'', ''{}'', 4)',
  (select ca from ids)), 'P0001', 'list_changed: 3 now, 4 confirmed', 'a count that moved writes nothing');
select throws_ok(format('select start_email_campaign(%L, ''Fall'', ''Hi'', ''{"show": "builder"}'', 0)',
  (select ca from ids)), 'P0001', 'nobody: no customers to send to', 'an empty list sends nothing');

create temp table started as
  select start_email_campaign((select ca from ids), ' Fall opening ', 'Hi {first name}', '{}', 3) as r;
grant select on started to authenticated;
select is(jsonb_array_length((select r -> 'recipients' from started)), 3, 'three recipients');
select is((select subject from email_campaign where id = (select (r ->> 'id')::uuid from started)),
  'Fall opening', 'subject trimmed');
select is((select sent_by from email_campaign where id = (select (r ->> 'id')::uuid from started)),
  (select owner_a from ids), 'who sent it');
select is((select r -> 'recipients' -> 0 ->> 'email' from started), 'blue@example.com',
  'addresses trimmed; sorted by name');
select ok((select bool_and(length(x ->> 'token') = 32) from started,
  jsonb_array_elements(r -> 'recipients') x), 'each has its own unsubscribe token');

select is(finish_email_campaign((select (r ->> 'id')::uuid from started), (
  select jsonb_agg(jsonb_build_object('id', x ->> 'id', 'sent', x ->> 'name' <> 'Rosa Diaz',
    'provider_id', 'p-' || (x ->> 'name'), 'error', case when x ->> 'name' = 'Rosa Diaz' then 'bounced' end))
  from started, jsonb_array_elements(r -> 'recipients') x)),
  '{"sent": 2, "failed": 1}'::jsonb, 'results recorded');
select is((select status || ' ' || sent_count || ' ' || failed_count from email_campaign
           where id = (select (r ->> 'id')::uuid from started)), 'sent 2 1', 'campaign totals');
select is((select error from email_campaign_recipient r join customer c on c.id = r.customer_id
           where c.name = 'Rosa Diaz' and r.campaign_id = (select (s.r ->> 'id')::uuid from started s)),
  'bounced', 'the failure is kept');
reset role;

select tests.authenticate_as((select owner_b from ids));
select throws_ok(format('select finish_email_campaign(%L, ''[]'')', (select (r ->> 'id')::uuid from started)),
  '42501', null, 'another shop can''t touch it');
select is((select count(*)::int from email_campaign where company_id = (select ca from ids)), 0,
  'or read it');
reset role;

-- ---------------------------------------------------------------------------
-- Unsubscribe
-- ---------------------------------------------------------------------------

create temp table rosa as
  select x ->> 'token' as token from started, jsonb_array_elements(r -> 'recipients') x
  where x ->> 'name' = 'Rosa Diaz';
grant select on rosa to anon, authenticated;

set local role anon;
select is(unsubscribe_shop((select token from rosa)), 'Company a', 'the page names the shop');
select is(unsubscribe_shop('nope'), null, 'a made-up link: nothing');
select is(unsubscribe_email((select token from rosa)), 'Company a', 'unsubscribed');
select is(unsubscribe_email((select token from rosa)), 'Company a', 'twice is fine');
select is(unsubscribe_email('nope'), null, 'a made-up link changes nothing');
reset role;

select ok((select marketing_opt_out from customer where name = 'Rosa Diaz'),
  'the customer is opted out (no more mass, reminder or review emails)');
select isnt((select unsubscribed_at from email_campaign_recipient where token = (select token from rosa)),
  null, 'and the campaign shows when');

select tests.authenticate_as((select owner_a from ids));
select is(email_audience_count((select ca from ids), '{}'),
  '{"recipients": 2, "no_email": 1, "unsubscribed": 2}'::jsonb, 'left out of the next one');
reset role;

select * from finish();
rollback;
