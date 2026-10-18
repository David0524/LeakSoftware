-- Who sees which jobs (owner request, 2026-10-13): with techs_see_all_jobs off, a tech sees
-- only jobs where they are the tech or second tech, and everything under them; owners see
-- all; customers and pools stay visible. Phones learn of changes through sync_scope.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
create temp table other as select tests.create_user('a-tech2@test.local') as tech2;
insert into membership (company_id, user_id, role)
  select (a ->> 'company')::uuid, (select tech2 from other), 'tech' from fx;
grant select on fx, other to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'property')::uuid as prop_a,
  (select tech2 from other) as tech2
  from fx;
grant select on ids to authenticated;

create temp table job_tables (t text);
insert into job_tables values ('job'), ('job_component'), ('checklist_item_result'),
  ('test_result'), ('finding'), ('report'), ('quote'), ('quote_line_item'), ('invoice'),
  ('invoice_line_item'), ('payment'), ('media'), ('signature'), ('share_link'), ('message');
grant select on job_tables to authenticated;

-- How many rows of each job table the current user sees, as one string.
create function pg_temp.seen() returns text language plpgsql as $$
declare r record; n int; out text := '';
begin
  for r in select t from job_tables order by t loop
    execute format('select count(*) from public.%I', r.t) into n;
    out := out || r.t || '=' || n || ' ';
  end loop;
  return trim(out);
end $$;
grant execute on function pg_temp.seen() to authenticated;

create temp table expect as select
  'checklist_item_result=1 finding=1 invoice=1 invoice_line_item=1 job=1 job_component=1 media=1 message=1 payment=1 quote=1 quote_line_item=1 report=1 share_link=1 signature=1 test_result=1'::text as all_one,
  'checklist_item_result=0 finding=0 invoice=0 invoice_line_item=0 job=0 job_component=0 media=0 message=0 payment=0 quote=0 quote_line_item=0 report=0 share_link=0 signature=0 test_result=0'::text as all_zero;
grant select on expect to authenticated;

-- Default: everyone sees every job.
select tests.authenticate_as((select tech2 from ids));
select is(pg_temp.seen(), (select all_one from expect), 'by default techs see every job');
select alike(sync_scope(), '%:all', 'and their phones sync everything');
reset role;

-- The owner limits techs to their own jobs.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ update company set settings = settings || '{"techs_see_all_jobs": false}'
                          where id = %L $$, (select ca from ids)), 'owners turn it off');
select is(pg_temp.seen(), (select all_one from expect), 'owners still see everything');
reset role;

select tests.authenticate_as((select tech2 from ids));
select is(pg_temp.seen(), (select all_zero from expect),
  'another tech sees none of the job, nor anything under it');
select results_eq($$ select count(*)::int from customer $$, $$ values (1) $$, 'customers stay visible');
select results_eq($$ select count(*)::int from property $$, $$ values (1) $$, 'and pools');
select is(tests.rows_affected(format($$ update job set summary_notes = 'x' where id = %L $$,
  (select job_a from ids))), 0::bigint, 'and cannot change it');
select throws_ok(format($$ insert into job (id, company_id, type, property_id, status, assigned_user_id)
  values (gen_random_uuid(), %L, 'detection', %L, 'unscheduled', %L) $$,
  (select ca from ids), (select prop_a from ids), (select tech_a from ids)), '42501', null,
  'cannot book a job for someone else');
select lives_ok(format($$ insert into job (id, company_id, type, property_id, status, assigned_user_id)
  values (gen_random_uuid(), %L, 'detection', %L, 'unscheduled', %L) $$,
  (select ca from ids), (select prop_a from ids), (select tech2 from ids)),
  'but can book one for themselves');
select alike(sync_scope(), '%:own%', 'their phone syncs only their jobs');
create temp table scope_before as select sync_scope() as s;
reset role;

select tests.authenticate_as((select tech_a from ids));
select is(pg_temp.seen(), (select all_one from expect), 'the job''s own tech sees it all');
reset role;

-- Made second tech: the job and everything under it appear, and the phone starts over.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ update job set second_tech_id = %L where id = %L $$,
  (select tech2 from ids), (select job_a from ids)), 'the owner adds a second tech');
reset role;
select tests.authenticate_as((select tech2 from ids));
select results_eq($$ select count(*)::int from job_component $$, $$ values (1) $$,
  'the second tech sees the job''s checklist');
select isnt(sync_scope(), (select s from scope_before), 'and their phone pulls everything again');
reset role;

-- Back on: everyone sees everything again.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ update company set settings = settings || '{"techs_see_all_jobs": true}'
                          where id = %L $$, (select ca from ids)), 'owners turn it back on');
reset role;
select tests.authenticate_as((select tech2 from ids));
select alike(sync_scope(), '%:all', 'phones sync everything again');
reset role;

select * from finish();
rollback;
