-- Team profiles (owner, 2026-10-20): owners and admins keep each person's basic details, an
-- emergency contact and notes; techs can't read them; one profile per team member, and people
-- without the app can have one too.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated;

select tests.authenticate_as((select admin_a from ids));
select is((select count(*)::int from team_profile), 1, 'admins read their shop''s profiles');
select lives_ok(format($$ insert into team_profile (company_id, name, phone, address, notes)
  values (%L, 'Sam Helper', '(602) 555-0110', '12 Main St, Phoenix, AZ', 'Weekends only') $$,
  (select ca from ids)), 'and add someone without the app');
select throws_ok(format($$ insert into team_profile (company_id, user_id, name)
  values (%L, %L, 'Twice') $$, (select ca from ids), (select tech_a from ids)),
  '23505', null, 'one profile per team member');
select is(tests.rows_affected($$ update team_profile set emergency_phone = '(602) 555-0199'
  where name = 'Sam Helper' $$), 1::bigint, 'and edit them');
reset role;

select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from team_profile), 0, 'techs can''t read profiles, their own included');
select throws_ok(format($$ insert into team_profile (company_id, name) values (%L, 'Me') $$,
  (select ca from ids)), '42501', null, 'or add one');
reset role;

select tests.authenticate_as((select owner_b from ids));
select is((select count(*)::int from team_profile where company_id = (select ca from ids)), 0,
  'other shops see none');
reset role;

select is((select read_role || '/' || write_role from app.sync_table where table_name = 'team_profile'),
  'manager/manager', 'synced to owners'' and admins'' phones only');

select * from finish();
rollback;
