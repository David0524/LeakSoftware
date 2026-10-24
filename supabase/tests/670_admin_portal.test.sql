-- The Admin portal (owner, 2026-10-22). Support sessions: a staff person with an open session
-- (and two-step) works in that one shop like its admin, never like its owner; View Only
-- changes nothing; an ended or expired session, or one without two-step, opens nothing; staff
-- never become members. The portal's functions are the server's only. Extend Trial and Make
-- Demo Shop. The staff log can't be changed.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b,
  tests.create_user('staff@sundeck.test') as staff;
grant select on fx to authenticated, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'customer')::uuid as cust_a,
  (b ->> 'company')::uuid as cb, (b ->> 'job')::uuid as job_b, staff
  from fx;
grant select on ids to authenticated, service_role;

create or replace function pg_temp.as_staff(aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select staff from ids),
    'role', 'authenticated', 'email', 'staff@sundeck.test', 'aal', aal)::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;

-- ---------------------------------------------------------------------------
-- No session: nothing.
-- ---------------------------------------------------------------------------
select pg_temp.as_staff('aal2');
select is((select count(*) from job), 0::bigint, 'staff with no session see no jobs');
select is(app.is_member((select ca from ids)), false, 'and are no member');
reset role;

-- ---------------------------------------------------------------------------
-- The portal's functions are the server's only.
-- ---------------------------------------------------------------------------
select pg_temp.as_staff('aal2');
select throws_ok($$ select admin_shops() $$, '42501', null, 'signed-in people can''t list shops');
select throws_ok(format($$ select admin_start_support(%L, %L, 'x@y.z', 'help', 30, 'edit') $$,
  (select ca from ids), (select staff from ids)), '42501', null, 'or open a shop for themselves');
select throws_ok(format($$ select admin_extend_trial(%L, 30) $$, (select ca from ids)), '42501', null,
  'or extend a trial');
select throws_ok($$ select * from support_session $$, '42501', null, 'or read support sessions');
select throws_ok($$ select * from staff_action $$, '42501', null, 'or the staff log');
reset role;
set local role anon;
select throws_ok($$ select admin_metrics() $$, '42501', null, 'nor can visitors');
reset role;

-- ---------------------------------------------------------------------------
-- View Only.
-- ---------------------------------------------------------------------------
set local role service_role;
select throws_ok(format($$ select admin_start_support(%L, %L, 'staff@sundeck.test', 'help', 45, 'view') $$,
  (select ca from ids), (select staff from ids)), '22023', null, 'sessions are 30 min, 1 hr or 2 hr');
select lives_ok(format($$ select admin_start_support(%L, %L, 'Staff@Sundeck.test', 'Owner can''t find an invoice', 60, 'view') $$,
  (select ca from ids), (select staff from ids)), 'the server opens a View Only session');
reset role;

select pg_temp.as_staff('aal2');
select is((select count(*) from job where company_id = (select ca from ids)), 1::bigint,
  'View Only: staff see the shop''s jobs');
select is((select count(*) from customer where company_id = (select ca from ids)) > 0, true,
  'and customers');
select is((select count(*) from job where company_id = (select cb from ids)), 0::bigint,
  'but no other shop''s');
select is((select count(*) from membership where company_id = (select ca from ids)) >= 3, true,
  'they see the team');
select is((select count(*) from profile where id = (select owner_a from ids)), 1::bigint,
  'and the team''s names');
select is(app.is_manager((select ca from ids)), true, 'they pass the admin checks');
select is(app.is_owner((select ca from ids)), false, 'never the owner''s');
select is((select ca from ids) = any (app.owner_companies()), false, 'in either form');
select throws_ok(format($$ update job set summary_notes = 'support was here' where id = %L $$,
  (select job_a from ids)), 'TL403', null, 'View Only changes nothing');
select throws_ok(format($$ insert into customer (id, company_id, kind, name) values (gen_random_uuid(), %L, 'homeowner', 'New') $$,
  (select ca from ids)), 'TL403', null, 'or adds anything');
