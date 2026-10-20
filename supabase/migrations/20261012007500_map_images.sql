-- Day maps (owner, 2026-10-20, docs/plans/route-maps.md): the website and Android show a map
-- image of each day's stops, drawn by the routing service (Mapbox Static Images) through the
-- server, so its key never leaves it. Map images are counted per shop per day with their own
-- allowance, as suggestions are, so maps never use up the lookups and drive times routes need.

alter table app.routing_usage drop constraint routing_usage_kind_check;
alter table app.routing_usage add constraint routing_usage_kind_check
  check (kind in ('geocode', 'matrix', 'suggest', 'map'));

-- As 20261012006900_address_suggestions.sql, with map images counted apart too.
create or replace function public.routing_use(target_company uuid, use_kind text,
                                              how_many integer, day_limit integer)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  used integer;
  pool text := case when use_kind in ('suggest', 'map') then use_kind else 'route' end;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  if how_many is null or how_many <= 0 or how_many > 1000 then
    raise exception 'Invalid count' using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(sum(calls), 0) into used from app.routing_usage
  where company_id = target_company and day = current_date
    and (case when kind in ('suggest', 'map') then kind else 'route' end) = pool;
  if used + how_many > day_limit then
    return false;
  end if;
  insert into app.routing_usage (company_id, day, kind, calls)
  values (target_company, current_date, use_kind, how_many)
  on conflict (company_id, day, kind) do update set calls = routing_usage.calls + how_many;
  return true;
end
$$;
