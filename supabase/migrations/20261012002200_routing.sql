-- Routes and scheduling help (owner request, 2026-10-13; docs/ROUTE_OPTIMIZATION_HANDOFF.md).
-- Every route starts and ends at the shop, so the shop's address gets coordinates too.
-- Drive times come from a routing service (Mapbox) when the server has a key, otherwise from
-- the estimate in packages/core; either way they are cached per shop for a day, and each
-- call to the service is counted per shop per day so heavy use can be capped.

alter table public.company
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  -- The address the coordinates were found for: when the address changes, find them again.
  add column geocoded_address text;

alter table public.property
  add column geocoded_address text,
  -- Where the coordinates came from: the routing service, the phone's GPS at the pool, or set
  -- by hand.
  add column location_source text check (location_source in ('geocoder', 'gps', 'manual'));

alter table public.job
  -- Place in the tech's route that day (1 = first stop). Times stay in scheduled_start/end.
  add column route_order integer check (route_order > 0),
  -- The customer was told this time: planning never moves it.
  add column arrival_fixed boolean not null default false;

create index job_route_idx on public.job (company_id, assigned_user_id, scheduled_start)
  where deleted_at is null;

-- The working day and arrival windows (Settings › Scheduling). Shops made later get the same
-- defaults from packages/core routingSettings.
update public.company
set settings = settings || '{"routing": {"day_start": "08:00", "day_end": "17:00",
                                         "arrival_window_minutes": 0, "job_minutes": 150,
                                         "work_days": [1, 2, 3, 4, 5]}}'::jsonb
where not settings ? 'routing';

-- ---------------------------------------------------------------------------
-- Access for the new columns (same registry as 20261012000600_access.sql)
-- ---------------------------------------------------------------------------

do $$
declare
  add_cols jsonb := $json${
    "job": {"insert": ["route_order", "arrival_fixed"], "update": ["route_order", "arrival_fixed"]},
    "property": {"insert": ["geocoded_address", "location_source"], "update": ["geocoded_address", "location_source"]},
    "company": {"insert": [], "update": ["latitude", "longitude", "geocoded_address"]}
  }$json$;
  t text;
  ins text[];
  upd text[];
begin
  for t in select jsonb_object_keys(add_cols) loop
    ins := array(select jsonb_array_elements_text(add_cols -> t -> 'insert'));
    upd := array(select jsonb_array_elements_text(add_cols -> t -> 'update'));
    update app.sync_table
    set insert_columns = case when insert_columns is null then null else insert_columns || ins end,
        update_columns = case when update_columns is null then null else update_columns || upd end
    where table_name = t;
    if cardinality(ins) > 0 and (select insert_columns is not null from app.sync_table where table_name = t) then
      execute format('grant insert (%s) on public.%I to authenticated', array_to_string(ins, ', '), t);
    end if;
    if cardinality(upd) > 0 then
      execute format('grant update (%s) on public.%I to authenticated', array_to_string(upd, ', '), t);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Usage per shop per day (Tidemark's one routing key serves every shop)
-- ---------------------------------------------------------------------------

create table app.routing_usage (
  company_id uuid not null references public.company (id) on delete cascade,
  day date not null default current_date,
  kind text not null check (kind in ('geocode', 'matrix')),
  calls integer not null default 0,
  primary key (company_id, day, kind)
);

-- Count calls to the routing service before making them. False when the shop has used its
-- daily allowance (the caller falls back to the estimate).
create or replace function public.routing_use(target_company uuid, use_kind text,
                                              how_many integer, day_limit integer)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  used integer;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(sum(calls), 0) into used from app.routing_usage
  where company_id = target_company and day = current_date;
  if used + how_many > day_limit then
    return false;
  end if;
  insert into app.routing_usage (company_id, day, kind, calls)
  values (target_company, current_date, use_kind, how_many)
  on conflict (company_id, day, kind) do update set calls = routing_usage.calls + how_many;
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- Drive times between two points, kept a day (keys from packages/core pointKey)
-- ---------------------------------------------------------------------------

create table app.drive_time (
  company_id uuid not null references public.company (id) on delete cascade,
  from_key text not null,
  to_key text not null,
  minutes integer not null check (minutes >= 0),
  fetched_at timestamptz not null default now(),
  primary key (company_id, from_key, to_key)
);

create or replace function public.cached_drive_times(target_company uuid, from_keys text[], to_keys text[])
returns table (from_key text, to_key text, minutes integer)
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  return query
  select d.from_key, d.to_key, d.minutes from app.drive_time d
  where d.company_id = target_company and d.fetched_at > now() - interval '1 day'
    and d.from_key = any (from_keys) and d.to_key = any (to_keys);
end
$$;

create or replace function public.save_drive_times(target_company uuid, rows jsonb)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  insert into app.drive_time (company_id, from_key, to_key, minutes)
  select target_company, r ->> 'from', r ->> 'to', (r ->> 'minutes')::integer
  from jsonb_array_elements(rows) r
  on conflict (company_id, from_key, to_key)
  do update set minutes = excluded.minutes, fetched_at = now();
end
$$;

revoke all on function public.routing_use(uuid, text, integer, integer),
  public.cached_drive_times(uuid, text[], text[]), public.save_drive_times(uuid, jsonb)
  from public, anon;
grant execute on function public.routing_use(uuid, text, integer, integer),
  public.cached_drive_times(uuid, text[], text[]), public.save_drive_times(uuid, jsonb)
  to authenticated;
