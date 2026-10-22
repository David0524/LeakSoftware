-- When a stop was finished (owner, 2026-10-22; docs/design/2026-10-22-owner-live-today.md): the
-- server stamps job.stop_done_at when a stop becomes done (Mark Complete on a leak or repair
-- job, a visit completed, a job moved on), keeps a phone's own time when it sends one, and
-- clears it when the stop is to do again. The tech who finished it can write it; the owner
-- reads it.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp table ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a,
  (select id from property where customer_id = (a ->> 'customer')::uuid limit 1) as prop_a,
  '00000000-0000-7000-8000-000000000641'::uuid as leak,
  '00000000-0000-7000-8000-000000000642'::uuid as visit
  from fx;
grant select on ids to authenticated;

insert into job (id, company_id, property_id, bill_to_customer_id, type, status, assigned_user_id,
  scheduled_start)
  select leak, ca, prop_a, cust_a, 'detection', 'scheduled', tech_a, now() from ids
  union all
  select visit, ca, prop_a, cust_a, 'maintenance', 'scheduled', tech_a, now() from ids;

create function pg_temp.done_at(j uuid) returns timestamptz
language sql as $$ select stop_done_at from job where id = j $$;

select is(pg_temp.done_at((select leak from ids)), null, 'a stop to do has no done time');

-- The tech marks the leak job's stop done (Today's Mark Complete).
select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected(format($$ update job set stop_done_on = current_date where id = %L $$,
  (select leak from ids))), 1::bigint, 'the tech marks their stop done');
select is(pg_temp.done_at((select leak from ids)), now(), 'the server stamps when');

-- Mark Not Complete clears it.
update job set stop_done_on = null where id = (select leak from ids);
select is(pg_temp.done_at((select leak from ids)), null, 'Mark Not Complete clears it');

-- Moving on in the pipeline keeps the time it was done.
update job set stop_done_on = current_date, stop_done_at = '2026-10-22 15:42:00+00'
  where id = (select leak from ids);
update job set status = 'in_progress' where id = (select leak from ids);
reset role;  -- the server sends the report
update job set status = 'report_sent' where id = (select leak from ids);
select tests.authenticate_as((select tech_a from ids));
select is(pg_temp.done_at((select leak from ids)), '2026-10-22 15:42:00+00'::timestamptz,
  'a stop already done keeps its time when the job moves on');

-- A phone that was offline sends its own time with the change.
select is(tests.rows_affected(format($$ update job set status = 'done',
  stop_done_at = '2026-10-22 14:05:00+00' where id = %L $$, (select visit from ids))),
  1::bigint, 'the tech completes a visit with the phone''s time');
select is(pg_temp.done_at((select visit from ids)), '2026-10-22 14:05:00+00'::timestamptz,
  'the phone''s time is kept');

-- Reopen Visit clears it; completing again without a time stamps now.
update job set status = 'in_progress' where id = (select visit from ids);
select is(pg_temp.done_at((select visit from ids)), null, 'Reopen Visit clears it');
update job set status = 'done' where id = (select visit from ids);
select is(pg_temp.done_at((select visit from ids)), now(), 'completing it again stamps the new time');

-- The owner sees it.
reset role;
select tests.authenticate_as((select owner_a from ids));
select ok((select stop_done_at from job where id = (select visit from ids)) is not null,
  'the owner reads when a tech finished a stop');

-- Synced to phones, and written by them.
reset role;
select ok((select 'stop_done_at' = any (update_columns) from app.sync_table where table_name = 'job'),
  'phones send it');

select * from finish();
rollback;
