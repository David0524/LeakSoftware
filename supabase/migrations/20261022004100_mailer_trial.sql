-- The 6 x 9 mailer's shops get a 3-month free trial (owner, 2026-11-16: "On the new cards
-- that you're making, add a 3-month trial"); everyone else keeps 30 days. A shop is the
-- mailer's when its answer to "How did you hear about us?" is Mailer (the mailer's QR opens
-- /sign-up?from=mailer). Checkout takes the trial end from subscription.trial_ends_at.

-- create_company as 20261022002100_heard_from.sql, with the mailer's trial.
create or replace function public.create_company(
  company_name text, company_timezone text default null, company_services text default 'both',
  company_heard_from text default null, company_heard_from_other text default null)
returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  caller uuid := auth.uid();
  new_company uuid;
  signup jsonb;
  heard text;
  heard_other text;
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

  -- The answer, else the one given when the account was made; dropped if it isn't a key.
  select coalesce(u.raw_user_meta_data, '{}'::jsonb) into signup from auth.users u where u.id = caller;
  heard := lower(trim(coalesce(nullif(trim(company_heard_from), ''), signup ->> 'heard_from')));
  if heard !~ '^[a-z][a-z0-9_]{0,39}$' then
    heard := null;
  end if;
  if heard = 'other' then
    heard_other := left(nullif(trim(regexp_replace(
      coalesce(nullif(trim(company_heard_from_other), ''), signup ->> 'heard_from_other', ''),
      '\s+', ' ', 'g')), ''), 100);
  end if;

  insert into public.company (name, timezone)
  values (trim(company_name), coalesce(company_timezone, 'America/New_York'))
  returning id into new_company;
  update public.company
  set settings = settings || jsonb_build_object('services', company_services)
  where id = new_company;

  insert into public.membership (company_id, user_id, role) values (new_company, caller, 'owner');
  perform app.seed_company_defaults(new_company, company_services);
  if company_services in ('leak', 'both') then
    begin
      perform app.create_sample_job(new_company, caller);
    exception when others then
      raise warning 'sample job not made: %', sqlerrm;
    end;
  end if;
  insert into public.subscription (company_id, status, trial_ends_at, card_required,
                                   heard_from, heard_from_other)
  values (new_company, 'trialing',
          now() + case when heard = 'mailer' then interval '3 months' else interval '30 days' end,
          coalesce((select (value)::text::boolean from app.platform_setting
                    where key = 'card_required_at_signup'), false),
          heard, heard_other);

  return new_company;
end
$$;
revoke all on function public.create_company(text, text, text, text, text) from public, anon;
grant execute on function public.create_company(text, text, text, text, text) to authenticated;
