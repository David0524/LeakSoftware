-- Service issues (20261022004600_service_issues.sql; docs/design/2026-11-16-service-issues.md):
-- techs report, owners and admins resolve or make a job of them, the photos go with the job.
-- Tenant isolation for owners and techs runs in 010_tenant_isolation (tests.make_company).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'admin')::uuid as admin_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a,
  (a ->> 'job')::uuid as job_a
  from fx;
grant select on ids to authenticated;

select ok((select '{customer_id,property_id,job_id,description,suggested_type,reported_at}'::text[]
                  = insert_columns
           from app.sync_table where table_name = 'service_issue'), 'phones report issues');
select ok((select '{description,suggested_type,status,resolution_note,resolved_by,resolved_at,converted_job_id,deleted_at}'::text[]
                  = update_columns
           from app.sync_table where table_name = 'service_issue'), 'and resolve them offline');
select ok((select 'service_issue_id' = any (insert_columns) from app.sync_table
           where table_name = 'media'), 'photos are linked to an issue when taken');

-- ---------------------------------------------------------------------------
-- A tech reports one on their visit, with a photo
-- ---------------------------------------------------------------------------

create temp table issue (id uuid, media uuid);
grant all on issue to authenticated;
insert into issue values (gen_random_uuid(), gen_random_uuid());

select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$
  insert into service_issue (id, company_id, customer_id, property_id, job_id, description,
                             suggested_type)
  values (%L, %L, %L, %L, %L, 'Cracked skimmer throat', 'repair') $$,
  (select id from issue), (select ca from ids), (select cust_a from ids), (select prop_a from ids),
  (select job_a from ids)), 'a tech reports an issue on their visit');
select lives_ok(format($$
  insert into media (id, company_id, job_id, service_issue_id, kind, storage_path, upload_state)
  values (%L, %L, %L, %L, 'photo', %L, 'pending') $$,
  (select media from issue), (select ca from ids), (select job_a from ids), (select id from issue),
  (select ca || '/' || job_a || '/' || (select media from issue) || '.jpg' from ids)),
  'with a photo, taken on the visit');
select is((select status from service_issue where id = (select id from issue)), 'open',
  'a report is open');
select is((select reported_by from service_issue where id = (select id from issue)),
  (select tech_a from ids), 'reported by the tech');
select lives_ok(format($$ update service_issue set description = 'Cracked skimmer throat, leaking'
  where id = %L $$, (select id from issue)), 'the tech can say more');
select throws_ok(format($$ update service_issue set status = 'resolved', resolved_at = now()
  where id = %L $$, (select id from issue)), '42501', null, 'but can''t resolve it');
reset role;

-- A photo linked to an issue from another job is refused.
create temp table other_job as
  select gen_random_uuid() as id;
grant select on other_job to authenticated;
insert into job (id, company_id, property_id, bill_to_customer_id, status, assigned_user_id)
  select o.id, i.ca, i.prop_a, i.cust_a, 'scheduled', i.tech_a from other_job o, ids i;
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$
  insert into media (company_id, job_id, service_issue_id, kind)
  values (%L, %L, %L, 'photo') $$,
  (select ca from ids), (select id from other_job), (select id from issue)),
  '23503', null, 'an issue''s photo is on its visit');
reset role;

-- ---------------------------------------------------------------------------
-- The office resolves, reopens, and makes a job of it
-- ---------------------------------------------------------------------------

select tests.authenticate_as((select admin_a from ids));
select is(tests.rows_affected(format($$ update service_issue set status = 'resolved',
  resolution_note = 'Customer will replace it', resolved_by = %L, resolved_at = now()
  where id = %L $$, (select admin_a from ids), (select id from issue))), 1::bigint,
  'an admin resolves it with a note');
select is(tests.rows_affected(format($$ update service_issue set status = 'open',
  resolution_note = null, resolved_by = null, resolved_at = null where id = %L $$,
  (select id from issue))), 1::bigint, 'and reopens it');
