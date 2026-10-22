-- Mass email gets its own daily allowance (owner, 2026-10-22: "Give mass email its own limit").
--
-- Until now Email Customers counted against the shop's 'email' allowance (300 a day, shared with
-- reports, quotes, invoices and receipts), so one big mass email could stop the day's invoices,
-- and a shop with 800 customers couldn't email them all. Mass emails now count as 'mass_email'
-- (DAILY_LIMIT_MASS_EMAIL on the server, 2000 by default), and the 'email' allowance is left to
-- the transactional mail. The server still does the counting (public.use_allowance).
--
-- email_campaign_setup's used_today is now the mass emails sent today. use_allowance took at
-- most 1,000 at a time, which a mass email to more customers than that would trip ("Invalid
-- count"); one call can now count up to 100,000.

alter table app.daily_usage drop constraint daily_usage_kind_check;
alter table app.daily_usage add constraint daily_usage_kind_check
  check (kind in ('email', 'mass_email', 'narrative', 'transcribe', 'text', 'call'));

create or replace function public.use_allowance(target_company uuid, use_kind text,
                                                how_many integer, day_limit integer)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  before integer;
begin
  if how_many is null or how_many <= 0 or how_many > 100000 then
    raise exception 'Invalid count' using errcode = 'invalid_parameter_value';
  end if;
  select used into before from app.daily_usage
  where company_id = target_company and day = current_date and kind = use_kind for update;
  if coalesce(before, 0) + how_many > day_limit then
    return false;
  end if;
  insert into app.daily_usage (company_id, day, kind, used)
  values (target_company, current_date, use_kind, how_many)
  on conflict (company_id, day, kind) do update set used = daily_usage.used + how_many;
  return true;
end
$$;
revoke all on function public.use_allowance(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.use_allowance(uuid, text, integer, integer) to service_role;

/**
 * What the page needs besides the count: the cities of the shop's pools (A to Z, each once) and
 * how many mass emails the shop has sent today (their own daily allowance, public.use_allowance
 * with 'mass_email').
 */
create or replace function public.email_campaign_setup(target_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_manager(target_company) then
    raise exception 'Only owners and admins can email customers' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'cities', coalesce((
      select jsonb_agg(city order by lower(city))
      from (
        select distinct on (lower(btrim(regexp_replace(pr.city, '\s+', ' ', 'g'))))
          btrim(regexp_replace(pr.city, '\s+', ' ', 'g')) as city
        from public.property pr
        join public.customer c on c.id = pr.customer_id and c.deleted_at is null
        where pr.company_id = target_company and pr.deleted_at is null
          and nullif(btrim(pr.city), '') is not null
        order by lower(btrim(regexp_replace(pr.city, '\s+', ' ', 'g'))),
          btrim(regexp_replace(pr.city, '\s+', ' ', 'g'))
      ) cities), '[]'::jsonb),
    'used_today', coalesce((
      select used from app.daily_usage
      where company_id = target_company and day = current_date and kind = 'mass_email'), 0));
end
$$;