select throws_ok(format($$ update company set name = 'Renamed' where id = %L $$, (select ca from ids)),
  'TL403', null, 'or renames the shop');
select is(app.support_view_only((select ca from ids)), true, 'the shop reads as View Only');
reset role;

select is((select summary_notes from job where id = (select job_a from ids)) is distinct from 'support was here',
  true, 'the job is unchanged');
select is((select count(*) from membership where user_id = (select staff from ids)), 0::bigint,
  'staff never become members (not in the team, seats or notifications)');

-- Two-step is required for support, whatever the staff person's own setting.
select pg_temp.as_staff('aal1');
select is((select count(*) from job where company_id = (select ca from ids)), 0::bigint,
  'without two-step, the session opens nothing');
reset role;

-- A shop's own people are untouched by someone else's session.
select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected(format($$ update customer set notes = 'tech note' where id = %L $$,
  (select cust_a from ids))), 1::bigint, 'the shop''s tech still edits as usual');
reset role;

-- ---------------------------------------------------------------------------
-- Can Make Changes.
-- ---------------------------------------------------------------------------
set local role service_role;
select lives_ok(format($$ select admin_start_support(%L, %L, 'staff@sundeck.test', 'Fix a schedule', 30, 'edit') $$,
  (select ca from ids), (select staff from ids)), 'a new session replaces the open one');
select is((select count(*) from support_session where staff_user_id = (select staff from ids) and ended_at is null),
  1::bigint, 'one open session at a time');
reset role;

select pg_temp.as_staff('aal2');
select is(tests.rows_affected(format($$ update job set summary_notes = 'support fixed it' where id = %L $$,
  (select job_a from ids))), 1::bigint, 'Can Make Changes: staff change the shop''s work');
select is(tests.rows_affected(format($$ update price_book_item set price_cents = price_cents + 100 where company_id = %L $$,
  (select ca from ids))) > 0, true, 'and its settings, like an admin');
select throws_ok(format($$ select create_invite(%L, 'new-owner@test.local', 'owner') $$, (select ca from ids)),
  '42501', null, 'but not the owner''s things');
reset role;
select is((select user_id from audit_log where table_name = 'job' and row_id = (select job_a from ids)
           and field = 'summary_notes' order by id desc limit 1), (select staff from ids),
  'the shop''s history names the staff person');

-- Ending and expiry.
set local role service_role;
select is(admin_end_support((select staff from ids)), 1, 'End Session');
reset role;
select pg_temp.as_staff('aal2');
select is((select count(*) from job where company_id = (select ca from ids)), 0::bigint,
  'an ended session opens nothing');
reset role;
insert into support_session (company_ref, staff_user_id, staff_email, reason, access, started_at, ends_at)
values ((select ca from ids), (select staff from ids), 'staff@sundeck.test', 'old', 'edit',
        now() - interval '2 hours', now() - interval '1 hour');
select pg_temp.as_staff('aal2');
select is((select count(*) from job where company_id = (select ca from ids)), 0::bigint,
  'and neither does an expired one');
reset role;

-- ---------------------------------------------------------------------------
-- Every shop table refuses View Only, including tables made later.
-- ---------------------------------------------------------------------------
select is((
  select coalesce(array_agg(c.table_name::text order by c.table_name), '{}')
  from information_schema.columns c
  join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
  where c.table_schema = 'public' and c.column_name = 'company_id' and tb.table_type = 'BASE TABLE'
    and not exists (select 1 from pg_trigger tg where tg.tgrelid = format('public.%I', c.table_name)::regclass
                    and tg.tgname = 'guard_support_view')), '{}'::text[],
  'every table with a company_id has the View Only guard');

-- ---------------------------------------------------------------------------
-- The portal's reads.
-- ---------------------------------------------------------------------------
set local role service_role;
select is((select count(*) from jsonb_array_elements(admin_shops()) s
           where s ->> 'id' in ((select ca from ids)::text, (select cb from ids)::text)), 2::bigint,
  'admin_shops lists the shops');
