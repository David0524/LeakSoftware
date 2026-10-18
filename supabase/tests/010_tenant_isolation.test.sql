-- Tenant isolation on every company-scoped table, for owners, admins, and techs.
begin;
set search_path = public, extensions;
select no_plan();

grant select on app.sync_table to authenticated;
create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;

-- Every public table with company_id is registered (and so has generated policies).
select is(
  (select array_agg(c.table_name::text order by c.table_name)
   from information_schema.columns c
   where c.table_schema = 'public' and c.column_name = 'company_id'
     and c.table_name::text not in (select table_name from app.sync_table)),
  null,
  'every company-scoped table is registered in app.sync_table');

-- Every public table has RLS on.
select is(
  (select array_agg(relname::text) from pg_class
   where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity),
  null,
  'RLS is enabled on every public table');

-- Owner of company A.
select tests.authenticate_as((select (a ->> 'owner')::uuid from fx));
select tests.check_table_access(table_name,
  (select (a ->> 'company')::uuid from fx), (select (b ->> 'company')::uuid from fx), 'owner')
from app.sync_table order by sort_order;
reset role;

-- Admin of company A: what owners could do, as managers (owner, 2026-10-18).
select tests.authenticate_as((select (a ->> 'admin')::uuid from fx));
select tests.check_table_access(table_name,
  (select (a ->> 'company')::uuid from fx), (select (b ->> 'company')::uuid from fx), 'admin')
from app.sync_table order by sort_order;
reset role;

-- Tech of company A.
select tests.authenticate_as((select (a ->> 'tech')::uuid from fx));
select tests.check_table_access(table_name,
  (select (a ->> 'company')::uuid from fx), (select (b ->> 'company')::uuid from fx), 'tech')
from app.sync_table order by sort_order;
reset role;

-- Profiles: teammates visible, other companies' people not.
select tests.authenticate_as((select (a ->> 'tech')::uuid from fx));
select is((select count(*) from profile where id = (select (a ->> 'owner')::uuid from fx)), 1::bigint,
  'profile: tech sees own owner');
select is((select count(*) from profile where id in (
    select (b ->> 'owner')::uuid from fx union select (b ->> 'tech')::uuid from fx)), 0::bigint,
  'profile: tech cannot see other company people');
select is(
  tests.rows_affected(format('update profile set full_name = %L where id = %L', 'x',
    (select a ->> 'owner' from fx))), 0::bigint,
  'profile: cannot edit a teammate''s profile');
select is(
  tests.rows_affected('update profile set full_name = ''Tech A'' where id = auth.uid()'), 1::bigint,
  'profile: can edit own profile');
reset role;

-- A user with no company sees nothing.
select tests.authenticate_as(tests.create_user('loner@test.local'));
select is((select count(*) from job), 0::bigint, 'user without a company sees no jobs');
select is((select count(*) from company), 0::bigint, 'user without a company sees no companies');
reset role;

-- A disabled member loses access.
update membership set status = 'disabled'
where user_id = (select (a ->> 'tech')::uuid from fx);
select tests.authenticate_as((select (a ->> 'tech')::uuid from fx));
select is((select count(*) from job), 0::bigint, 'disabled member sees no jobs');
reset role;

-- Grants: anon has nothing; nobody deletes through the API.
select is(
  (select array_agg(c.relname::text) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'))),
  null, 'anon has no table privileges');
select is(
  (select array_agg(c.relname::text) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and (has_table_privilege('authenticated', c.oid, 'DELETE')
          or has_table_privilege('authenticated', c.oid, 'TRUNCATE'))),
  null, 'authenticated cannot delete or truncate any table');

select * from finish();
rollback;
