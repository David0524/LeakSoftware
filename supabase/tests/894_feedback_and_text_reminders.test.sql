-- Customer feedback (thumbs up and down, private complaints) and text reminders (owner,
-- 2026-11-16): the server records a customer's answer from their link, owners and admins work the
-- complaints, an open complaint holds back the review request, and reminders carry the shop's
-- channel and what has gone.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a, (a ->> 'invoice')::uuid as inv_a,
  (a ->> 'quote')::uuid as quote_a, (a ->> 'customer')::uuid as cust_a,
  (b ->> 'company')::uuid as cb, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated, anon, service_role;

insert into share_link (company_id, job_id, invoice_id, token)
values ((select ca from ids), (select job_a from ids), (select inv_a from ids), 'tok-fb-a');
update company set review_url = 'https://g.page/r/example' where id = (select ca from ids);

-- The customer's link: the card knows the shop and whether it asks first.
set local role service_role;
select is(feedback_for_token('tok-fb-a') ->> 'review_url', 'https://g.page/r/example',
  'the card has the shop''s review link');
select is((feedback_for_token('tok-fb-a') ->> 'enabled')::boolean, true, 'asking first is on by default');
select is(feedback_for_token('nope'), null, 'an unknown link has no card');
select is(submit_feedback('nope', 'up'), null, 'an unknown link records nothing');
select throws_ok($$ select submit_feedback('tok-fb-a', 'meh') $$, '22023', null,
  'only a thumbs up or down');

select is((submit_feedback('tok-fb-a', 'down', '  The pool is still green.  ') ->> 'made')::boolean,
  true, 'a thumbs down is recorded');
select is((submit_feedback('tok-fb-a', 'down', 'The pool is still green.') ->> 'made')::boolean,
  false, 'the same complaint twice is one');
reset role;
select results_eq($$ select rating, status, comment, customer_id
                     from customer_feedback where comment like 'The pool%' $$,
  $$ select 'down', 'open', 'The pool is still green.', (select cust_a from ids) $$,
  'an open complaint with the words trimmed, for the job''s customer');

-- Nobody but the server records answers.
set local role anon;
select throws_ok($$ select submit_feedback('tok-fb-a', 'up') $$, '42501', null,
  'a visitor cannot call it directly');
reset role;
select tests.authenticate_as((select owner_a from ids));
select throws_ok($$ select submit_feedback('tok-fb-a', 'up') $$, '42501', null,
  'neither can a signed-in owner');
select throws_ok(format($$ insert into customer_feedback (company_id, rating) values (%L, 'down') $$,
  (select ca from ids)), '42501', null, 'no direct inserts');
reset role;

-- Owners and admins read the list, open complaints first; techs and other shops see none.
select tests.authenticate_as((select admin_a from ids));
select is((feedback_list((select ca from ids)) ->> 'open_count')::int, 1, 'one open complaint');
select is(feedback_open_count((select ca from ids)), 1, 'the dashboard card counts it');
select is(feedback_list((select ca from ids)) -> 'rows' -> 0 ->> 'status', 'open',
  'open complaints come first');
select is(jsonb_array_length(feedback_list((select ca from ids), (select cust_a from ids)) -> 'rows'),
  2, 'the customer''s page lists theirs (the open one and the closed one)');
reset role;
select tests.authenticate_as((select tech_a from ids));
select is(jsonb_array_length(feedback_list((select ca from ids)) -> 'rows'), 0,
  'a tech sees no feedback');
select is(feedback_open_count((select ca from ids)), 0, 'and no count');
select throws_ok(format($$ select set_feedback_status(%L, 'closed') $$,
  (select id from customer_feedback where status = 'open')), 'P0002', null,
  'a tech cannot close one');
reset role;
select tests.authenticate_as((select owner_b from ids));
select is(jsonb_array_length(feedback_list((select ca from ids)) -> 'rows'), 0,
  'another shop sees none');
reset role;

-- Close and reopen with a note.
select tests.authenticate_as((select admin_a from ids));
select lives_ok(format($$ select set_feedback_status(%L, 'closed', 'Called Rebecca; sent a tech.') $$,
  (select id from customer_feedback where status = 'open')), 'an admin closes a complaint');
reset role;
select results_eq($$ select status, office_note, closed_by is not null, closed_at is not null
                     from customer_feedback where comment like 'The pool%' $$,
  $$ select 'closed', 'Called Rebecca; sent a tech.', true, true $$,
  'closed with the note, who and when');
select tests.authenticate_as((select admin_a from ids));
select lives_ok(format($$ select set_feedback_status(%L, 'open', 'Still green.') $$,
  (select id from customer_feedback where comment like 'The pool%')), 'and reopens it');
reset role;
select results_eq($$ select status, closed_by, closed_at from customer_feedback
                     where comment like 'The pool%' $$,
  $$ values ('open', null::uuid, null::timestamptz) $$, 'reopened clears who and when');

