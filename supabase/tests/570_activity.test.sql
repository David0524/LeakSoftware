-- Activity (owner, 2026-10-20; docs/plans/search-and-activity.md section 2): the database
-- records each event once, whoever caused it; people see an event exactly when they see what
-- it is about; nobody signed in writes it; the unread dot follows when each person last
-- opened it.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp table ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a, (a ->> 'quote')::uuid as quote_a,
  (a ->> 'invoice')::uuid as invoice_a, (a ->> 'report')::uuid as report_a,
  (a ->> 'customer')::uuid as cust_a, (b ->> 'owner')::uuid as owner_b,
  tests.create_user('a-tech2@test.local') as tech2, gen_random_uuid() as cust2,
  gen_random_uuid() as prop2, gen_random_uuid() as job2, gen_random_uuid() as conv2,
  gen_random_uuid() as stranger
  from fx;
grant select on ids to authenticated;

-- Back to the server (no one signed in): reset role keeps the last person's claims.
create function pg_temp.as_server() returns text
language sql as $$ select set_config('request.jwt.claims', '', true) $$;

create function pg_temp.events(event_kind text, subject uuid) returns int
language sql as $$ select count(*)::int from activity where company_id = (select ca from ids) and kind = event_kind and subject_id = subject $$;

select is((select settings ->> 'techs_see_all_jobs' from company where id = (select ca from ids)),
  'false', 'a new shop''s techs see only their own jobs');

-- A second tech with their own customer, job, and conversation.
insert into membership (company_id, user_id, role) select ca, tech2, 'tech' from ids;
update profile set full_name = 'Tony Reyes' where id = (select tech2 from ids);
insert into customer (id, company_id, name) select cust2, ca, 'María Álvarez' from ids;
insert into property (id, company_id, customer_id, address_line1) select prop2, ca, cust2, '9 Palm Ln' from ids;
insert into job (id, company_id, property_id, bill_to_customer_id, status, assigned_user_id)
  select job2, ca, prop2, cust2, 'scheduled', tech2 from ids;
insert into conversation (id, company_id, phone, customer_id) select conv2, ca, '+16025550123', cust2 from ids;
insert into conversation (id, company_id, phone) select stranger, ca, '+16025550199' from ids;

-- ---------------------------------------------------------------------------
-- Each kind, once
-- ---------------------------------------------------------------------------

select is(pg_temp.events('job_assigned', (select job2 from ids)), 1, 'a job made with a tech is assigned');
select is((select assignee_id from activity where company_id = (select ca from ids) and kind = 'job_assigned' and subject_id = (select job2 from ids)),
  (select tech2 from ids), 'to that tech');
select is((select customer_name from activity where company_id = (select ca from ids) and kind = 'job_assigned' and subject_id = (select job2 from ids)),
  'María Álvarez', 'with the customer''s name');