select throws_ok(format($$ update service_issue set status = 'converted' where id = %L $$,
  (select id from issue)), '23514', null, 'a converted issue names its job');
reset role;

-- Make Quote: a repair job for the pool, the issue converted, the photo copied onto the job.
create temp table made as select gen_random_uuid() as job, gen_random_uuid() as copy;
grant select on made to authenticated;
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$
  insert into job (id, company_id, type, property_id, bill_to_customer_id, status, summary_notes)
  values (%L, %L, 'repair', %L, %L, 'unscheduled', 'Cracked skimmer throat, leaking') $$,
  (select job from made), (select ca from ids), (select prop_a from ids), (select cust_a from ids)),
  'the owner makes a repair job for the pool');
select is(tests.rows_affected(format($$ update service_issue set status = 'converted',
  converted_job_id = %L, resolved_by = %L, resolved_at = now() where id = %L $$,
  (select job from made), (select owner_a from ids), (select id from issue))), 1::bigint,
  'the issue becomes the job');
select lives_ok(format($$
  insert into media (id, company_id, job_id, service_issue_id, kind, storage_path, upload_state)
  select %L, company_id, %L, service_issue_id, kind, storage_path, upload_state
  from media where id = %L $$,
  (select copy from made), (select job from made), (select media from issue)),
  'its photo is copied onto the new job (the same file)');
select throws_ok(format($$
  insert into media (company_id, job_id, service_issue_id, kind)
  values (%L, %L, %L, 'photo') $$,
  (select ca from ids), (select id from other_job), (select id from issue)),
  '23503', null, 'but not onto any other job');
reset role;

select is((select upload_state from media where id = (select copy from made)), 'pending',
  'the copy waits for the original''s upload');
update media set upload_state = 'uploaded' where id = (select media from issue);
select is((select upload_state from media where id = (select copy from made)), 'uploaded',
  'and is uploaded with it');

-- ---------------------------------------------------------------------------
-- Techs who see only their own jobs
-- ---------------------------------------------------------------------------

update company set settings = settings || '{"techs_see_all_jobs": false}'
  where id = (select ca from ids);
-- Someone else's job, and an issue on it the tech didn't report.
create temp table hidden as select gen_random_uuid() as job, gen_random_uuid() as issue;
grant select on hidden to authenticated;
insert into job (id, company_id, property_id, bill_to_customer_id, status, assigned_user_id)
  select h.job, i.ca, i.prop_a, i.cust_a, 'scheduled', i.owner_a from hidden h, ids i;
insert into service_issue (id, company_id, customer_id, property_id, job_id, description, reported_by)
  select h.issue, i.ca, i.cust_a, i.prop_a, h.job, 'Heater won''t light', i.owner_a
  from hidden h, ids i;
insert into storage.objects (bucket_id, name)
  select 'media', storage_path from media where id = (select media from issue);

select tests.authenticate_as((select tech_a from ids));
select is((select count(*) from service_issue where id = (select issue from hidden)), 0::bigint,
  'a limited tech doesn''t see issues on others'' jobs');
select is((select count(*) from service_issue where id = (select id from issue)), 1::bigint,
  'but sees the ones they reported');
select ok(app.object_job_visible((select storage_path from media where id = (select media from issue))),
  'and the photo on their visit');
reset role;

-- The repair job goes to the tech; the visit it came from doesn't stay theirs.
update job set assigned_user_id = (select owner_a from ids) where id = (select job_a from ids);
update job set assigned_user_id = (select tech_a from ids) where id = (select job from made);
select tests.authenticate_as((select tech_a from ids));
select ok(app.object_job_visible((select storage_path from media where id = (select media from issue))),
  'a tech reads the copied photo on the job they were given');
select ok(not app.object_job_visible((select ca || '/' || job_a || '/other.jpg' from ids)),
  'but nothing else in the visit''s folder');
reset role;

select * from finish();
rollback;
