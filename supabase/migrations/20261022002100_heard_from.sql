-- "How did you hear about us?" on sign-up (owner, 2026-10-24), and new shops go from sign-up
-- straight to the trial page (the onboarding questionnaire is gone).
--
--   subscription.heard_from        the option's key (packages/core/src/heard-from.ts), or null
--                                  when not answered. The options are a constant there (they
--                                  show before sign-in, on four platforms), so the database
--                                  checks only a key's shape.
--   subscription.heard_from_other  what "Other" said, one short line.
--
-- Kept on the subscription, Sundeck Pro's own row about a shop: written once by create_company,
-- readable by the shop's owner like the rest of the row, never written by the shop and never
-- synced to phones (app.sync_table: owner read, no write, device_sync false). Staff see it on
-- the Admin portal's Shops pages and the Leads list.
--
-- create_company takes the answer, or reads it from the account's sign-up details
-- (user_metadata heard_from / heard_from_other), so a shop made after the email confirmation
-- (/setup) or by an account made in an app gets it too. An unknown or badly formed answer is
-- dropped, never an error: the question must never stop a sign-up.

alter table public.subscription
  add column heard_from text check (heard_from ~ '^[a-z][a-z0-9_]{0,39}$'),
  add column heard_from_other text,
  add constraint subscription_heard_from_other_check check (
    heard_from_other is null
    or (char_length(heard_from_other) between 1 and 100 and heard_from = 'other'));

drop function public.create_company(text, text, text);

-- create_company as 20261022000400_sample_job.sql, with the answer.
create function public.create_company(
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
  values (new_company, 'trialing', now() + interval '30 days',
          coalesce((select (value)::text::boolean from app.platform_setting
                    where key = 'card_required_at_signup'), false),
          heard, heard_other);

  return new_company;
end
$$;
revoke all on function public.create_company(text, text, text, text, text) from public, anon;
grant execute on function public.create_company(text, text, text, text, text) to authenticated;

-- The Admin portal's shop rows as 20261022000700_admin_portal.sql, with the answer.
create or replace function app.admin_shop_rows(target_shop uuid default null) returns setof jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'legal_name', c.legal_name, 'email', c.email, 'phone', c.phone,
    'address_line1', c.address_line1, 'address_line2', c.address_line2, 'city', c.city,
    'state', c.state, 'postal_code', c.postal_code, 'timezone', c.timezone,
    'created_at', c.created_at,
    'services', coalesce(c.settings ->> 'services', 'both'),
    'status', coalesce(s.status, 'trialing'), 'plan', coalesce(s.plan, 'standard'),
    'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
    'access_code', s.access_code, 'card_required', coalesce(s.card_required, false),
    'stripe_customer_id', s.stripe_customer_id, 'stripe_subscription_id', s.stripe_subscription_id,
    'locked', app.company_locked(c.id),
    'people', (select count(*) from public.membership m
               where m.company_id = c.id and m.status = 'active' and m.deleted_at is null),
    'owner_id', o.user_id, 'owner_name', o.full_name, 'owner_email', o.email, 'owner_phone', o.phone,
    'last_active_at', greatest(
      (select max(u.last_sign_in_at) from public.membership m join auth.users u on u.id = m.user_id
       where m.company_id = c.id and m.deleted_at is null),
      (select max(d.last_seen_at) from public.push_device d
       join public.membership m on m.user_id = d.user_id
       where m.company_id = c.id and m.deleted_at is null)),
    'jobs_30d', (select count(*) from public.job j where j.company_id = c.id and j.deleted_at is null
                 and not j.sample and j.completed_at > now() - interval '30 days'),
    'jobs_total', (select count(*) from public.job j
                   where j.company_id = c.id and j.deleted_at is null and not j.sample),
    'customers', (select count(*) from public.customer cu
                  where cu.company_id = c.id and cu.deleted_at is null),
    'payments_on', coalesce(sa.charges_enabled, false),
    'stripe_account_id', sa.stripe_account_id,
    'payouts_on', coalesce(sa.payouts_enabled, false),
    'payments_details_submitted', coalesce(sa.details_submitted, false),
    'heard_from', s.heard_from, 'heard_from_other', s.heard_from_other)
  from public.company c
  left join public.subscription s on s.company_id = c.id
  left join public.stripe_account sa on sa.company_id = c.id
  left join lateral (
    select m.user_id, p.full_name, p.phone, u.email
    from public.membership m join auth.users u on u.id = m.user_id
    left join public.profile p on p.id = m.user_id
    where m.company_id = c.id and m.role = 'owner' and m.deleted_at is null
    order by (m.status = 'active') desc, m.created_at
    limit 1) o on true
  where c.deleted_at is null and (target_shop is null or c.id = target_shop)
  order by c.created_at desc
$$;

-- Leads as 20261012004200_leads.sql, with the answer. A shop made from now on goes straight to
-- the trial page, so it has reached the payment page; older shops reached it when they had
-- finished the questionnaire (subscription.onboarding, kept as their record).
create or replace function public.lead_list() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) from (
    select l.id, l.email, l.name, l.company_name, l.phone, l.services, l.notes,
           l.created_at, l.updated_at, l.contacted_at, l.user_id,
           u.email_confirmed_at,
           co.id as company_id, co.name as company,
           s.status, s.plan, s.access_code, s.trial_ends_at, s.onboarded_at,
           s.stripe_subscription_id is not null as card_in,
           s.onboarding is not null or s.created_at >= timestamptz '2026-10-24 00:00:00+00'
             as reached_payment,
           (s.onboarding ->> 'people')::int as people,
           s.onboarding ->> 'goal' as goal,
           s.heard_from, s.heard_from_other
    from public.signup_lead l
    left join auth.users u on u.id = l.user_id
    left join lateral (
      select m.company_id from public.membership m
      where m.user_id = l.user_id and m.role = 'owner' and m.deleted_at is null
      order by m.company_id limit 1
    ) m on true
    left join public.company co on co.id = m.company_id
    left join public.subscription s on s.company_id = co.id
  ) x
$$;
revoke all on function public.lead_list() from public, anon, authenticated;
grant execute on function public.lead_list() to service_role;
