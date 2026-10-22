-- Usage (owner, 2026-10-22): the server records screen time and errors per person; the portal
-- reads them with what people did (from the audit log). Nobody else can read or write them.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a
  from fx;
grant select on ids to authenticated, service_role;

-- Only the server.
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select record_usage(%L, %L, 'web', '1', '[]') $$,
  (select owner_a from ids), (select ca from ids)), '42501', null, 'people can''t write usage');
select throws_ok($$ select admin_usage(30) $$, '42501', null, 'or read it');
select throws_ok($$ select * from usage_event $$, '42501', null, 'even their own');
-- A change the owner makes: in the audit log under their name (feature use).
select lives_ok(format($$ insert into customer (id, company_id, kind, name)
  values (gen_random_uuid(), %L, 'homeowner', 'Usage Test') $$, (select ca from ids)),
  'the owner adds a customer');
reset role;

set local role service_role;
select is(record_usage((select tech_a from ids), (select ca from ids), 'ios', '1.4.0 (52)', jsonb_build_array(
    jsonb_build_object('kind', 'screen', 'screen', '/today', 'ms', 120000,
                       'session', '0192f0a0-0000-7000-8000-000000000001', 'at', now() - interval '1 hour'),
    jsonb_build_object('kind', 'screen', 'screen', '/jobs/:id', 'ms', 600000,
                       'session', '0192f0a0-0000-7000-8000-000000000001', 'at', now() - interval '50 minutes'),
    jsonb_build_object('kind', 'error', 'screen', '/jobs/:id', 'detail', 'Couldn''t save the photo',
                       'session', '0192f0a0-0000-7000-8000-000000000001', 'at', now() - interval '45 minutes'))),
  3, 'the server records a tech''s screens and an error');
select is(record_usage((select owner_a from ids), (select ca from ids), 'web', null, jsonb_build_array(
    jsonb_build_object('kind', 'screen', 'screen', '/dashboard', 'ms', 300000,
                       'session', '0192f0a0-0000-7000-8000-000000000002', 'at', now() - interval '2 hours'))),
  1, 'and the owner''s on the website');

select is((admin_usage(30) ->> 'people_active')::int >= 2, true, 'people active');
select is((admin_usage(30, (select ca from ids)) ->> 'screen_ms')::bigint, 1020000::bigint,
  'screen time adds up for the shop');
select is((admin_usage(30, null, (select tech_a from ids)) ->> 'screen_ms')::bigint, 720000::bigint,
  'and for one person');
select is(admin_usage(30, null, (select tech_a from ids)) -> 'screens' -> 0 ->> 'screen', '/jobs/:id',
  'their most-used screen first');
select is(admin_usage(30, null, (select tech_a from ids)) -> 'versions' -> 0 ->> 'version', '1.4.0 (52)',
  'the app version they run');
select is(admin_usage(30, null, (select tech_a from ids)) -> 'errors' -> 0 ->> 'detail',
  'Couldn''t save the photo', 'the errors they hit');
select is((select f ->> 'feature' from jsonb_array_elements(
    admin_usage(30, null, (select owner_a from ids)) -> 'features') f
    where f ->> 'feature' = 'customer_added'), 'customer_added',
  'what they did, from the audit log');
select is(jsonb_array_length(admin_usage(7) -> 'by_day'), 8, 'a row for each day');

-- A stuck app can't fill the table: 5,000 events a person a day.
insert into usage_event (user_id, company_ref, platform, kind, screen, duration_ms, session_id, at)
select (select tech_a from ids), (select ca from ids), 'android', 'screen', '/today', 1000,
       '0192f0a0-0000-7000-8000-000000000003', now() - interval '10 minutes'
from generate_series(1, 5000);
select is(record_usage((select tech_a from ids), (select ca from ids), 'android', '1', jsonb_build_array(
    jsonb_build_object('kind', 'screen', 'screen', '/today', 'ms', 1000,
                       'session', '0192f0a0-0000-7000-8000-000000000003', 'at', now()))),
  0, 'past 5,000 a day, nothing more is kept');

-- Old events go.
update usage_event set at = now() - interval '200 days' where screen = '/dashboard';
select is(prune_usage() >= 1, true, 'events older than 180 days are pruned');
reset role;

select * from finish();
rollback;