-- Quote accepted (the server's own write: the customer's page or the phone's signature).
select set_config('app.quote_server', 'on', true);
update quote set status = 'sent', sent_at = now() where id = (select quote_a from ids);
select is(pg_temp.events('quote_accepted', (select quote_a from ids)), 0, 'a sent quote is not news');
update quote set status = 'accepted', accepted_at = now() where id = (select quote_a from ids);
update quote set accepted_by_name = 'Customer a' where id = (select quote_a from ids);
select set_config('app.quote_server', '', true);
select is(pg_temp.events('quote_accepted', (select quote_a from ids)), 1, 'an accepted quote: once');
select is((select amount_cents from activity where company_id = (select ca from ids) and kind = 'quote_accepted'), 18500, 'with its total');

-- Payment received.
update payment set status = 'succeeded', paid_at = now() where invoice_id = (select invoice_a from ids);
update payment set status = 'succeeded' where invoice_id = (select invoice_a from ids);
select is((select count(*)::int from activity where company_id = (select ca from ids) and kind = 'payment_received'
           and job_id = (select job_a from ids)), 1, 'a payment that succeeds: once');
insert into payment (company_id, quote_id, amount_cents, method, status)
  select ca, quote_a, 5000, 'card', 'failed' from ids;
select is((select count(*)::int from activity where company_id = (select ca from ids) and kind = 'payment_received'), 1, 'a failed one is not');

-- Report signed and sent (signatures join the report when it is finished).
insert into signature (company_id, job_id, purpose, signer_name, signed_at)
  select ca, job_a, 'completion', 'Customer a', now() from ids;
update signature set report_id = (select report_a from ids) where job_id = (select job_a from ids);
select is(pg_temp.events('report_signed', (select report_a from ids)), 1,
  'a report finished with two signatures is signed once');
update report set final_sections = '[{"key": "summary", "text": "Done"}]',
  status = 'sent', sent_at = now() where id = (select report_a from ids);
-- make_company recorded one report_sent for this report already: it stays one.
select is(pg_temp.events('report_sent', (select report_a from ids)), 1, 'a sent report: once');
update report set status = 'superseded' where id = (select report_a from ids);
select is(pg_temp.events('report_sent', (select report_a from ids)), 1, 'superseding it is not news');
insert into report (company_id, job_id, template_key, status, sent_at, final_sections)
  select ca, job2, 'maintenance', 'sent', now(), '[]' from ids;
select is((select count(*)::int from activity where company_id = (select ca from ids) and kind = 'report_sent' and job_id = (select job2 from ids)), 1,
  'a visit report, made sent, is sent');

-- Job completed, by the tech, from their phone's sync or the website.
select tests.authenticate_as((select tech_a from ids));
update job set stop_done_on = current_date where id = (select job_a from ids);
update job set summary_notes = 'All good' where id = (select job_a from ids);
reset role;
select is(pg_temp.events('job_completed', (select job_a from ids)), 1, 'a stop marked done: once');
select is((select actor_id from activity where company_id = (select ca from ids) and kind = 'job_completed' and subject_id = (select job_a from ids)),
  (select tech_a from ids),
  'by whoever did it');
update job set status = 'in_progress' where id = (select job2 from ids);
update job set status = 'done' where id = (select job2 from ids);
select is(pg_temp.events('job_completed', (select job2 from ids)), 1, 'a visit done');

-- Given to someone, or moved.
update job set scheduled_start = '2026-10-21 14:00+00' where id = (select job_a from ids);
select is(pg_temp.events('job_moved', (select job_a from ids)), 0, 'getting a first time is not a move');
update job set scheduled_start = '2026-10-21 14:20+00' where id = (select job_a from ids);
select is(pg_temp.events('job_moved', (select job_a from ids)), 0, 'nor is a route making room (20 minutes)');
update job set scheduled_start = '2026-10-22 14:20+00' where id = (select job_a from ids);
select is(pg_temp.events('job_moved', (select job_a from ids)), 1, 'another day is a move');
select is((select scheduled_at from activity where company_id = (select ca from ids) and kind = 'job_moved'), '2026-10-22 14:20+00'::timestamptz,
  'to its new time');
update job set scheduled_start = '2026-10-22 16:00+00' where id = (select job_a from ids);
select is(pg_temp.events('job_moved', (select job_a from ids)), 2, 'so is an hour or more');
update job set assigned_user_id = (select owner_a from ids), scheduled_start = '2026-10-23 16:00+00'
  where id = (select job_a from ids);
select is(pg_temp.events('job_assigned', (select job_a from ids)), 2,
  'handed to someone else (and moved with it) is one assignment');
select is(pg_temp.events('job_moved', (select job_a from ids)), 2, 'not also a move');
update job set assigned_user_id = (select tech_a from ids) where id = (select job_a from ids);

-- Texts from customers.
insert into text_message (company_id, conversation_id, direction, body, status)
  select ca, conv2, 'in', 'Hi, is Tony on the way? ' || repeat('x', 100), 'received' from ids;
insert into text_message (company_id, conversation_id, direction, body, status)
  select ca, conv2, 'out', 'Yes, ten minutes.', 'sent' from ids;
select is((select count(*)::int from activity where company_id = (select ca from ids) and kind = 'text_received' and conversation_id = (select conv2 from ids)),
  1, 'a customer''s text, not the reply');
select is((select length(preview) from activity where company_id = (select ca from ids) and kind = 'text_received' and conversation_id = (select conv2 from ids)),
  80, 'its first 80 characters');
insert into text_message (company_id, conversation_id, direction, body, status)
  select ca, stranger, 'in', 'Who is this?', 'received' from ids;
select is((select customer_name from activity where conversation_id = (select stranger from ids)),
  '+16025550199', 'a number that isn''t a customer goes by the number');
update conversation set opted_out = true where id = (select stranger from ids);
insert into text_message (company_id, conversation_id, direction, body, status)
  select ca, stranger, 'in', 'STOP', 'received' from ids;
select is((select count(*)::int from activity where conversation_id = (select stranger from ids)), 1,
  'nothing from someone who opted out');

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------

-- Only Their Own: the first tech sees their job's events and their customer's texts, none of
-- the second tech's job or customer, and no text from a stranger.
select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from activity where job_id = (select job2 from ids)), 0,
  'a tech doesn''t see another tech''s job''s events');
