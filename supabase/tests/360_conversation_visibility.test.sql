-- Techs limited to their own jobs (security review 2026-10-16) see only the conversations of
-- customers they have a job with, and those conversations' texts and calls; numbers that
-- aren't a customer stay with the office. Owners and unlimited techs see everything.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
-- Written for a shop whose techs see every job (new shops start with only their own,
-- 2026-10-20; 190_job_visibility covers that).
update company set settings = settings || '{"techs_see_all_jobs": true}'
  where id in (select (a ->> 'company')::uuid from fx);
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a
  from fx;
grant select on ids to authenticated;

-- Another customer whose job is the owner's, and a text from an unknown number.
create temp table other on commit drop as select gen_random_uuid() as cust, gen_random_uuid() as prop,
  gen_random_uuid() as conv, gen_random_uuid() as stranger;
grant select on other to authenticated;
insert into customer (id, company_id, name) select cust, (select ca from ids), 'Other Customer' from other;
insert into property (id, company_id, customer_id, address_line1)
  select prop, (select ca from ids), cust, '2 Other St' from other;
insert into job (company_id, property_id, bill_to_customer_id, status, assigned_user_id)
  select (select ca from ids), prop, cust, 'scheduled', (select owner_a from ids) from other;
insert into conversation (id, company_id, phone, customer_id)
  select conv, (select ca from ids), '+16025550111', cust from other;
insert into text_message (company_id, conversation_id, direction, body, status)
  select (select ca from ids), conv, 'in', 'For the owner''s job', 'received' from other;
insert into conversation (id, company_id, phone)
  select stranger, (select ca from ids), '+16025550199' from other;

-- Not limited: the tech sees all three conversations.
select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from conversation), 3, 'an unlimited tech sees every conversation');
reset role;

update company set settings = settings || '{"techs_see_all_jobs": false}' where id = (select ca from ids);

select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from conversation), 1, 'a limited tech sees only their customer''s conversation');
select is((select count(*)::int from text_message), 1, 'and its texts');
select is((select count(*)::int from call_log), 1, 'and calls');
select is(tests.rows_affected(format($$ update conversation set unread = false where id = %L $$, (select conv from other))),
  0::bigint, 'and can''t touch another tech''s conversation');
reset role;

select tests.authenticate_as((select owner_a from ids));
select is((select count(*)::int from conversation), 3, 'the owner sees every conversation');
select is((select count(*)::int from text_message), 2, 'and every text');
reset role;

-- The job moves to someone else: the tech no longer sees that customer's conversation.
update job set assigned_user_id = (select owner_a from ids) where id = (select job_a from ids);
select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from conversation), 0, 'a job handed off takes its conversation with it');
reset role;

select * from finish();
rollback;
