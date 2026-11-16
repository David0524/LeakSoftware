-- Skip a Visit (owner, 2026-11-16; 20261022004500_skip_visit.sql): the skipped status for
-- maintenance visits, who and when, Dismiss for owners and admins, Reschedule, the shop's skip
-- reasons, never billed, and the day-end auto-skip.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp table ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'admin')::uuid as admin_a, (a ->> 'customer')::uuid as cust_a,
  (select id from property where customer_id = (a ->> 'customer')::uuid limit 1) as prop_a,
  (b ->> 'company')::uuid as cb,
  '00000000-0000-7000-8000-000000000951'::uuid as visit,
  '00000000-0000-7000-8000-000000000952'::uuid as leak,
  '00000000-0000-7000-8000-000000000953'::uuid as auto1,
  '00000000-0000-7000-8000-000000000954'::uuid as auto_started,
  '00000000-0000-7000-8000-000000000955'::uuid as auto_old
  from fx;
grant select on ids to authenticated;

-- Reasons are seeded per company, with the system one apart.
select is((select count(*) from skip_reason where company_id = (select ca from ids)
           and not system and deleted_at is null), 7::bigint, 'seven reasons to pick');
select is((select label from skip_reason where company_id = (select ca from ids) and system),
  'Not Done', 'and the system reason for the day-end skip');
select ok((select bool_and(label in ('Locked Gate', 'Dog in Yard', 'Customer Asked to Skip', 'Weather',
    'Pool Covered or Closed', 'No Access', 'Other'))
  from skip_reason where company_id = (select ca from ids) and not system),
  'named as the owner asked');

insert into job (id, company_id, property_id, bill_to_customer_id, type, status, assigned_user_id,
  scheduled_start, scheduled_end)
  select visit, ca, prop_a, cust_a, 'maintenance', 'scheduled', tech_a,
         date_trunc('day', now()) + interval '9 hours', date_trunc('day', now()) + interval '9.5 hours'
    from ids
  union all
  select leak, ca, prop_a, cust_a, 'detection', 'scheduled', tech_a, now(), now() from ids;

-- Only maintenance visits are skipped.
select throws_ok(format($$ update job set status = 'skipped', skip_reason = 'Locked Gate' where id = %L $$,
  (select leak from ids)), '23514', null, 'a leak detection job can''t be skipped');

-- The tech skips the visit (offline, so the phone sends its own time).
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ update job set status = 'skipped' where id = %L $$, (select visit from ids)),
  '23514', null, 'a skip needs a reason');
select is(tests.rows_affected(format($$ update job set status = 'skipped', skip_reason = 'Dog in Yard',
  skip_note = 'Two big dogs loose', skipped_at = '2026-11-16 15:05:00+00' where id = %L $$,
  (select visit from ids))), 1::bigint, 'the tech skips the visit');
select is((select skipped_by from job where id = (select visit from ids)), (select tech_a from ids),
  'the server records who');
select is((select skipped_at from job where id = (select visit from ids)),
  '2026-11-16 15:05:00+00'::timestamptz, 'and keeps the phone''s time');
select is((select stop_done_at from job where id = (select visit from ids)), null,
  'a skipped stop is not "done" for the owner''s Last done');

-- Who and when can't be rewritten, and a tech can't dismiss.
update job set skipped_at = now(), skip_note = 'Two big dogs, loose in the yard'
  where id = (select visit from ids);
select is((select skipped_at from job where id = (select visit from ids)),
  '2026-11-16 15:05:00+00'::timestamptz, 'the skip time stays once skipped');
select throws_ok(format($$ update job set skipped_by = %L where id = %L $$, (select owner_a from ids),
  (select visit from ids)), '42501', null, 'skipped_by is the server''s');
select throws_ok(format($$ update job set skip_handled_at = now() where id = %L $$,
  (select visit from ids)), '42501', 'Only owners and admins can dismiss a skipped visit',
  'a tech can''t dismiss a skipped visit');
reset role;

-- Billing: a skipped visit is not billed (monthly billing counts done, invoiced and paid).
update job set fee_cents = 5000 where id = (select visit from ids);
select is((select count(*) from app.unbilled_visits((select ca from ids)) where id = (select visit from ids)),
  0::bigint, 'a skipped visit with a price is not billed');

-- The notification claim: once, for the owner and admins.
select is((select count(*) from skips_to_notify((select visit from ids))), 1::bigint,
  'the skip is handed out to be pushed');
select is((select count(*) from skips_to_notify((select visit from ids))), 0::bigint, 'only once');

-- Dismiss: an admin keeps it skipped and marks it handled.
select tests.authenticate_as((select admin_a from ids));
select is(tests.rows_affected(format($$ update job set skip_handled_at = now() where id = %L $$,
  (select visit from ids))), 1::bigint, 'an admin dismisses it');
select is((select skip_handled_by from job where id = (select visit from ids)), (select admin_a from ids),
  'with who');
select is((select status from job where id = (select visit from ids)), 'skipped', 'it stays skipped');
reset role;

-- Reschedule: moving a skipped visit to a day puts it back on, and clears the skip.
select tests.authenticate_as((select owner_a from ids));
select is(tests.rows_affected(format($$ update job set scheduled_start = now() + interval '2 days',
  scheduled_end = now() + interval '2 days 30 minutes' where id = %L $$, (select visit from ids))),
  1::bigint, 'the office moves it');
