-- Business rules enforced by the database.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (b ->> 'company')::uuid as cb,
  (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'property')::uuid as prop_a, (b ->> 'property')::uuid as prop_b,
  (a ->> 'report')::uuid as report_a, (a ->> 'quote')::uuid as quote_a,
  (a ->> 'invoice')::uuid as invoice_a, (a ->> 'customer')::uuid as cust_a from fx;
grant select on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Checklist: excluded needs a reason, inspected needs a method
-- ---------------------------------------------------------------------------
create temp view comp as
  select id, company_id, job_id from job_component where company_id = (select ca from ids) limit 1;

-- M8.5: "not applicable" (excluded) needs no reason, and a verdict needs no method.
select lives_ok(
  format('update checklist_item_result set status = ''excluded'', exclusion_reason = null where job_component_id = %L',
    (select id from comp)),
  'checklist: not applicable needs no reason');
select lives_ok(
  format('update checklist_item_result set status = ''excluded'', exclusion_reason = ''No diver on site'' where job_component_id = %L',
    (select id from comp)),
  'checklist: not applicable can carry a reason');
select lives_ok(
  format('update checklist_item_result set status = ''inspected'', outcome = ''leaking'', location_text = ''At the fitting'', method = null where job_component_id = %L',
    (select id from comp)),
  'checklist: a leaking verdict with where, without a method');
select throws_ok(
  format('update checklist_item_result set outcome = ''maybe'' where job_component_id = %L',
    (select id from comp)),
  '23514', null, 'checklist: unknown verdicts are rejected');

-- ---------------------------------------------------------------------------
-- Job status machine
-- ---------------------------------------------------------------------------
select throws_ok(
  format('insert into job (company_id, property_id, status) values (%L, %L, ''paid'')',
    (select ca from ids), (select prop_a from ids)),
  '23514', null, 'job: cannot be created as paid');

select tests.authenticate_as((select tech_a from ids));
select throws_ok(
  format('update job set status = ''paid'' where id = %L', (select job_a from ids)),
  '23514', null, 'job: cannot skip from in_progress to paid');
select throws_ok(
  format('update job set status = ''report_sent'' where id = %L', (select job_a from ids)),
  '42501', null, 'job: tech cannot set a server-only status');
select lives_ok(
  format('update job set status = ''scheduled'' where id = %L', (select job_a from ids)),
  'job: tech can move a job back to scheduled');
select lives_ok(
  format('insert into job (id, company_id, property_id, status) values (gen_random_uuid(), %L, %L, ''in_progress'')',
    (select ca from ids), (select prop_a from ids)),
  'job: tech creates a job already in progress (offline start)');
reset role;

select lives_ok(
  format('update job set status = ''in_progress'' where id = %L; update job set status = ''report_sent'' where id = %L',
    (select job_a from ids), (select job_a from ids)),
  'job: server sets report_sent');

-- ---------------------------------------------------------------------------
-- Server-owned columns cannot be written by app users
-- ---------------------------------------------------------------------------
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format('update quote set accepted_at = now() where id = %L', (select quote_a from ids)),
  '42501', null, 'quote: accepted_at is server-owned');
select throws_ok(format('update quote set status = ''accepted'' where id = %L', (select quote_a from ids)),
  '42501', null, 'quote: status is server-owned');
select throws_ok(format('update invoice set status = ''paid'' where id = %L', (select invoice_a from ids)),
  '42501', null, 'invoice: status is server-owned');
select throws_ok(format('update invoice set amount_paid_cents = 1 where id = %L', (select invoice_a from ids)),
  '42501', null, 'invoice: amount paid is server-owned');
select throws_ok('update payment set status = ''succeeded''',
  '42501', null, 'payment: app users cannot change payments');
select throws_ok(format('update job set number = 1 where id = %L', (select job_a from ids)),
  '42501', null, 'job: number is server-owned');
select throws_ok('update media set sha256 = repeat(''b'', 64)',
  '42501', null, 'media: file hash cannot be changed');
select throws_ok('update report set ai_draft = ''{}''',
  '42501', null, 'report: AI draft is server-owned');
