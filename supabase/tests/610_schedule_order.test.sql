-- The order of techs on the Schedule (2026-10-21): owners and admins set it, techs and other
-- shops can't.
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

select is((select count(*)::int from membership
           where company_id = (select ca from ids) and schedule_order is not null),
  0, 'nobody has a place until someone reorders');

select tests.authenticate_as((select owner_a from ids));
select is(tests.rows_affected(format($$ update membership set schedule_order = 1 where user_id = %L $$,
  (select tech_a from ids))), 1::bigint, 'an owner places a tech');
reset role;

select tests.authenticate_as((select admin_a from ids));
select is(tests.rows_affected(format($$ update membership set schedule_order = 2 where user_id = %L $$,
  (select owner_a from ids))), 1::bigint, 'an admin places the owner');
select is(tests.rows_affected(format($$ update membership set schedule_order = 3 where user_id = %L $$,
  (select admin_a from ids))), 1::bigint, 'and themselves');
reset role;

select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected(format($$ update membership set schedule_order = 1 where user_id = %L $$,
  (select tech_a from ids))), 0::bigint, 'a tech can''t reorder');
reset role;

select tests.authenticate_as((select owner_b from ids));
select is(tests.rows_affected(format($$ update membership set schedule_order = 9 where user_id = %L $$,
  (select tech_a from ids))), 0::bigint, 'another shop''s owner can''t');
reset role;

select is((select array_agg(schedule_order order by schedule_order) from membership
           where company_id = (select ca from ids)),
  '{1,2,3}'::int[], 'the places are saved');
select throws_ok(format($$ update membership set schedule_order = 0 where user_id = %L $$,
  (select tech_a from ids)), '23514', null, 'places start at 1');
select ok((select update_columns @> '{schedule_order}' from app.sync_table where table_name = 'membership'),
  'the order syncs');

select * from finish();
rollback;
