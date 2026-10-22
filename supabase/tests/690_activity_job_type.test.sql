-- Activity by job type (owner, 2026-10-22: "Add a filter on the jobs and activity pages for job
-- type"): activity_feed(..., job_type) keeps the events about jobs of that type; texts, which
-- are about a conversation, show only under All Types; row security still decides the rest.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp table ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'property')::uuid as prop_a,
  (a ->> 'customer')::uuid as cust_a, gen_random_uuid() as repair_job, gen_random_uuid() as conv
  from fx;
grant select on ids to authenticated;

-- make_company's job is a leak detection job; add a repair job and a customer's text.
select is((select type from job where id = (select job_a from ids)), 'detection',
  'the shop''s job is a leak detection job');
insert into job (id, company_id, property_id, bill_to_customer_id, status, type, assigned_user_id)
  select repair_job, ca, prop_a, cust_a, 'scheduled', 'repair', tech_a from ids;
insert into conversation (id, company_id, phone, customer_id)
  select conv, ca, '+16025550142', cust_a from ids;
insert into activity (company_id, kind, conversation_id, subject_id, customer_name, preview)
  select ca, 'text_received', conv, gen_random_uuid(), 'Customer a', 'Hi' from ids;

create function pg_temp.feed(only_type text) returns setof jsonb
language sql as $$
  select e from jsonb_array_elements(
    activity_feed((select ca from ids), null, null, 100, only_type) -> 'events') e
$$;

select tests.authenticate_as((select owner_a from ids));

select ok((select count(*) from pg_temp.feed('repair') e) >= 1, 'Repair shows the repair job''s events');
select is((select count(*)::int from pg_temp.feed('repair') e
           where e ->> 'job_id' is distinct from (select repair_job::text from ids)), 0,
  'and only them');
select ok((select count(*) from pg_temp.feed('detection') e
           where e ->> 'job_id' = (select job_a::text from ids)) >= 1,
  'Leak detection shows the leak job''s events');
select is((select count(*)::int from pg_temp.feed('detection') e where e ->> 'kind' = 'text_received'), 0,
  'a text is not about a job, so a type leaves it out');
select is((select count(*)::int from pg_temp.feed('maintenance') e), 0, 'a type with no jobs shows nothing');
select is((select count(*)::int from pg_temp.feed(null) e),
  (select count(*)::int from activity where company_id = (select ca from ids)),
  'All Types (null) shows everything');
select is((select count(*)::int from pg_temp.feed('') e),
  (select count(*)::int from activity where company_id = (select ca from ids)),
  'as does an empty type');
select ok((select count(*) from pg_temp.feed(null) e where e ->> 'kind' = 'text_received') >= 1,
  'texts included');
select is((select count(*)::int from jsonb_array_elements(
             activity_feed((select ca from ids), null, null, 100) -> 'events')),
  (select count(*)::int from activity where company_id = (select ca from ids)),
  'apps that send four arguments still get everything');

-- Pages of a type are full pages.
select is((select (activity_feed((select ca from ids), null, null, 1, 'repair') ->> 'more')::boolean),
  (select count(*) > 1 from pg_temp.feed('repair') e), 'a type''s page says when there is more');
reset role;

select is(has_function_privilege('anon', 'public.activity_feed(uuid, timestamptz, uuid, integer, text)', 'execute'),
  false, 'signed-out visitors can''t read it');
select is(has_function_privilege('authenticated', 'public.activity_feed(uuid, timestamptz, uuid, integer, text)', 'execute'),
  true, 'signed-in people can');

select * from finish();
rollback;
