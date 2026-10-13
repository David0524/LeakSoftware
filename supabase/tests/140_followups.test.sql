-- Follow-ups (M10): quote and invoice reminders on the shop's schedule, newest step only,
-- once each; a review request after payment; the customer's opt-out; server only.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a,
  (a ->> 'quote')::uuid as quote_a, (a ->> 'invoice')::uuid as inv_a,
  (a ->> 'customer')::uuid as cust_a, (b ->> 'company')::uuid as cb
  from fx;
grant select on ids to authenticated, anon, service_role;

create temp view due as
  select f ->> 'template' as template, f ->> 'token' as token,
         f -> 'customer' ->> 'email' as email, (f ->> 'company_id')::uuid as company_id
  from jsonb_array_elements(due_followups()) f
  where (f ->> 'company_id')::uuid = (select ca from ids);
grant select on due to service_role;

-- A sent quote with its customer link, sent 4 days ago (schedule: 3 and 7 days). The test
-- moves dates as the server would (sent quotes and invoices are otherwise frozen).
set local app.quote_server = 'on';
set local app.invoice_server = 'on';
update quote set status = 'sent', sent_at = now() - interval '4 days'
where id = (select quote_a from ids);
insert into share_link (company_id, job_id, quote_id, token)
values ((select ca from ids), (select job_a from ids), (select quote_a from ids), 'tok-quote-a');

set local role service_role;
select results_eq($$ select template, token, email from due $$,
  $$ values ('quote_reminder_3', 'tok-quote-a', 'c@example.com') $$,
  'a quote sent 4 days ago is due its 3-day reminder');
reset role;

update quote set sent_at = now() - interval '8 days' where id = (select quote_a from ids);
set local role service_role;
select results_eq($$ select template from due $$, $$ values ('quote_reminder_7') $$,
  'a quote sent 8 days ago gets only the 7-day reminder');
insert into message (company_id, job_id, quote_id, channel, recipient, template, status)
values ((select ca from ids), (select job_a from ids), (select quote_a from ids), 'email',
        'c@example.com', 'quote_reminder_7', 'sent');
select is_empty($$ select * from due $$, 'each reminder goes out once');
select throws_ok(
  format($$ insert into message (company_id, job_id, quote_id, channel, recipient, template)
            values (%L, %L, %L, 'email', 'x@example.com', 'quote_reminder_7') $$,
         (select ca from ids), (select job_a from ids), (select quote_a from ids)),
  '23505', null, 'a second claim on the same reminder is refused');
reset role;

-- Accepted quotes get no reminders.
update quote set status = 'accepted' where id = (select quote_a from ids);
delete from message where template = 'quote_reminder_7';
set local role service_role;
select is_empty($$ select * from due $$, 'no reminders once the quote is accepted');
reset role;

-- An invoice sent 15 days ago with money still owed: the 14-day reminder.
update invoice set status = 'sent', sent_at = now() - interval '15 days', amount_paid_cents = 5000
where id = (select inv_a from ids);
insert into share_link (company_id, job_id, invoice_id, token)
values ((select ca from ids), (select job_a from ids), (select inv_a from ids), 'tok-inv-a');
set local role service_role;
select results_eq($$ select template, token from due $$,
  $$ values ('invoice_reminder_14', 'tok-inv-a') $$, 'an unpaid invoice gets its reminder');
reset role;

-- Paid three hours ago: a review request, only when the shop has a review link.
update invoice set status = 'paid', amount_paid_cents = total_cents,
  paid_at = now() - interval '3 hours' where id = (select inv_a from ids);
set local role service_role;
select is_empty($$ select * from due $$, 'no review request without a review link');
reset role;
update company set review_url = 'https://g.page/r/example' where id = (select ca from ids);
set local role service_role;
select results_eq($$ select template from due $$, $$ values ('review_request') $$,
  'a review request after payment');
reset role;
update company set settings = jsonb_set(settings, '{review_requests}', 'false')
where id = (select ca from ids);
set local role service_role;
select is_empty($$ select * from due $$, 'review requests can be turned off');
reset role;
update company set settings = jsonb_set(settings, '{review_requests}', 'true')
where id = (select ca from ids);

-- The customer opts out from their link; nothing else is sent to them.
create temp table shop as select name from company where id = (select ca from ids);
grant select on shop to anon;
set local role anon;
select is(shop_for_token('tok-inv-a'), (select name from shop),
  'the stop page names the shop');
select is(opt_out_for_token('nope'), null, 'an unknown link does nothing');
select isnt(opt_out_for_token('tok-inv-a'), null, 'the customer opts out from their link');
reset role;
select ok((select marketing_opt_out from customer where id = (select cust_a from ids)),
  'the customer is marked as opted out');
set local role service_role;
select is_empty($$ select * from due $$, 'no follow-ups after opting out');
reset role;

-- Only the server asks what is due.
select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select due_followups() $$, '42501', null, 'members cannot list follow-ups');
reset role;

select * from finish();
rollback;
