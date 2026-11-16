-- Pool equipment: sanitizer, heater, solar heater (owner, 2026-11-16).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'tech')::uuid as tech_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated;

select is((select has_solar_heater from property where id = (select prop_a from ids)), false,
  'no solar heater until marked');
select is((select sanitizer from property where id = (select prop_a from ids)), null,
  'sanitizer starts as not sure');
select throws_ok(format($$ update property set sanitizer = 'ozone' where id = %L $$,
  (select prop_a from ids)), '23514', null, 'only listed sanitizers');
select throws_ok(format($$ update property set heater = 'wood' where id = %L $$,
  (select prop_a from ids)), '23514', null, 'only listed heaters');

-- A tech sets them, as the app does offline.
select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected(format($$ update property set sanitizer = 'salt', heater = 'gas',
  has_solar_heater = true, notes = 'Drain the solar in November' where id = %L $$,
  (select prop_a from ids))), 1::bigint, 'a tech sets the pool''s equipment and notes');
reset role;
select is((select array[sanitizer, heater, has_solar_heater::text, notes] from property
           where id = (select prop_a from ids)),
  array['salt', 'gas', 'true', 'Drain the solar in November'], 'saved');
select ok((select '{sanitizer,heater,has_solar_heater}'::text[] <@ update_columns
           from app.sync_table where table_name = 'property'), 'the phones sync them');

select * from finish();
rollback;
