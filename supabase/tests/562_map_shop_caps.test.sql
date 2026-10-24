-- Each shop's own daily share of the shared map allowance (security review M1, 2026-10-24).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'owner')::uuid as owner_a, (b ->> 'company')::uuid as cb from fx;
grant select on ids to authenticated, anon, service_role;

select is((select array_agg(api || '=' || shop_daily_limit order by api) from app.mapbox_budget),
  '{apple_map_view=500,apple_service=3000,apple_snapshot=1500,directions=1000,geocode_paid=10,geocode_temp=2000,map_load=500,matrix_element=10000,static_image=1500}',
  'every kind has a daily cap for each shop, well above a busy shop''s day');
select ok((select bool_and(shop_daily_limit <= coalesce(daily_limit, monthly_limit))
  from app.mapbox_budget), 'no shop''s cap is more than the allowance for everyone');

-- Signed-in people can't call it at all, not even for their own shop; only the server can.
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format('select mapbox_take(%L, ''static_image'', 1)', (select ca from ids)),
  '42501', null, 'an owner can''t take from the allowance directly');
reset role;
set local role anon;
select throws_ok(format('select mapbox_take(%L, ''static_image'', 1)', (select ca from ids)),
  '42501', null, 'nor can a visitor');
reset role;

-- A shop's cap stops that shop only, with a plain message; the shared month still has room.
update app.mapbox_budget set shop_daily_limit = 3 where api = 'static_image';
set local role service_role;
select is(mapbox_take((select ca from ids), 'static_image', 2), true, 'room in the shop''s day');
select is(mapbox_take((select ca from ids), 'static_image', 1), true, 'the last of it');
select throws_ok(format('select mapbox_take(%L, ''static_image'', 1)', (select ca from ids)),
  '53400', 'Your shop has used today’s maps and address lookups. They’re back tomorrow.',
  'past its cap, a plain message');
select is(mapbox_take((select cb from ids), 'static_image', 3), true,
  'another shop still has its own day');
select is(mapbox_take((select ca from ids), 'directions', 1), true, 'and each kind its own cap');
reset role;
select is((select units::int from app.mapbox_usage where api = 'static_image'
  and month = date_trunc('month', now() at time zone 'utc')::date), 6,
  'the refused take counted nothing in the shared month');
select is((select units::int from app.mapbox_usage_shop where api = 'static_image'
  and company_id = (select ca from ids)), 3, 'the shop''s day counts what it took');

-- A shared allowance that refuses counts nothing against the shop.
update app.mapbox_budget set monthly_limit = 6, shop_daily_limit = 1500 where api = 'static_image';
set local role service_role;
select is(mapbox_take((select cb from ids), 'static_image', 1), false, 'the month is used up');
reset role;
select is((select units::int from app.mapbox_usage_shop where api = 'static_image'
  and company_id = (select cb from ids)), 3, 'the refused take counted nothing for the shop');

-- A new day gives the shop its share back.
update app.mapbox_usage_shop set day = day - 1 where company_id = (select ca from ids);
update app.mapbox_budget set monthly_limit = 45000, shop_daily_limit = 3 where api = 'static_image';
set local role service_role;
select is(mapbox_take((select ca from ids), 'static_image', 3), true, 'a new day has room');

-- One call takes at most a 25 × 25 drive-time matrix.
select is(mapbox_take((select ca from ids), 'matrix_element', 625), true, '625 at once is fine');
select throws_ok(format('select mapbox_take(%L, ''matrix_element'', 626)', (select ca from ids)),
  '22023', null, 'more than 625 at once is refused');
select throws_ok(format('select mapbox_take(%L, ''matrix_element'', 10000)', (select ca from ids)),
  '22023', null, 'the old 10,000 is refused');
reset role;

select * from finish();
rollback;