select ok((select count(*)::int from activity where job_id = (select job_a from ids)) >= 5,
  'but sees their own job''s');
select is((select count(*)::int from activity where conversation_id = (select conv2 from ids)), 0,
  'nor another tech''s customer''s texts');
select is((select count(*)::int from activity where conversation_id = (select stranger from ids)), 0,
  'nor a stranger''s');
select is((select count(*)::int from activity where company_id = (select ca from ids) and kind = 'text_received'
           and customer_name = 'Customer a'), 1, 'but their own customer''s');
select is((select count(*)::int from activity where company_id <> (select ca from ids)), 0,
  'nor another shop''s');
select throws_ok(
  format($$ insert into activity (company_id, kind, job_id) values (%L, 'job_completed', %L) $$,
         (select ca from ids), (select job_a from ids)),
  '42501', null, 'and can''t write any');
reset role;

select tests.authenticate_as((select tech2 from ids));
select ok((select count(*)::int from activity where job_id = (select job2 from ids)) >= 3,
  'the second tech sees their job''s events');
select is((select count(*)::int from activity where conversation_id = (select conv2 from ids)), 1,
  'and their customer''s text');
reset role;

select tests.authenticate_as((select owner_a from ids));
select ok((select count(*)::int from activity where job_id = (select job2 from ids)) >= 3,
  'the owner sees every job''s events');
select is((select count(*)::int from activity where conversation_id = (select stranger from ids)), 1,
  'and every text');
select is((select count(*)::int from activity where company_id <> (select ca from ids)), 0,
  'but not another shop''s');
select throws_ok(
  format($$ insert into activity (company_id, kind, job_id) values (%L, 'job_completed', %L) $$,
         (select ca from ids), (select job_a from ids)),
  '42501', null, 'owners can''t write it either');
select throws_ok($$ update activity set customer_name = 'x' $$, '42501', null, 'or change it');
select throws_ok($$ delete from activity $$, '42501', null, 'or delete it');
reset role;

select tests.authenticate_as((select admin_a from ids));
select ok((select count(*)::int from activity where job_id = (select job2 from ids)) >= 3,
  'admins see every job''s events');
reset role;

select tests.authenticate_as((select owner_b from ids));
select is((select count(*)::int from activity where company_id = (select ca from ids)), 0,
  'another shop''s owner sees none');
select throws_ok(format($$ select activity_feed(%L) $$, (select ca from ids)), '42501', null,
  'and can''t page it');
reset role;

-- Every Job: the first tech sees it all.
update company set settings = settings || '{"techs_see_all_jobs": true}' where id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select ok((select count(*)::int from activity where job_id = (select job2 from ids)) >= 3,
  'in an Every Job shop a tech sees every job''s events');
select is((select count(*)::int from activity where conversation_id = (select stranger from ids)), 1,
  'and every text');
