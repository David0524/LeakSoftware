-- Owner, 2026-10-26: a "Tile and grout" item in the bond beam section, and items typed in on a
-- job (job_component with a typed label on a hidden stand-in type).
begin;
set search_path = public, extensions;
select plan(21);

-- New shops: Tile and grout is in the bond beam section, between Spa and Autofill.
select tests.authenticate_as(tests.create_user('tile-founder@test.local'));
create temp table shop on commit drop as select create_company('Tile Leak Co', null, 'both') as id;
grant select on shop to authenticated;
select is((select name from component_type where company_id = (select id from shop) and key = 'tile_grout'),
  'Tile and grout', 'new shops: the bond beam section has Tile and grout');
select is((select section from component_type where company_id = (select id from shop) and key = 'tile_grout'),
  'bond_beam', 'new shops: in the bond beam section');
select is((select array_agg(name order by sort_order) from component_type
           where company_id = (select id from shop) and section = 'bond_beam'),
  array['Pool', 'Spa', 'Tile and grout', 'Autofill', 'Around all fittings', 'Autofill EQ line'],
  'new shops: after Pool and Spa, before Autofill');

-- Typed-in items: one hidden stand-in type per checklist, inactive so no job copies it.
select is((select count(*) from component_type where company_id = (select id from shop)
            and key in ('custom_leak', 'custom_visit') and not active), 2::bigint,
  'new shops (both services): a hidden stand-in type for each checklist');
select results_eq(
  format($$ select key, section, answer, job_type from component_type
            where company_id = %L and key like 'custom\_%%' order by key $$, (select id from shop)),
  $$ values ('custom_leak'::text, 'other'::text, 'leak'::text, 'detection'::text),
            ('custom_visit', 'service', 'done', 'maintenance') $$,
  'one for leak detection (Other, verdicts) and one for visits (service, done)');
reset role;

-- Existing shops (the migration runs the same function for every company): added once, only
-- where there is a bond beam section, and never over a shop's own item of that name.
update component_type set deleted_at = now() where company_id = (select id from shop) and key = 'tile_grout';
select app.add_tile_grout_item((select id from shop));
select is((select count(*) from component_type where company_id = (select id from shop)
            and name = 'Tile and grout' and section = 'bond_beam' and sort_order = 315
            and deleted_at is null), 1::bigint,
  'an existing shop without it gets it');
select app.add_tile_grout_item((select id from shop));
select is((select count(*) from component_type where company_id = (select id from shop)
            and name = 'Tile and grout' and deleted_at is null), 1::bigint, 'and not twice');
update component_type set key = 'my_tile', name = 'tile and Grout'
  where company_id = (select id from shop) and key = 'tile_grout';
select app.add_tile_grout_item((select id from shop));
select is((select count(*) from component_type where company_id = (select id from shop)
            and lower(name) = 'tile and grout' and deleted_at is null), 1::bigint, 'a shop with its own item by that name keeps just that');
update component_type set deleted_at = now() where company_id = (select id from shop) and section = 'bond_beam';
select app.add_tile_grout_item((select id from shop));
select is((select count(*) from component_type where company_id = (select id from shop)
            and key = 'tile_grout' and deleted_at is null), 0::bigint, 'a shop with no bond beam section is left alone');

-- A pool-care-only shop gets only the visit one; a leak-only shop only the leak one.
select tests.authenticate_as(tests.create_user('pool-founder@test.local'));
create temp table pool_shop on commit drop as select create_company('Pool Only Co', null, 'pool') as id;
reset role;
select is((select array_agg(key order by key) from component_type
           where company_id = (select id from pool_shop) and key like 'custom\_%'),
  array['custom_visit'], 'pool care only: just the visit stand-in');
select tests.authenticate_as(tests.create_user('leak-only-founder@test.local'));
create temp table leak_shop on commit drop as select create_company('Leak Only Co', null, 'leak') as id;
reset role;
select is((select array_agg(key order by key) from component_type
           where company_id = (select id from leak_shop) and key like 'custom\_%'),
  array['custom_leak'], 'leak detection only: just the leak stand-in');
select is((select count(*) from component_type where company_id = (select id from pool_shop)
            and key = 'tile_grout'), 0::bigint, 'a pool-care-only shop has no bond beam items');

-- A tech types in an item on a job: a job_component and its checklist row, like any other.
create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'job')::uuid as job_a
  from fx;
grant select on ids to authenticated, anon;
select app.add_custom_item_types((select ca from ids), 'leak');
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon;
insert into st select 'type', id::text from component_type
  where company_id = (select ca from ids) and key = 'custom_leak';
select is((select active from component_type where id = (select v::uuid from st where k = 'type')), false,
  'the stand-in is inactive');
select lives_ok(format($$ select app.add_custom_item_types(%L, 'leak') $$, (select ca from ids)),
  'adding the stand-in again is harmless');
select is((select count(*) from component_type where company_id = (select ca from ids) and key = 'custom_leak'),
  1::bigint, 'and never doubles it');

select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ insert into job_component (id, company_id, job_id, component_type_id, instance_number, label, sort_order)
  values ('0190b2a0-0000-7000-8000-000000000a01', %1$L, %2$L, %3$L, 1, 'Cracked deck drain', 900001) $$,
  (select ca from ids), (select job_a from ids), (select v from st where k = 'type')),
  'a typed-in item is a job_component with its own label');
select lives_ok(format($$ insert into checklist_item_result (id, company_id, job_id, job_component_id, status)
  values ('0190b2a0-0000-7000-8000-000000000a02', %1$L, %2$L, '0190b2a0-0000-7000-8000-000000000a01', 'pending') $$,
  (select ca from ids), (select job_a from ids)), 'with a checklist row to answer');
select lives_ok($$ update checklist_item_result set status = 'inspected', outcome = 'attention', notes = 'Loose'
  where id = '0190b2a0-0000-7000-8000-000000000a02' $$, 'which is answered like any other item');
reset role;

select is((select c ->> 'label' from jsonb_array_elements(app.report_snapshot((select job_a from ids)) -> 'components') c
           where c ->> 'type_key' = 'custom_leak'), 'Cracked deck drain',
  'the report snapshot has it under the typed name');
select is((select c ->> 'outcome' || '/' || (c ->> 'section') from jsonb_array_elements(app.report_snapshot((select job_a from ids)) -> 'components') c
           where c ->> 'type_key' = 'custom_leak'), 'attention/other',
  'with its answer, in the Other section');

-- Removing it (soft delete, so Undo can restore it) takes it off the report.
update job_component set deleted_at = now() where id = '0190b2a0-0000-7000-8000-000000000a01';
select is((select count(*) from jsonb_array_elements(app.report_snapshot((select job_a from ids)) -> 'components') c
           where c ->> 'type_key' = 'custom_leak'), 0::bigint, 'a removed item leaves the report');

select * from finish();
rollback;
