-- On My Way on the job (2026-10-20): a tech records it on their stop, and it syncs.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a from fx;
grant select on ids to authenticated;

select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected(format($$ update job set on_my_way_at = now(),
  arrive_at = now() + interval '20 minutes' where id = %L $$, (select job_a from ids))), 1::bigint,
  'a tech records On My Way and the arrival time');
reset role;
select ok((select insert_columns @> '{on_my_way_at,arrive_at}' and update_columns @> '{on_my_way_at,arrive_at}'
           from app.sync_table where table_name = 'job'), 'and it syncs');

select * from finish();
rollback;