reset role;
update company set settings = settings || '{"techs_see_all_jobs": false}' where id = (select ca from ids);

-- ---------------------------------------------------------------------------
-- The feed and the dot
-- ---------------------------------------------------------------------------

select tests.authenticate_as((select owner_a from ids));
create temp table page1 on commit drop as
  select activity_feed((select ca from ids), null, null, 3) as f;
select is(jsonb_array_length((select f -> 'events' from page1)), 3, 'a page holds what was asked');
select is((select (f ->> 'more')::boolean from page1), true, 'and says there is more');
select ok((select (f -> 'events' -> 0 ->> 'created_at')::timestamptz >= (f -> 'events' -> 1 ->> 'created_at')::timestamptz
           from page1), 'newest first');
select is((select count(*)::int from jsonb_array_elements(
             (select activity_feed((select ca from ids), (f -> 'events' -> 2 ->> 'created_at')::timestamptz,
                                   (f -> 'events' -> 2 ->> 'id')::uuid, 100) -> 'events' from page1)) e
           where e ->> 'id' in (select x ->> 'id' from page1, jsonb_array_elements(f -> 'events') x)), 0,
  'the next page starts after the last one');
select is((select count(*)::int from jsonb_array_elements(activity_feed((select ca from ids), null, null, 100) -> 'events')),
  (select count(*)::int from activity where company_id = (select ca from ids)), 'every event, page by page');
select is((select e ->> 'assignee_name' from jsonb_array_elements(activity_feed((select ca from ids), null, null, 100) -> 'events') e
           where e ->> 'kind' = 'job_assigned' and e ->> 'job_id' = (select job2::text from ids)),
  'Tony Reyes', 'names come with it');
reset role;

select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from jsonb_array_elements(activity_feed((select ca from ids), null, null, 100) -> 'events') e
           where e ->> 'job_id' = (select job2::text from ids)), 0, 'the feed follows row security');
select ok(mark_activity_seen() is not null, 'opening Activity is recorded');
select is(activity_unread((select ca from ids)), false, 'then nothing is unread');
reset role;
select pg_temp.as_server();
-- Something new, by someone else: the owner moves the tech's job.
select tests.authenticate_as((select owner_a from ids));
update job set scheduled_start = scheduled_start + interval '1 day' where id = (select job_a from ids);
reset role;
select pg_temp.as_server();
select tests.authenticate_as((select tech_a from ids));
select is(activity_unread((select ca from ids)), true, 'a new event shows the dot');
select ok(mark_activity_seen() is not null, 'opening it again');
select is(activity_unread((select ca from ids)), false, 'clears it');
update job set stop_done_on = current_date + 2 where id = (select job_a from ids);
select is(activity_unread((select ca from ids)), false, 'what you did yourself is not unread');
select ok(mark_activity_seen() is not null, 'opening it once more');
reset role;
select pg_temp.as_server();
select tests.authenticate_as((select tech2 from ids));
select ok(mark_activity_seen() is not null, 'the second tech opens it too');
reset role;
select pg_temp.as_server();
select tests.authenticate_as((select owner_a from ids));
update job set scheduled_start = scheduled_start + interval '1 day' where id = (select job_a from ids);
reset role;
select pg_temp.as_server();
select tests.authenticate_as((select tech2 from ids));
select is(activity_unread((select ca from ids)), false, 'what you can''t see is not unread');
reset role;
select pg_temp.as_server();
select tests.authenticate_as((select tech_a from ids));
select is(activity_unread((select ca from ids)), true, 'while whoever can see it gets the dot');
reset role;
select pg_temp.as_server();

create temp table newcomer on commit drop as select tests.create_user('activity-newcomer@test.local') as id;
select is((select activity_seen_at is not null from profile where id = (select id from newcomer)), true,
  'someone new starts with nothing unread');
select is(has_function_privilege('anon', 'public.activity_feed(uuid, timestamptz, uuid, integer, text)', 'execute'),
  false, 'signed-out visitors can''t read it');

select * from finish();
rollback;
