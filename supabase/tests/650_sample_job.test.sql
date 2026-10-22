-- The sample job (owner, 2026-10-22: "First win within about 60 seconds"; 20261022000400):
-- a new leak detection shop gets one finished sample on today's schedule, marked as a sample,
-- that follows the shop's logo, is never counted, deletes cleanly and never comes back.
begin;
set search_path = public, extensions;
select no_plan();

select tests.authenticate_as(tests.create_user('sample-owner@test.local'));
create temp table shop on commit drop as
  select create_company('Sample Test Leaks', 'America/Phoenix', 'leak') as id;
reset role;
select tests.authenticate_as(tests.create_user('sample-pool@test.local'));
create temp table pool_shop on commit drop as
  select create_company('Sample Test Pools', 'America/Phoenix', 'pool') as id;
reset role;
grant select on shop, pool_shop to authenticated;
create temp table s on commit drop as
  select j.id as job, j.company_id as co, j.assigned_user_id as owner, r.id as report,
         sl.token
  from job j join report r on r.job_id = j.id join share_link sl on sl.report_id = r.id
  where j.company_id = (select id from shop) and j.sample;
grant select on s to authenticated;

-- Made once, for leak detection shops, finished, on today's schedule.
select is((select count(*)::int from s), 1, 'a new leak detection shop has one sample job');
select is((select count(*)::int from job where company_id = (select id from pool_shop)), 0,
  'a pool care shop gets none (its report is a leak detection report)');
select is((select status from job where id = (select job from s)), 'report_sent',
  'the sample opens finished');
select is((select number from job where id = (select job from s)), null,
  'the sample takes no job number');
select is((select (scheduled_start at time zone 'America/Phoenix')::date from job
           where id = (select job from s)),
  (now() at time zone 'America/Phoenix')::date, 'it is on today''s schedule');
select is((select assigned_user_id from job where id = (select job from s)),
  (select user_id from membership where company_id = (select id from shop) and role = 'owner'),
  'it is the owner''s stop');
select is((select status from report where id = (select report from s)), 'sent',
  'its report is finished, with a link');
select is((select data_snapshot -> 'job' ->> 'sample' from report where id = (select report from s)),
  'true', 'the report knows it is a sample (and says so)');
select ok((select final_sections -> 0 ->> 'text' from report where id = (select report from s))
          like 'This is a sample report%', 'its text says it is a sample');
select is((select count(*)::int from finding where job_id = (select job from s)), 2,
  'it has its findings');
select is((select count(*)::int from checklist_item_result
           where job_id = (select job from s) and status = 'pending'), 0,
  'its checklist is finished');

-- The first real job is still the shop's first number.
insert into customer (company_id, name) values ((select id from shop), 'Real Customer');
insert into property (company_id, customer_id, address_line1)
  select (select id from shop), id, '1 Real St' from customer where name = 'Real Customer';
insert into job (company_id, property_id)
  select (select id from shop), id from property where address_line1 = '1 Real St';
select is((select number from job where company_id = (select id from shop) and not sample), 1001,
  'the first real job is number 1001');

-- Never counted.
select is((select count(*)::int from activity where job_id = (select job from s)), 0,
  'the sample makes no Activity');
select tests.authenticate_as((select owner from s));
select is((select owner_dashboard((select co from s)) -> 'statuses' ->> 'report_sent'), null,
  'the Dashboard leaves it out');
reset role;
select is((select record_report_opened((select token from s))), null,
  'opening its link is never "the customer opened it"');

-- Its report follows the shop's logo and name; nothing else about it can change.
update company set logo_path = (select co from s)::text || '/logo.png', name = 'Renamed Leaks'
  where id = (select co from s);
select is((select data_snapshot -> 'company' ->> 'logo_path' from report where id = (select report from s)),
  (select co from s)::text || '/logo.png', 'the report shows the logo added in Settings');
select is((select data_snapshot -> 'company' ->> 'name' from report where id = (select report from s)),
  'Renamed Leaks', 'and the shop''s new name');
select throws_ok(
  format('update report set final_sections = ''[]'' where id = %L', (select report from s)),
  '23514', null, 'its text stays as it is');

-- Members can't make a job a sample.
select tests.authenticate_as((select owner from s));
select throws_ok(
  format('update job set sample = true where company_id = %L and not sample', (select co from s)),
  '42501', null, 'sample is set by the server only');

-- Deleting it removes what was made for it, and it never comes back.
select is((select delete_sample_job((select job from s))), true, 'the owner deletes the sample');
reset role;
select isnt((select deleted_at from job where id = (select job from s)), null, 'the job is gone');
select isnt((select deleted_at from report where id = (select report from s)), null,
  'its report is gone');
select is((select count(*)::int from share_link where job_id = (select job from s)
           and revoked_at is null), 0, 'its link no longer works');
select is((select count(*)::int from customer where company_id = (select co from s)
           and name = 'Sample Customer' and deleted_at is null), 0, 'its customer is gone');
select is((select app.create_sample_job((select co from s), (select owner from s))), null,
  'a deleted sample never comes back');
select tests.authenticate_as((select owner from s));
select is((select delete_sample_job((select job from s))), false, 'deleting twice does nothing');
reset role;

-- Another shop's member can't delete it.
select tests.authenticate_as(tests.create_user('sample-other@test.local'));
create temp table other on commit drop as
  select create_company('Other Leaks', 'America/Phoenix', 'both') as id;
reset role;
create temp table other_job on commit drop as
  select id from job where company_id = (select id from other) and sample;
grant select on other, other_job to authenticated;
select tests.authenticate_as((select owner from s));
select is((select delete_sample_job((select id from other_job))), false,
  'a sample can only be deleted by its own shop');
reset role;
select is((select count(*)::int from job where company_id = (select id from other) and sample
           and deleted_at is null), 1, 'a Both shop gets one too, untouched by others');

select * from finish();
rollback;
