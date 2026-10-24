-- Each shop gets its own daily share of the map allowance (security review M1, owner 2026-10-24).
--
-- The Apple and Mapbox allowances (app.mapbox_budget) are one budget for every shop together,
-- and public.mapbox_take was open to any signed-in member, up to 10,000 units a call. One
-- member of any shop, even a brand-new unpaid one, could call it directly and use up the
-- month's (or Apple's day's) allowance, stopping maps, suggestions and drive times for everyone.
--
-- Now:
--   1. Only the server calls it, with the service key (the phones never call it: they go through
--      the website's /api routes, which check the caller is on the shop's team first).
--   2. One call takes at most 625 units: a 25 × 25 drive-time matrix, the largest the server asks
--      for (routing.ts maxPoints). Everything else takes 1.
--   3. Each shop has a daily cap per kind (UTC day, like Apple's), checked before the shared
--      counts. A shop past its cap is refused with a plain message; the website falls back as it
--      does past the shared allowance (estimated drive times, the other map service, typed
--      addresses).
--
-- The caps, sized from the dev project's busiest shop (Canyon State, 2026-10-13 to 10-24) and
-- the website's own per-shop limits, so they never bind before those in normal use:
--   kind            busiest day seen   website's own limit           cap a shop a day
--   apple_snapshot  168 map images     MAP_DAILY_LIMIT 1,500         1,500
--   static_image    168 map images     MAP_DAILY_LIMIT 1,500         1,500
--   apple_service   115 calls          suggestions 2,000 + legs 1,000  3,000 (13% of Apple's day)
--   apple_map_view  11 tokens          none                          500
--   directions      147 legs           ROUTE_LEG_DAILY_LIMIT 1,000   1,000
--   geocode_temp    30 suggestions     ADDRESS_SUGGEST_DAILY_LIMIT 2,000  2,000
--   geocode_paid    7 in the month     (100 a month for everyone)    10
--   matrix_element  13 matrices        ROUTING_DAILY_LIMIT 300 calls 10,000 (16 full 25-stop matrices)
--   map_load        none yet           none                          500
-- A kind added later without a cap (null) has no per-shop limit, only the shared one.

alter table app.mapbox_budget
  add column shop_daily_limit integer check (shop_daily_limit >= 0);

update app.mapbox_budget b set shop_daily_limit = v.cap
from (values
  ('apple_snapshot', 1500), ('static_image', 1500), ('apple_service', 3000),
  ('apple_map_view', 500), ('directions', 1000), ('geocode_temp', 2000), ('geocode_paid', 10),
  ('matrix_element', 10000), ('map_load', 500)
) v(api, cap)
where b.api = v.api;

-- What each shop took today, per kind. Internal like app.routing_usage: no client reads it.
create table app.mapbox_usage_shop (
  company_id uuid not null references public.company (id) on delete cascade,
  day date not null,
  api text not null references app.mapbox_budget (api),
  units bigint not null default 0,
  primary key (company_id, day, api)
);

-- As 20261012007800_apple_maps.sql, with the shop's own daily cap first. Both shared counts and
-- the shop's move together or not at all. Past the shop's cap it raises 53400 with a plain
-- message (the website shows it where it shows the allowance's); past a shared allowance it
-- answers false as before.
create or replace function public.mapbox_take(target_company uuid, api_kind text, how_many integer)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  cap integer;
  day_cap integer;
  shop_cap integer;
  this_month date := date_trunc('month', now() at time zone 'utc')::date;
  this_day date := (now() at time zone 'utc')::date;
  used bigint;
  used_today bigint;
  shop_today bigint;
begin
  if target_company is null then
    raise exception 'No shop' using errcode = 'invalid_parameter_value';
  end if;
  if how_many is null or how_many <= 0 or how_many > 625 then
    raise exception 'Invalid count' using errcode = 'invalid_parameter_value';
  end if;
  select b.monthly_limit, b.daily_limit, b.shop_daily_limit into cap, day_cap, shop_cap
  from app.mapbox_budget b where b.api = api_kind;
  if cap is null then
    raise exception 'Unknown Mapbox API' using errcode = 'invalid_parameter_value';
  end if;
  -- The shop's own row first: it only ever waits on its own shop, never blocks another.
  if shop_cap is not null then
    insert into app.mapbox_usage_shop (company_id, day, api) values (target_company, this_day, api_kind)
    on conflict do nothing;
    select s.units into shop_today from app.mapbox_usage_shop s
    where s.company_id = target_company and s.day = this_day and s.api = api_kind for update;
    if shop_today + how_many > shop_cap then
      raise exception 'Your shop has used today’s maps and address lookups. They’re back tomorrow.'
        using errcode = 'configuration_limit_exceeded';
    end if;
  end if;
  insert into app.mapbox_usage (month, api) values (this_month, api_kind)
  on conflict do nothing;
  -- One at a time per month and kind, so two shops can't both take the last units. The month's
  -- row is always locked before the day's, so the locks can't deadlock.
  select u.units into used from app.mapbox_usage u
  where u.month = this_month and u.api = api_kind for update;
  if used + how_many > cap then
    return false;
  end if;
  if day_cap is not null then
    insert into app.mapbox_usage_daily (day, api) values (this_day, api_kind)
    on conflict do nothing;
    select d.units into used_today from app.mapbox_usage_daily d
    where d.day = this_day and d.api = api_kind for update;
    if used_today + how_many > day_cap then
      return false;
    end if;
    update app.mapbox_usage_daily set units = mapbox_usage_daily.units + how_many
    where day = this_day and api = api_kind;
  end if;
  update app.mapbox_usage set units = mapbox_usage.units + how_many
  where month = this_month and api = api_kind;
  if shop_cap is not null then
    update app.mapbox_usage_shop set units = mapbox_usage_shop.units + how_many
    where company_id = target_company and day = this_day and api = api_kind;
  end if;
  return true;
end
$$;

revoke all on function public.mapbox_take(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.mapbox_take(uuid, text, integer) to service_role;
