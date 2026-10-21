-- Owners decide whether techs can make new jobs (owner, 2026-10-18). On by default.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
-- Written for a shop whose techs see every job (new shops start with only their own,
-- 2026-10-20; 190_job_visibility covers that).
update company set settings = settings || '{"techs_see_all_jobs": true}'
  where id in (select (a ->> 'company')::uuid from fx);
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated;

create function pg_temp.new_job() returns text language sql as $$
  select format($q$ insert into job (company_id, property_id, bill_to_customer_id, status)
                    values (%L, %L, %L, 'unscheduled') $q$,
    (select ca from ids), (select prop_a from ids), (select cust_a from ids))
$$;
grant execute on function pg_temp.new_job() to authenticated;

select tests.authenticate_as((select tech_a from ids));
select lives_ok(pg_temp.new_job(), 'techs make jobs by default');
reset role;

update company set settings = settings || '{"techs_make_jobs": false}' where id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select throws_ok(pg_temp.new_job(), '42501', null, 'turned off, techs can''t');
reset role;
select tests.authenticate_as((select owner_a from ids));
select lives_ok(pg_temp.new_job(), 'owners always can');
reset role;

select * from finish();
rollback;
