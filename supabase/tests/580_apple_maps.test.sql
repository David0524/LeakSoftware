-- Apple Maps (2026-10-20, docs/plans/apple-maps.md): Apple's kinds in the shared map budget, with
-- a daily cap beside the monthly one for service calls and map views.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, service_role;
create temp view ids as select (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a,
  (b ->> 'company')::uuid as cb, (b ->> 'tech')::uuid as tech_b from fx;
grant select on ids to authenticated, service_role;

select is((select array_agg(api || '=' || monthly_limit || '/' || coalesce(daily_limit::text, '-')
  order by api) from app.mapbox_budget where api like 'apple%'),
  '{apple_map_view=6000000/225000,apple_service=600000/22500,apple_snapshot=22500/-}',
  'about 90% of Apple''s free allowances, a month and a day');
select is((select count(*)::int from app.mapbox_budget where api not like 'apple%'
  and daily_limit is not null), 0, 'Mapbox kinds have no daily limit');

-- A small day and a larger month, so the day's cap is the one that stops.
update app.mapbox_budget set daily_limit = 5, monthly_limit = 100 where api = 'apple_service';

set local role service_role;
select is(mapbox_take((select ca from ids), 'apple_service', 4), true, 'room in the day');
reset role;
set local role service_role;
select is(mapbox_take((select cb from ids), 'apple_service', 2), false,
  'another shop shares the day: no room for 2');
select is(mapbox_take((select cb from ids), 'apple_service', 1), true, 'but room for 1');
select is(mapbox_take((select cb from ids), 'apple_service', 1), false, 'the day is used up');
reset role;
select is((select units::int from app.mapbox_usage where api = 'apple_service'
  and month = date_trunc('month', now() at time zone 'utc')::date), 5,
  'a refused take counts nothing in the month');
select is((select units::int from app.mapbox_usage_daily where api = 'apple_service'
  and day = (now() at time zone 'utc')::date), 5, 'the day counts what was taken');

-- A new day resets the day's count; the month's still applies.
update app.mapbox_usage_daily set day = day - 1 where api = 'apple_service';
update app.mapbox_budget set monthly_limit = 6 where api = 'apple_service';
set local role service_role;
select is(mapbox_take((select ca from ids), 'apple_service', 2), false,
  'the month still stops it on a new day');
select is(mapbox_take((select ca from ids), 'apple_service', 1), true, 'a new day has room');
reset role;
select is((select units::int from app.mapbox_usage_daily where api = 'apple_service'
  and day = (now() at time zone 'utc')::date), 1, 'today''s count starts fresh');

-- Snapshots have only a monthly limit.
update app.mapbox_budget set monthly_limit = 2 where api = 'apple_snapshot';
set local role service_role;
select is(mapbox_take((select ca from ids), 'apple_snapshot', 2), true, 'snapshots: room');
select is(mapbox_take((select ca from ids), 'apple_snapshot', 1), false, 'snapshots: used up');
reset role;
select is((select count(*)::int from app.mapbox_usage_daily where api = 'apple_snapshot'), 0,
  'no daily rows for kinds without a daily limit');

select * from finish();
rollback;