select throws_ok('update company set id = gen_random_uuid()',
  '42501', null, 'company: tenancy cannot be changed');
select throws_ok(
  format('update customer set company_id = %L where id = %L', (select cb from ids), (select cust_a from ids)),
  '42501', null, 'customer: cannot be moved to another company');
reset role;

-- ---------------------------------------------------------------------------
-- Sent reports are frozen
-- ---------------------------------------------------------------------------
update report set status = 'sent', sent_at = now(), final_sections = '[]'
where id = (select report_a from ids);

select tests.authenticate_as((select tech_a from ids));
select throws_ok(
  format('update report set final_sections = ''[{"x": 1}]'' where id = %L', (select report_a from ids)),
  '23514', null, 'report: sent report text cannot change');
reset role;
select throws_ok(
  format('update report set pdf_path = ''x'' where id = %L', (select report_a from ids)),
  '23514', null, 'report: even the server cannot change a sent report');
select lives_ok(
  format('update report set status = ''superseded'' where id = %L', (select report_a from ids)),
  'report: a sent report can be marked superseded');
select throws_ok(
  format('update report set status = ''draft'' where id = %L', (select report_a from ids)),
  '23514', null, 'report: superseded report cannot change');

-- ---------------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(number order by number) from job where company_id = (select ca from ids)),
  array[1001, 1002], 'numbers: jobs numbered per company from 1001');
select is((select number from job where company_id = (select cb from ids)), 1001,
  'numbers: each company has its own sequence');
select is((select number from quote where id = (select quote_a from ids)), 1001,
  'numbers: quotes are numbered');

-- ---------------------------------------------------------------------------
-- Cross-company references are impossible, even for the server
-- ---------------------------------------------------------------------------
select throws_ok(
  format('insert into job (company_id, property_id) values (%L, %L)', (select ca from ids), (select prop_b from ids)),
  '23503', null, 'job: cannot reference another company''s property');
select throws_ok(
  format('insert into job (company_id, property_id, assigned_user_id) values (%L, %L, %L)',
    (select ca from ids), (select prop_a from ids), (select (b ->> 'tech')::uuid from fx)),
  '23503', null, 'job: cannot be assigned to someone outside the company');

-- ---------------------------------------------------------------------------
-- Team management (checked while tech_a is still a tech)
-- ---------------------------------------------------------------------------
select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected('update membership set role = ''owner'''), 0::bigint,
  'membership: a tech cannot change roles');
select throws_ok(format('select create_invite(%L, ''x@test.local'')', (select ca from ids)),
  '42501', null, 'invite: techs cannot invite');
reset role;

-- ---------------------------------------------------------------------------
-- Last owner
-- ---------------------------------------------------------------------------
select tests.authenticate_as((select owner_a from ids));
select throws_ok(
  'update membership set role = ''tech'' where user_id = auth.uid()',
  '23514', null, 'membership: the last owner cannot demote themselves');
select throws_ok(
  'update membership set status = ''disabled'' where user_id = auth.uid()',
  '23514', null, 'membership: the last owner cannot disable themselves');
select lives_ok(
  format('update membership set role = ''owner'' where user_id = %L', (select tech_a from ids)),
  'membership: owner promotes the tech');
select lives_ok(
  'update membership set role = ''tech'' where user_id = auth.uid()',
  'membership: with another owner, an owner can step down');
reset role;

-- ---------------------------------------------------------------------------
-- Signup
-- ---------------------------------------------------------------------------
select tests.authenticate_as(tests.create_user('founder@test.local'));
create temp table signup on commit drop as select create_company('Founder Leak Co', 'America/Denver') as id;
select is((select role from membership where company_id = (select id from signup) and user_id = auth.uid()),
  'owner', 'signup: creator becomes owner');
select is((select count(*) from component_type where company_id = (select id from signup)
            and job_type = 'detection'), 27::bigint,
  'signup: default checklist components copied');
select is((select count(*) from component_type where company_id = (select id from signup)
            and job_type = 'maintenance'), 9::bigint,
  'signup: the maintenance checklist too');
