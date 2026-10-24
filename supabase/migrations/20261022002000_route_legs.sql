-- Routes that follow the roads (owner, 2026-10-23: "The route between stops is always a straight
-- line and doesn't take roads"; plan approved the same day).
--
-- The website's server asks a directions service for each leg of a day's route (one drive between
-- two points of the route, keyed like drive times by packages/core pointKey) and saves its road
-- path here once, so a map shown again never asks again. A leg is fetched again only when a
-- stop's coordinates change, which gives it new keys. Paths are simplified and encoded as Google
-- polylines (5 decimals) by packages/core (route-path.ts).
--
-- `provider` is the service the path came from: an Apple path is drawn only on Apple's maps
-- (Snapshots, MapKit JS) and a Mapbox path only on Mapbox's (the static fallback image of a day
-- with 10 stops or more, and Mapbox GL), as each service's terms ask. `polyline` null means the
-- service answered that there's no road route (an island, a gated road); that leg is drawn
-- straight and asked again after a week (app.route_leg_retry_after). Service errors and quota are
-- never saved: the map draws that leg straight and asks again next time.
--
-- Server-only, like activity: members read (the website's map routes read through RLS), nobody
-- writes directly (save_route_legs, below), and phones never sync it: the iPhone gets its own
-- paths from MapKit on the phone, and Android shows the server's map images.

create table public.route_leg (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  provider text not null check (provider in ('apple', 'mapbox')),
  from_key text not null check (from_key ~ '^-?\d{1,2}\.\d{4},-?\d{1,3}\.\d{4}$'),
  to_key text not null check (to_key ~ '^-?\d{1,2}\.\d{4},-?\d{1,3}\.\d{4}$'),
  polyline text check (polyline is null or length(polyline) between 2 and 20000),
  fetched_at timestamptz not null default now(),
  check (from_key <> to_key)
);
select app.make_synced('public.route_leg');
create unique index route_leg_once on public.route_leg (company_id, provider, from_key, to_key);

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('route_leg', 'member', 'none', null, null, false, 970);

-- Access, as the registry generates it (20261012000600_access.sql): members read, nobody writes.
grant select on public.route_leg to authenticated;
create policy route_leg_select on public.route_leg for select to authenticated
  using (app.is_member(company_id));

select app.speed_up_policies();

-- How long a "no road route" answer stands before the leg is asked again.
create or replace function app.route_leg_retry_after() returns interval
language sql immutable as $$ select interval '7 days' $$;

/**
 * Save legs the server fetched: rows [{from, to, polyline}] for one provider (polyline null: the
 * service found no road route). A leg saved before is replaced. Members of the shop only.
 */
create or replace function public.save_route_legs(target_company uuid, leg_provider text, rows jsonb)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) > 200 then
    raise exception 'Invalid legs' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.route_leg (company_id, provider, from_key, to_key, polyline)
  select distinct on (r ->> 'from', r ->> 'to')
    target_company, leg_provider, r ->> 'from', r ->> 'to', nullif(r ->> 'polyline', '')
  from jsonb_array_elements(rows) r
  on conflict (company_id, provider, from_key, to_key)
  do update set polyline = excluded.polyline, fetched_at = now(), deleted_at = null;
end
$$;

revoke all on function public.save_route_legs(uuid, text, jsonb) from public, anon;
grant execute on function public.save_route_legs(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Allowances: legs fetched per shop per day, and Mapbox Directions' free tier
-- ---------------------------------------------------------------------------

-- Each shop may ask for this many new legs a day (ROUTE_LEG_DAILY_LIMIT on the server), counted
-- apart from drive times, suggestions and map images, so a busy day of maps never uses up the
-- drive times routes need.
alter table app.routing_usage drop constraint routing_usage_kind_check;
alter table app.routing_usage add constraint routing_usage_kind_check
  check (kind in ('geocode', 'matrix', 'suggest', 'map', 'directions'));

-- As 20261012007500_map_images.sql, with directions counted apart too.
create or replace function public.routing_use(target_company uuid, use_kind text,
                                              how_many integer, day_limit integer)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  used integer;
  pool text := case when use_kind in ('suggest', 'map', 'directions') then use_kind else 'route' end;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  if how_many is null or how_many <= 0 or how_many > 1000 then
    raise exception 'Invalid count' using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(sum(calls), 0) into used from app.routing_usage
  where company_id = target_company and day = current_date
    and (case when kind in ('suggest', 'map', 'directions') then kind else 'route' end) = pool;
  if used + how_many > day_limit then
    return false;
  end if;
  insert into app.routing_usage (company_id, day, kind, calls)
  values (target_company, current_date, use_kind, how_many)
  on conflict (company_id, day, kind) do update set calls = routing_usage.calls + how_many;
  return true;
end
$$;

-- Mapbox Directions: 100,000 requests a month free (mapbox.com/pricing, checked 2026-10-23); a
-- request with many waypoints counts once. About 90%, as the other kinds. Apple's directions are
-- Maps Server API service calls, already counted as apple_service.
insert into app.mapbox_budget (api, monthly_limit) values ('directions', 90000);