select is((admin_shop((select ca from ids)) -> 'shop' ->> 'people')::int, 3, 'with their active people');
select is(jsonb_array_length(admin_shop((select ca from ids)) -> 'team'), 3, 'a shop''s team');
select is(jsonb_array_length(admin_shop((select ca from ids)) -> 'support') >= 3, true,
  'and its support history');
select is(admin_person((select owner_a from ids)) -> 'shops' -> 0 ->> 'role', 'owner', 'a person''s shops');
select is(jsonb_array_length(admin_metrics() -> 'signups_by_week'), 12, 'twelve weeks of signups');
select is(jsonb_array_length(admin_metrics() -> 'payments_by_month'), 12, 'twelve months of payments');
select isnt(admin_health(), null, 'health');

-- ---------------------------------------------------------------------------
-- Extend Trial and demo shops.
-- ---------------------------------------------------------------------------
insert into subscription (company_id) values ((select cb from ids)) on conflict (company_id) do nothing;
update subscription set status = 'trialing', trial_ends_at = now() - interval '2 days',
  stripe_subscription_id = null, plan = 'standard', onboarded_at = null
where company_id = (select cb from ids);
select is((select onboarded_at from subscription where company_id = (select cb from ids)), null,
  'the owner never finished setting up');
select is(app.company_locked((select cb from ids)), true, 'a shop past its trial is read-only');
select throws_ok(format($$ select admin_extend_trial(%L, 10) $$, (select cb from ids)), '22023', null,
  'trials extend by 7, 14 or 30 days');
select is(admin_extend_trial((select cb from ids), 14)::date, (now() + interval '14 days')::date,
  'an ended trial is extended from today');
select is(app.company_locked((select cb from ids)), false, 'and the shop works again');
-- Extending counts as setup finished (owner, 2026-10-24), so the owner isn't held at /welcome
-- or Finish Setting Up; a date already there stays.
select ok((select onboarded_at > now() - interval '1 minute' from subscription
  where company_id = (select cb from ids)), 'extending marks setup finished');
update subscription set onboarded_at = '2026-10-01' where company_id = (select cb from ids);
select lives_ok(format($$ select admin_extend_trial(%L, 7) $$, (select cb from ids)), 'extend again');
select is((select onboarded_at from subscription where company_id = (select cb from ids)),
  '2026-10-01'::timestamptz, 'a shop already set up keeps its date');
select lives_ok(format($$ select admin_set_demo(%L, true) $$, (select cb from ids)), 'Make Demo Shop');
select is((select plan || '/' || status from subscription where company_id = (select cb from ids)), 'demo/active',
  'is a demo shop');
select throws_ok(format($$ select admin_extend_trial(%L, 7) $$, (select cb from ids)), '22023', null,
  'a demo shop has no trial to extend');
select lives_ok(format($$ select admin_set_demo(%L, false) $$, (select cb from ids)), 'End Demo');
select is((select status from subscription where company_id = (select cb from ids)), 'trialing',
  'gives a week of trial');
select is((select array_agg(status order by id) from subscription_event where company_ref = (select cb from ids)
           and at > now() - interval '1 minute') @> array['trialing', 'active'], true,
  'the subscription history records each change');
update subscription set stripe_subscription_id = 'sub_test_admin' where company_id = (select cb from ids);
select throws_ok(format($$ select admin_set_demo(%L, true) $$, (select cb from ids)), '22023', null,
  'a shop Stripe bills is changed in Stripe');

-- ---------------------------------------------------------------------------
-- The staff log can't be changed.
-- ---------------------------------------------------------------------------
insert into staff_action (staff_email, action, company_ref, reason)
values ('staff@sundeck.test', 'support_start', (select ca from ids), 'help');
select throws_ok($$ update staff_action set reason = 'other' $$, '42501', null, 'the staff log can''t be edited');
select throws_ok($$ delete from staff_action $$, '42501', null, 'or emptied');
reset role;

select * from finish();
rollback;
