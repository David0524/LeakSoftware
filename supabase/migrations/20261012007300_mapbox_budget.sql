-- Mapbox's free tier, never passed (owner, 2026-10-20: "Please ensure I do not surpass the free
-- tier"). Mapbox counts each month across the whole account, so this budget is for every shop
-- together, not per shop. Each kind of call stops at about 90% of what Mapbox gives free
-- (mapbox.com/pricing, checked 2026-10-20); past it, the app falls back as it does without a
-- key: drive times are estimated, maps aren't drawn, addresses are typed. Pools are looked up
-- with the Census Bureau's free geocoder instead of Mapbox's permanent geocoding, which has no
-- free tier.
--   static_image   map images (small day maps)       free 50,000 requests  → 45,000
--   geocode_temp   address suggestions as you type   free 100,000 requests → 90,000
--   matrix_element drive times (origins × destinations) free 100,000      → 90,000
--   map_load       interactive web map (Enlarge)     free 50,000 loads     → 45,000

create table app.mapbox_budget (
  api text primary key,
  monthly_limit integer not null check (monthly_limit >= 0)
);
insert into app.mapbox_budget (api, monthly_limit) values
  ('static_image', 45000), ('geocode_temp', 90000), ('matrix_element', 90000), ('map_load', 45000);

create table app.mapbox_usage (
  month date not null,
  api text not null references app.mapbox_budget (api),
  units bigint not null default 0,
  primary key (month, api)
);

-- Take `how_many` units from this month's budget for `api`, all or nothing. True when there was room.
-- Any member of a shop may ask (their app's calls go through it); the month is UTC, as
-- Mapbox's billing month is.
create function public.mapbox_take(target_company uuid, api_kind text, how_many integer)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  cap integer;
  this_month date := date_trunc('month', now() at time zone 'utc')::date;
  used bigint;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  if how_many is null or how_many <= 0 or how_many > 10000 then
    raise exception 'Invalid count' using errcode = 'invalid_parameter_value';
  end if;
  select monthly_limit into cap from app.mapbox_budget where api = api_kind;
  if cap is null then
    raise exception 'Unknown Mapbox API' using errcode = 'invalid_parameter_value';
  end if;
  insert into app.mapbox_usage (month, api) values (this_month, api_kind)
  on conflict do nothing;
  -- One at a time per month and kind, so two shops can't both take the last units.
  select u.units into used from app.mapbox_usage u
  where u.month = this_month and u.api = api_kind for update;
  if used + how_many > cap then
    return false;
  end if;
  update app.mapbox_usage set units = mapbox_usage.units + how_many
  where month = this_month and api = api_kind;
  return true;
end
$$;

revoke all on function public.mapbox_take(uuid, text, integer) from public;
grant execute on function public.mapbox_take(uuid, text, integer) to authenticated;
