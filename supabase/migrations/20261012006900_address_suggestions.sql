-- Address suggestions (owner, 2026-10-20: "We also need to have like an auto complete or
-- something for the mapping because it's just too big of an issue if a address doesn't
-- register"): as an address is typed, the routing service (Mapbox) suggests real ones. They're
-- counted per shop per day like lookups, with their own allowance, so typing never uses up the
-- lookups and drive times routes need.

alter table app.routing_usage drop constraint routing_usage_kind_check;
alter table app.routing_usage add constraint routing_usage_kind_check
  check (kind in ('geocode', 'matrix', 'suggest'));

-- As 20261012004400_security_audit_fixes.sql, with suggestions counted apart from the rest.
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
  if how_many is null or how_many <= 0 or how_many > 1000 then
    raise exception 'Invalid count' using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(sum(calls), 0) into used from app.routing_usage
  where company_id = target_company and day = current_date
    and (kind = 'suggest') = (use_kind = 'suggest');
  if used + how_many > day_limit then
    return false;
  end if;
  insert into app.routing_usage (company_id, day, kind, calls)
  values (target_company, current_date, use_kind, how_many)
  on conflict (company_id, day, kind) do update set calls = routing_usage.calls + how_many;
  return true;
end
$$;