select is((select count(*) from component_type where company_id = (select id from signup) and section = 'bond_beam'), 5::bigint,
  'signup: checklist items come in sections');
select is((select count(*) from test_type where company_id = (select id from signup)), 4::bigint,
  'signup: default test types copied');
select is((select count(*) from price_book_item where company_id = (select id from signup)), 26::bigint,
  'signup: both packages: both sample price books (10 leak, 16 pool)');
select is((select enabled from report_template where company_id = (select id from signup) and key = 'insurance'),
  false, 'signup: insurance template exists but is disabled');
select is((select status from subscription where company_id = (select id from signup)), 'trialing',
  'signup: trial starts');
select ok((select trial_ends_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour'
            from subscription where company_id = (select id from signup)), 'signup: the trial is 30 days');
select is((select onboarded_at from subscription where company_id = (select id from signup)), null,
  'signup: a new shop has onboarding to do');
select throws_ok('select create_company(''X'', ''Not/AZone'')', '22023', null,
  'signup: unknown time zone rejected');
reset role;

select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok('select create_company(''Nobody Co'')', '42501', null,
  'signup: must be signed in');
reset role;
set local role anon;
select throws_ok('select create_company(''Anon Co'')', '42501', null,
  'signup: anon cannot call create_company');
reset role;

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------
-- owner_a stepped down above; tech_a is now the owner.
select tests.authenticate_as((select tech_a from ids));
create temp table inv on commit drop as
  select create_invite((select ca from ids), 'Newbie@Test.local', 'tech') as token;
reset role;

select tests.authenticate_as(tests.create_user('someone-else@test.local'));
select throws_ok(format('select accept_invite(%L)', (select token from inv)),
  '42501', null, 'invite: cannot be accepted by a different email');
reset role;

select tests.authenticate_as(tests.create_user('newbie@test.local'));
select is(accept_invite((select token from inv)), (select ca from ids),
  'invite: accepted by the invited email (case-insensitive)');
select is((select role from membership where user_id = auth.uid()), 'tech',
  'invite: new member has the invited role');
select ok((select count(*) from job) > 0, 'invite: new member sees company jobs');
select throws_ok(format('select accept_invite(%L)', (select token from inv)),
  '22023', null, 'invite: cannot be reused');
reset role;

update invite set expires_at = now() - interval '1 day'
where company_id = (select ca from ids) and accepted_at is null;
select tests.authenticate_as(tests.create_user('new-a@test.local'));
select throws_ok(
  format('select accept_invite(%L)', (select token from invite where email = 'new-a@test.local')),
  '22023', null, 'invite: expired invites are rejected');
reset role;

-- ---------------------------------------------------------------------------
-- Everyday writes by a tech, and sync bookkeeping
-- ---------------------------------------------------------------------------
select tests.authenticate_as(
  (select user_id from membership where company_id = (select ca from ids) and user_id <> (select tech_a from ids)
     and role = 'tech' and user_id <> (select owner_a from ids) limit 1));
select lives_ok(
  format('insert into customer (id, company_id, name) values (gen_random_uuid(), %L, ''Walk-in'')',
    (select ca from ids)),
  'tech: creates a customer');
select lives_ok(
  format('update customer set deleted_at = now() where id = %L', (select cust_a from ids)),
  'tech: soft-deletes a customer');
select is((select count(*) from customer where id = (select cust_a from ids) and deleted_at is not null),
  1::bigint, 'soft-deleted rows stay visible so the deletion syncs');
reset role;

create temp table before_touch on commit drop as
  select created_at, updated_at, sync_xid from customer where id = (select cust_a from ids);
select ok(
  (select c.updated_at >= b.updated_at and c.created_at = b.created_at
   from customer c, before_touch b where c.id = (select cust_a from ids)),
  'touch: created_at is preserved');
select ok(
  (select sync_xid = pg_current_xact_id() from customer where id = (select cust_a from ids)),
  'touch: sync_xid is stamped with the writing transaction');

select * from finish();
rollback;