select is((select status from job where id = (select visit from ids)), 'scheduled',
  'it is Scheduled again');
select is((select array[skip_reason, skip_note, skipped_by::text, skip_handled_at::text]
           from job where id = (select visit from ids)), array[null, null, null, null]::text[],
  'and no longer carries the skip');
reset role;

-- Undo: skip again, then back to Scheduled.
select tests.authenticate_as((select tech_a from ids));
update job set status = 'skipped', skip_reason = 'Weather' where id = (select visit from ids);
update job set status = 'scheduled' where id = (select visit from ids);
select is((select skip_reason from job where id = (select visit from ids)), null,
  'Undo clears the reason');
select is((select skip_notified_at from job where id = (select visit from ids)), null,
  'so a later skip is told again');
-- In progress can be skipped too (the gate was locked after arriving).
update job set status = 'in_progress' where id = (select visit from ids);
select lives_ok(format($$ update job set status = 'skipped', skip_reason = 'No Access' where id = %L $$,
  (select visit from ids)), 'a started visit can be skipped');
update job set status = 'in_progress' where id = (select visit from ids);
select lives_ok(format($$ update job set status = 'done' where id = %L $$, (select visit from ids)),
  'and still be done later');
select throws_ok(format($$ update job set status = 'skipped', skip_reason = 'Weather' where id = %L $$,
  (select visit from ids)), '23514', null, 'a done visit can''t be skipped');
reset role;
select is((select count(*) from app.unbilled_visits((select ca from ids)) where id = (select visit from ids)),
  1::bigint, 'a done visit with the same price is billed');

-- Skip reasons: owners and admins edit; techs read; other shops' are out of sight; the system
-- one can't be changed.
select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected($$ update skip_reason set label = 'Nope' where label = 'Weather' $$),
  0::bigint, 'a tech can''t rename a reason');
select throws_ok(format($$ insert into skip_reason (company_id, label) values (%L, 'Pool Party') $$,
  (select ca from ids)), '42501', null, 'or add one');
select is((select count(*) from skip_reason where company_id = (select cb from ids)), 0::bigint,
  'and sees only their shop''s');
reset role;
select tests.authenticate_as((select admin_a from ids));
select lives_ok(format($$ insert into skip_reason (id, company_id, label, sort_order)
  values (gen_random_uuid(), %L, 'Pool Party', 80) $$, (select ca from ids)), 'an admin adds a reason');
select is(tests.rows_affected($$ update skip_reason set label = 'Weather or Storm' where label = 'Weather' $$),
  1::bigint, 'and renames one');
select is(tests.rows_affected($$ update skip_reason set active = false where system $$), 0::bigint,
  'the system reason can''t be changed');
reset role;
select ok((select '{skip_reason,skip_note,skipped_at,skip_handled_at}'::text[] <@ update_columns
           from app.sync_table where table_name = 'job'), 'phones send the skip');
select ok(exists (select 1 from app.sync_table where table_name = 'skip_reason' and device_sync),
  'and download the reasons');

-- Auto-skip: off by default; on, yesterday's not-started visits are skipped as 'Not Done'.
insert into job (id, company_id, property_id, bill_to_customer_id, type, status, assigned_user_id,
  scheduled_start, scheduled_end)
  select auto1, ca, prop_a, cust_a, 'maintenance', 'scheduled', tech_a,
         date_trunc('day', now()) - interval '15 hours', date_trunc('day', now()) - interval '14.5 hours'
    from ids
  union all
  select auto_started, ca, prop_a, cust_a, 'maintenance', 'in_progress', tech_a,
         date_trunc('day', now()) - interval '14 hours', date_trunc('day', now()) - interval '13.5 hours'
    from ids
  union all
  select auto_old, ca, prop_a, cust_a, 'maintenance', 'scheduled', tech_a,
         date_trunc('day', now()) - interval '10 days', date_trunc('day', now()) - interval '10 days' + interval '30 minutes'
    from ids;
select is((select count(*) from auto_skip_visits()), 0::bigint, 'off by default: nothing is skipped');
update company set timezone = 'UTC', settings = settings || '{"skip_unfinished_visits": true}'
  where id = (select ca from ids);
select is((select count(*) from auto_skip_visits()), 1::bigint,
  'on: yesterday''s not-started visit is skipped');
select is((select array[status, skip_reason, skipped_by::text] from job where id = (select auto1 from ids)),
  array['skipped', 'Not Done', null]::text[], 'as Not Done, by nobody');
select is((select status from job where id = (select auto_started from ids)), 'in_progress',
  'a started visit is left alone');
select is((select status from job where id = (select auto_old from ids)), 'scheduled',
  'and so is one from long ago');
select is((select count(*) from auto_skip_visits()), 0::bigint, 'a second run skips nothing more');
select is((select status from job where id = (select visit from ids)), 'done',
  'today''s and finished visits are untouched');
select is((select count(*) from skips_to_notify()), 1::bigint,
  'the catch-up hands out the auto-skip once');

-- The runs are the server's.
select tests.authenticate_as((select owner_a from ids));
select throws_ok($$ select auto_skip_visits() $$, '42501', null, 'owners can''t run the day-end skip');
select throws_ok($$ select skips_to_notify() $$, '42501', null, 'or the push catch-up');
reset role;

select * from finish();
rollback;