-- A thumbs up is not a case.
set local role service_role;
select is((submit_feedback('tok-fb-a', 'up') ->> 'made')::boolean, true, 'a thumbs up is recorded');
select is((submit_feedback('tok-fb-a', 'up') ->> 'made')::boolean, false, 'once per job');
reset role;
select is((select status from customer_feedback where rating = 'up'), 'closed',
  'a thumbs up needs no follow-up');
select tests.authenticate_as((select admin_a from ids));
select throws_ok(format($$ select set_feedback_status(%L, 'open') $$,
  (select id from customer_feedback where rating = 'up')), 'P0002', null,
  'a thumbs up cannot be reopened');
reset role;

-- Review requests: held back by an open complaint (and by a thumbs up on the job).
create temp view due as
  select f ->> 'template' as template, f ->> 'channel' as channel,
         f -> 'sent_channels' as sent, f -> 'customer' ->> 'phone' as phone,
         f ->> 'feedback_first' as first
  from jsonb_array_elements(due_followups()) f
  where (f ->> 'company_id')::uuid = (select ca from ids);
grant select on due to service_role;

set local app.invoice_server = 'on';
update invoice set status = 'paid', amount_paid_cents = total_cents,
  paid_at = now() - interval '3 hours' where id = (select inv_a from ids);
delete from customer_feedback where rating = 'up';
set local role service_role;
select is_empty($$ select * from due $$, 'an open complaint holds back the review request');
reset role;
update customer_feedback set status = 'closed' where status = 'open';
set local role service_role;
select results_eq($$ select template, first from due $$, $$ values ('review_request', 'true') $$,
  'closing it releases the review request, which asks how we did first');
reset role;
update company set settings = jsonb_set(settings, '{ask_feedback_first}', 'false')
where id = (select ca from ids);
set local role service_role;
select results_eq($$ select first from due $$, $$ values ('false') $$, 'asking first can be off');
reset role;
insert into customer_feedback (company_id, customer_id, job_id, rating, status)
values ((select ca from ids), (select cust_a from ids), (select job_a from ids), 'up', 'closed');
set local role service_role;
select is_empty($$ select * from due $$, 'a thumbs up on the job means they were shown the link');
reset role;
delete from customer_feedback where rating = 'up';

-- Text reminders: the shop's channel, the customer's phone, and what has gone per channel.
update invoice set status = 'sent', sent_at = now() - interval '8 days', amount_paid_cents = 0,
  paid_at = null where id = (select inv_a from ids);
update customer set phone = '(602) 555-0199' where id = (select cust_a from ids);
set local role service_role;
select results_eq($$ select template, channel, phone from due $$,
  $$ values ('invoice_reminder_7', 'email', '(602) 555-0199') $$,
  'reminders go by email unless the shop says otherwise');
reset role;
update company set settings = jsonb_set(settings, '{reminders,channel}', '"both"')
where id = (select ca from ids);
insert into message (company_id, job_id, invoice_id, channel, recipient, template, status)
values ((select ca from ids), (select job_a from ids), (select inv_a from ids), 'email',
        'c@example.com', 'invoice_reminder_7', 'sent');
set local role service_role;
select results_eq($$ select channel, sent from due $$, $$ values ('both', '["email"]'::jsonb) $$,
  'with both, the email going leaves the text due');
reset role;
insert into message (company_id, job_id, invoice_id, channel, recipient, template, status)
values ((select ca from ids), (select job_a from ids), (select inv_a from ids), 'sms',
        '+16025550199', 'invoice_reminder_7', 'sent');
set local role service_role;
select is_empty($$ select * from due $$, 'both gone: nothing left for that step');
reset role;
select throws_ok(format($$ insert into message (company_id, job_id, invoice_id, channel, recipient, template)
  values (%L, %L, %L, 'sms', '+16025550199', 'invoice_reminder_7') $$,
  (select ca from ids), (select job_a from ids), (select inv_a from ids)), '23505', null,
  'a text goes out once per step too');

-- Text only: a customer with no email is still reached.
delete from message where template = 'invoice_reminder_7';
update company set settings = jsonb_set(settings, '{reminders,channel}', '"text"')
where id = (select ca from ids);
update customer set email = null where id = (select cust_a from ids);
set local role service_role;
select results_eq($$ select channel from due $$, $$ values ('text') $$,
  'text-only reminders reach a customer with no email');
reset role;
update customer set phone = null where id = (select cust_a from ids);
set local role service_role;
select is_empty($$ select * from due $$, 'no email and no phone: nobody to remind');
reset role;
-- Customers who stopped emails from a link get nothing.
update customer set phone = '(602) 555-0199', marketing_opt_out = true
where id = (select cust_a from ids);
set local role service_role;
select is_empty($$ select * from due $$, 'a customer who opted out gets no reminder at all');
reset role;

select * from finish();
rollback;
