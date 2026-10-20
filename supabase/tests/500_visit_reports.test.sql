-- Maintenance visit reports: sent by hand or automatically once, never when the shop turned
-- them off, frozen with the visit's chemicals, and opened at the customer link.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as company_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'property')::uuid as prop_a, (a ->> 'job')::uuid as leak_job from fx;
grant select on ids to authenticated, anon, service_role;

insert into job (id, company_id, type, property_id, status, assigned_user_id)
  select '00000000-0000-4000-8000-0000000a1001', company_a, 'maintenance', prop_a, 'in_progress', tech_a
  from ids;
insert into chemical_reading (company_id, property_id, job_id, recorded_by, gallons, fc, ph)
  select company_a, prop_a, '00000000-0000-4000-8000-0000000a1001', tech_a, 18000, 3, 7.4 from ids;
create temp view v as select '00000000-0000-4000-8000-0000000a1001'::uuid as visit;
grant select on v to authenticated, anon, service_role;

select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select send_visit_report((select leak_job from ids)) $$, '22023', null,
  'only maintenance visits have visit reports');
select is(send_visit_report((select visit from v), true) ->> 'skipped', 'manual',
  'shops send them by hand unless they chose automatic');

select ok((send_visit_report((select visit from v)) ->> 'token') is not null,
  'a tech sends one by hand, and gets the customer link');
select is((select (data_snapshot -> 'chemicals' -> 0 ->> 'ph')::numeric from report
           where job_id = (select visit from v) and template_key = 'maintenance' and version = 1), 7.4,
  'it carries the visit''s chemical readings');
select is((send_visit_report((select visit from v)) ->> 'version')::int, 2,
  'sending again sends a new version');
select is((select count(*) from report where job_id = (select visit from v) and status = 'sent'),
  1::bigint, 'and the earlier one is superseded');
reset role;

update company set settings = settings || '{"visit_reports": "auto"}'
  where id = (select company_a from ids);
delete from share_link where job_id = (select visit from v);
delete from report where job_id = (select visit from v);
select tests.authenticate_as((select tech_a from ids));
select is(send_visit_report((select visit from v), true) ->> 'skipped', 'not_done',
  'automatic sending waits for the visit to be done');
reset role;
update job set status = 'done', completed_at = now() where id = (select visit from v);
set role service_role;
select is((select count(*) from visit_reports_due() where job_id = (select visit from v)),
  1::bigint, 'the daily catch-up finds a done visit with no report');
reset role;
select tests.authenticate_as((select tech_a from ids));
select ok((send_visit_report((select visit from v), true) ->> 'token') is not null,
  'a done visit sends by itself');
select is(send_visit_report((select visit from v), true) ->> 'skipped', 'sent', 'only once');
select throws_ok($$ select * from visit_reports_due() $$, '42501', null,
  'members can''t list the catch-up');
reset role;

select ok((select report_for_token((select token from share_link
             where job_id = (select visit from v) order by created_at desc limit 1), false)) is not null,
  'the customer opens it at the link');

update company set settings = settings || '{"visit_reports": "off"}'
  where id = (select company_a from ids);
select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select send_visit_report((select visit from v)) $$, '23514', null,
  'turned off, it can''t be sent by hand');
select is(send_visit_report((select visit from v), true) ->> 'skipped', 'off', 'or by itself');
reset role;

-- The daily catch-up sends as the server.
update company set settings = settings || '{"visit_reports": "auto"}'
  where id = (select company_a from ids);
delete from share_link where job_id = (select visit from v);
delete from report where job_id = (select visit from v);
set role service_role;
select ok((send_visit_report((select visit from v), true) ->> 'token') is not null,
  'the server''s catch-up sends a due visit''s report');
reset role;

select * from finish();
rollback;
