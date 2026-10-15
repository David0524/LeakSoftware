-- Phones keep open jobs and the last 90 days, not the whole history (20261012003400).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (b ->> 'owner')::uuid as owner_b,
  (a ->> 'job')::uuid as job_a, (a ->> 'quote')::uuid as quote_a, (a ->> 'invoice')::uuid as invoice_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a from fx;
grant select on ids to authenticated;

-- A second job, still open but booked long ago.
create temp table open_job as select gen_random_uuid() as id;
grant select on open_job to authenticated;
insert into job (id, company_id, property_id, status)
  select (select id from open_job), ca, prop_a, 'unscheduled' from ids;

-- Age both: the sample job finished 200 days ago; the open one was last touched then too.
set session_replication_role = replica;
update job set status = 'done', scheduled_start = now() - interval '201 days',
               completed_at = now() - interval '200 days', updated_at = now() - interval '200 days'
  where id = (select job_a from ids);
update job set updated_at = now() - interval '200 days', created_at = now() - interval '200 days'
  where id = (select id from open_job);
set session_replication_role = origin;

-- Which jobs phones keep. (Pulls over committed data, paging and the jobs sent again, are
-- covered in packages/sync/test/integration/history-window.test.ts: inside this one test
-- transaction a pull holds back everything written so far.)
select tests.authenticate_as((select owner_a from ids));
select ok(not (select job_a from ids) = any (app.phone_job_ids()),
  'a job finished 200 days ago is not on phones');
select ok((select id from open_job) = any (app.phone_job_ids()),
  'an open job stays on phones however old');
select ok(app.job_on_phones('done', now() - interval '20 days', now() - interval '20 days',
                            now() - interval '20 days'),
  'a job finished 20 days ago is');
select ok(not app.job_on_phones('canceled', null, null, now() - interval '91 days'),
  'a job canceled 91 days ago is not');

-- The office reopens the old job: it is noted so phones get it back whole.
update job set status = 'in_progress' where id = (select job_a from ids);
reset role;
select is((select count(*)::int from app.job_resend where job_id = (select job_a from ids)), 1,
  'reopening an old job notes it for phones');
update job set summary_notes = 'Again' where id = (select job_a from ids);
select is((select count(*)::int from app.job_resend where job_id = (select job_a from ids)), 1,
  'but not again while it is on phones');

select tests.authenticate_as((select owner_a from ids));
select is((select count(*)::int from app.resent_jobs('0'::xid8, '18446744073709551615'::xid8)
           r where r.job_id = (select job_a from ids)), 1,
  'its shop is told the job came back');
reset role;
select tests.authenticate_as((select owner_b from ids));
select is((select count(*)::int from app.resent_jobs('0'::xid8, '18446744073709551615'::xid8)
           r where r.job_id = (select job_a from ids)), 0,
  'another shop is not');

reset role;
select * from finish();
rollback;
