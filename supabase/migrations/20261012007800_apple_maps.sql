-- Apple Maps on the website (owner, 2026-10-20: "Yes do your suggestion";
-- docs/plans/apple-maps.md). Apple's free allowance is per Apple Developer membership, so like
-- Mapbox's it's one budget for every shop together. Apple never bills: past its limit it answers
-- 429 until the next period, so the guard stops first and the Mapbox fallback covers the rest.
-- Counted per UTC calendar month at about 90% of the safest reading
-- (developer.apple.com/maps/web, checked 2026-10-20):
--   apple_snapshot  map images (Snapshots)            25,000 a day, or a month (forum)  → 22,500 a month
--   apple_service   address search and autocomplete   25,000 a day × 30 × ~0.8          → 600,000 a month
--   apple_map_view  MapKit JS maps (one per token)    250,000 a day × 30 × ~0.8         → 6,000,000 a month
-- Apple's allowances are daily, so service calls and map views also stop at 90% of one day's
-- (22,500 and 225,000), counted per UTC day beside the monthly count. Mapbox kinds have no daily
-- limit and work as before.

alter table app.mapbox_budget
  add column daily_limit integer check (daily_limit >= 0);

insert into app.mapbox_budget (api, monthly_limit, daily_limit) values
  ('apple_snapshot', 22500, null),
  ('apple_service', 600000, 22500),
  ('apple_map_view', 6000000, 225000);

create table app.mapbox_usage_daily (
  day date not null,
  api text not null references app.mapbox_budget (api),
  units bigint not null default 0,
  primary key (day, api)
);

-- As before, plus the day's count for kinds with a daily limit. Both counts move together or
-- not at all.
create or replace function public.mapbox_take(target_company uuid, api_kind text, how_many integer)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  cap integer;
  day_cap integer;
  this_month date := date_trunc('month', now() at time zone 'utc')::date;
  this_day date := (now() at time zone 'utc')::date;
  used bigint;
  used_today bigint;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  if how_many is null or how_many <= 0 or how_many > 10000 then
    raise exception 'Invalid count' using errcode = 'invalid_parameter_value';
  end if;
  select b.monthly_limit, b.daily_limit into cap, day_cap from app.mapbox_budget b
  where b.api = api_kind;
  if cap is null then
    raise exception 'Unknown Mapbox API' using errcode = 'invalid_parameter_value';
  end if;
  insert into app.mapbox_usage (month, api) values (this_month, api_kind)
  on conflict do nothing;
  -- One at a time per month and kind, so two shops can't both take the last units. The month's
  -- row is always locked first, so the day's lock below can't deadlock.
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
  return true;
end
$$;

revoke all on function public.mapbox_take(uuid, text, integer) from public;
grant execute on function public.mapbox_take(uuid, text, integer) to authenticated;
