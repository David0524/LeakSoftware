-- The free trial is 30 days (owner, 2026-10-19: "Free trial changed to 30 days").
-- create_company as 20261012004400_security_audit_fixes.sql, with the longer trial.

create or replace function public.create_company(
  company_name text, company_timezone text default null, company_services text default 'both')
returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  caller uuid := auth.uid();
  new_company uuid;
begin
  if caller is null then
    raise exception 'Sign in before creating a company' using errcode = 'insufficient_privilege';
  end if;
  if company_timezone is not null and not exists (
    select 1 from pg_timezone_names where name = company_timezone) then
    raise exception 'Unknown time zone %', company_timezone using errcode = 'invalid_parameter_value';
  end if;
  if company_services not in ('pool', 'leak', 'both') then
    raise exception 'Unknown services %', company_services using errcode = 'invalid_parameter_value';
  end if;

  insert into public.company (name, timezone)
  values (trim(company_name), coalesce(company_timezone, 'America/New_York'))
  returning id into new_company;
  update public.company
  set settings = settings || jsonb_build_object('services', company_services)
  where id = new_company;

  insert into public.membership (company_id, user_id, role) values (new_company, caller, 'owner');
  perform app.seed_company_defaults(new_company, company_services);
  insert into public.subscription (company_id, status, trial_ends_at, card_required)
  values (new_company, 'trialing', now() + interval '30 days',
          coalesce((select (value)::text::boolean from app.platform_setting
                    where key = 'card_required_at_signup'), false));

  return new_company;
end
$$;
