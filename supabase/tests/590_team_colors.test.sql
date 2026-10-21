-- Team colors, when someone was turned off, and plan visits moved on their own (2026-10-20).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a, (a ->> 'customer')::uuid as cust_a,
  (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated;

-- Colors
select is((select array_agg(color order by array_position('{owner,admin,tech}', role)) from membership
           where company_id = (select ca from ids)),
  '{blue,green,orange}'::text[], 'members get the palette in the order they joined');
select is((select count(distinct color)::int from membership where company_id = (select ca from ids)),
  3, 'distinct within a shop');
select throws_ok(format($$ update membership set color = 'navy' where user_id = %L $$,
  (select tech_a from ids)), '23514', null, 'only palette colors');

-- The backfill's rule (by join order, counting everyone who has a color): distinct in a shop.
select is((select count(*)::int from (select company_id from membership
           group by company_id having count(distinct color) < least(count(*), 10)) x),
  0, 'no shop has two members sharing a color while one is free');
select is(app.next_tech_color((select ca from ids), true), 'purple',
  'the backfill counts every member');

-- Turned off: the next new member takes the first color no active member uses.
update membership set status = 'disabled' where user_id = (select tech_a from ids);
select isnt((select disabled_at from membership where user_id = (select tech_a from ids)), null,
  'turning someone off records when');
insert into membership (company_id, user_id, role)
  values ((select ca from ids), tests.create_user('a-new@test.local'), 'tech');
select is((select color from membership m join auth.users u on u.id = m.user_id
           where u.email = 'a-new@test.local'),
  'orange', 'a new member gets the first color no active member uses');
insert into membership (company_id, user_id, role, color)
  values ((select ca from ids), tests.create_user('a-chosen@test.local'), 'tech', 'teal');
select is((select color from membership m join auth.users u on u.id = m.user_id
           where u.email = 'a-chosen@test.local'), 'teal', 'or the color it was given');
update membership set status = 'active' where user_id = (select tech_a from ids);
select is((select disabled_at from membership where user_id = (select tech_a from ids)), null,
  'turning them on clears it');
update membership set status = 'disabled' where user_id = (select tech_a from ids);
update membership set color = 'red' where user_id = (select tech_a from ids);
select isnt((select disabled_at from membership where user_id = (select tech_a from ids)), null,
  'other changes keep it');

-- Who may change a color: owners and admins, not techs; nobody writes disabled_at.
update membership set status = 'active' where user_id = (select tech_a from ids);
select tests.authenticate_as((select admin_a from ids));
select is(tests.rows_affected(format($$ update membership set color = 'pink' where user_id = %L $$,
  (select owner_a from ids))), 1::bigint, 'an admin changes a color');
select throws_ok(format($$ update membership set disabled_at = now() where user_id = %L $$,
  (select tech_a from ids)), '42501', null, 'disabled_at is the server''s');
reset role;
select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected(format($$ update membership set color = 'brown' where user_id = %L $$,
  (select tech_a from ids))), 0::bigint, 'a tech can''t');
reset role;
select ok((select update_columns @> '{color}' from app.sync_table where table_name = 'membership'),
  'colors sync');
select ok((select insert_columns @> '{plan_moved}' and update_columns @> '{plan_moved}'
           from app.sync_table where table_name = 'job'), 'plan_moved syncs');

-- Plan visits: a weekly plan, two visits moved on their own, then the plan changes day.
create temp table plan on commit drop as select gen_random_uuid() as id;
insert into service_plan (id, company_id, customer_id, property_id, assigned_user_id, starts_on)
  values ((select id from plan), (select ca from ids), (select cust_a from ids),
          (select prop_a from ids), (select tech_a from ids), current_date + 1);
create temp table first_two on commit drop as
  select id, plan_date, scheduled_start from job
  where service_plan_id = (select id from plan) and deleted_at is null
  order by plan_date limit 2;
grant select on first_two to authenticated;
select ok((select count(*) = 2 from first_two), 'the plan made its visits');

select tests.authenticate_as((select owner_a from ids));
select is(tests.rows_affected(format($$ update job set plan_moved = true,
    scheduled_start = scheduled_start + interval '2 days', scheduled_end = scheduled_end + interval '2 days'
  where id = %L $$, (select id from first_two order by plan_date limit 1))), 1::bigint,
  'Just This Visit marks the visit as moved');
reset role;

update service_plan set starts_on = current_date + 3 where id = (select id from plan);

select ok((select deleted_at is null and plan_moved
             and scheduled_start = (select scheduled_start from first_two order by plan_date limit 1)
                                   + interval '2 days'
           from job where id = (select id from first_two order by plan_date limit 1)),
  'a moved visit survives a plan change where it was put');
select is((select count(*)::int from job
           where service_plan_id = (select id from plan) and deleted_at is null
             and plan_date = (select plan_date from first_two order by plan_date limit 1)),
  1, 'and no second visit is made for its date');
select isnt((select deleted_at from job where id = (select id from first_two order by plan_date offset 1)),
  null, 'a visit not moved follows the plan');
select ok(exists (select 1 from job where service_plan_id = (select id from plan) and deleted_at is null
                    and not plan_moved and plan_date = current_date + 3),
  'onto its new day');
select is((select count(*)::int from job where service_plan_id = (select id from plan)
             and deleted_at is null and not plan_moved
             and extract(dow from plan_date) <> extract(dow from current_date + 3)),
  0, 'every visit not moved is on the new weekday');

select * from finish();
rollback;
