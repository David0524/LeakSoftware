-- Locks on a job (2026-10-20): day, time, or both; arrival_fixed is "both" for older builds.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select (a ->> 'owner')::uuid as owner_a, (a ->> 'job')::uuid as job_a from fx;
grant select on ids to authenticated;

select tests.authenticate_as((select owner_a from ids));
select is(tests.rows_affected(format($$ update job set lock_day = true where id = %L $$,
  (select job_a from ids))), 1::bigint, 'an owner locks a job to its day');
select is((select (lock_day, lock_time, arrival_fixed)::text from job where id = (select job_a from ids)),
  '(t,f,f)', 'a day lock alone is not a fixed time');
update job set lock_time = true where id = (select job_a from ids);
select is((select arrival_fixed from job where id = (select job_a from ids)), true,
  'day and time locked is the old fixed time');
update job set arrival_fixed = false where id = (select job_a from ids);
select is((select (lock_day, lock_time)::text from job where id = (select job_a from ids)),
  '(f,f)', 'an older build clearing the fixed time clears both locks');
update job set arrival_fixed = true where id = (select job_a from ids);
select is((select (lock_day, lock_time)::text from job where id = (select job_a from ids)),
  '(t,t)', 'and setting it sets both');
reset role;
select ok((select insert_columns @> '{lock_day,lock_time}' and update_columns @> '{lock_day,lock_time}'
           from app.sync_table where table_name = 'job'), 'locks sync');

select * from finish();
rollback;
