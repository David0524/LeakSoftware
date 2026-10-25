-- Require a Photo (owner, 2026-10-25): with the shop's switch on, a visit's report isn't sent
-- until the visit has a photo. By hand it's refused; automatically it waits; the monthly report
-- isn't held up.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as company_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'property')::uuid as prop_a, (a ->> 'customer')::uuid as cust_a from fx;
grant select on ids to authenticated, anon, service_role;

insert into job (id, company_id, type, property_id, bill_to_customer_id, status, assigned_user_id)
  select '00000000-0000-4000-8000-0000000b1001', company_a, 'maintenance', prop_a, cust_a,
         'in_progress', tech_a
  from ids;
update job set status = 'done', completed_at = now()
  where id = '00000000-0000-4000-8000-0000000b1001';
create temp view v as select '00000000-0000-4000-8000-0000000b1001'::uuid as visit;
grant select on v to authenticated, anon, service_role;

-- Off (the default): no photo needed.
select tests.authenticate_as((select tech_a from ids));
select ok((send_visit_report((select visit from v)) ->> 'token') is not null,
  'off by default: a visit with no photo sends');
reset role;

update company set settings = settings || '{"require_report_photo": true}'
  where id = (select company_a from ids);

select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select send_visit_report((select visit from v)) $$, '23514',
  'Add a photo to send this report.', 'on: sending by hand needs a photo');
reset role;

update company set settings = settings || '{"visit_reports": "auto"}'
  where id = (select company_a from ids);
delete from share_link where job_id = (select visit from v);
delete from report where job_id = (select visit from v);

select tests.authenticate_as((select tech_a from ids));
select is(send_visit_report((select visit from v), true) ->> 'skipped', 'no_photo',
  'an automatic send waits for a photo');
reset role;
set role service_role;
select is((select count(*) from visit_reports_due() where job_id = (select visit from v)),
  0::bigint, 'the daily catch-up skips a visit with no photo');
reset role;

-- A deleted photo doesn't count.
insert into media (company_id, job_id, kind, deleted_at)
  select company_a, (select visit from v), 'photo', now() from ids;
select tests.authenticate_as((select tech_a from ids));
select is(send_visit_report((select visit from v), true) ->> 'skipped', 'no_photo',
  'a deleted photo doesn''t count');
reset role;

-- A recording isn't a photo; a photo still uploading is.
insert into media (company_id, job_id, kind)
  select company_a, (select visit from v), 'video' from ids;
select tests.authenticate_as((select tech_a from ids));
select is(send_visit_report((select visit from v), true) ->> 'skipped', 'no_photo',
  'a video isn''t a photo');
reset role;
insert into media (company_id, job_id, kind, upload_state)
  select company_a, (select visit from v), 'photo', 'pending' from ids;
set role service_role;
select is((select count(*) from visit_reports_due() where job_id = (select visit from v)),
  1::bigint, 'with a photo, the daily catch-up finds it');
reset role;
select tests.authenticate_as((select tech_a from ids));
select ok((send_visit_report((select visit from v), true) ->> 'token') is not null,
  'with a photo (even one still uploading), it sends by itself');
select ok((send_visit_report((select visit from v)) ->> 'token') is not null,
  'and by hand');
reset role;

-- Monthly: the month's report goes with the invoice, photo or not.
update company set settings = settings || '{"visit_reports": "monthly"}'
  where id = (select company_a from ids);
insert into job (id, company_id, type, property_id, bill_to_customer_id, status, assigned_user_id)
  select '00000000-0000-4000-8000-0000000b1002', company_a, 'maintenance', prop_a, cust_a,
         'in_progress', tech_a
  from ids;
update job set status = 'done', completed_at = now()
  where id = '00000000-0000-4000-8000-0000000b1002';
create temp table m as select app.visit_month(j, c.timezone) as month
  from job j join company c on c.id = j.company_id
  where j.id = '00000000-0000-4000-8000-0000000b1002';
grant select on m to authenticated;
select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select send_visit_report('00000000-0000-4000-8000-0000000b1002') $$, '23514',
  'Add a photo to send this report.', 'in a Monthly shop, one visit''s report still needs a photo');
select ok((send_month_report((select cust_a from ids), (select month from m)) ->> 'token') is not null,
  'but the monthly report isn''t held up');
reset role;

select * from finish();
rollback;
