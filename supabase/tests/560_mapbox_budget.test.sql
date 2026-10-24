-- Mapbox's free tier (2026-10-20): one monthly budget for every shop together.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a,
  (b ->> 'company')::uuid as cb, (b ->> 'tech')::uuid as tech_b from fx;
grant select on ids to authenticated;

update app.mapbox_budget set monthly_limit = 10 where api = 'matrix_element';

select tests.authenticate_as((select tech_a from ids));
select is(mapbox_take((select ca from ids), 'matrix_element', 9), true, 'room in the month');
reset role;
select tests.authenticate_as((select tech_b from ids));
select is(mapbox_take((select cb from ids), 'matrix_element', 4), false,
  'another shop shares the same budget: no room for 4');
select is(mapbox_take((select cb from ids), 'matrix_element', 1), true, 'but room for 1');
select is(mapbox_take((select cb from ids), 'static_image', 1), true, 'each kind has its own');
select throws_ok(format('select mapbox_take(%L, ''matrix_element'', 1)', (select ca from ids)),
  '42501', null, 'only for your own shop');
select throws_ok(format('select mapbox_take(%L, ''nope'', 1)', (select cb from ids)),
  '22023', null, 'only known kinds');
reset role;
select is((select limits from (select array_agg(api || '=' || monthly_limit order by api) as limits
  from app.mapbox_budget where api <> 'matrix_element') x),
  '{apple_map_view=6000000,apple_service=600000,apple_snapshot=22500,directions=90000,geocode_paid=100,geocode_temp=90000,map_load=45000,static_image=45000}',
  'about 90% of the free tiers, and 100 paid lookups a month');

select * from finish();
rollback;
