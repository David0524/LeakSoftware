-- New-shop onboarding and a card to start the trial (owner, 2026-10-16). A new shop answers a
-- few questions, tries a sample visit or report, then adds a card for a 14-day free trial
-- (was 30 days, no card).
--
-- subscription.card_required: set by the website's server when Stripe billing is configured
-- (never by the shop). Until the card is in (Checkout made the Stripe subscription), the shop
-- is read-only: the onboarding's own changes are applied by the server after Checkout.
-- subscription.onboarding: the owner's answers, written by the server. onboarded_at: when the
-- owner finished; shops from before this have it set, so they never see onboarding.

alter table public.subscription
  add column card_required boolean not null default false,
  add column onboarding jsonb,
  add column onboarded_at timestamptz;

update public.subscription set onboarded_at = coalesce(onboarded_at, created_at);

create or replace function public.create_company(company_name text, company_timezone text default null)
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

  insert into public.company (name, timezone)
  values (trim(company_name), coalesce(company_timezone, 'America/New_York'))
  returning id into new_company;

  insert into public.membership (company_id, user_id, role) values (new_company, caller, 'owner');
  perform app.seed_company_defaults(new_company);
  insert into public.subscription (company_id, status, trial_ends_at)
  values (new_company, 'trialing', now() + interval '14 days');

  return new_company;
end
$$;

create or replace function app.company_locked(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.subscription s
    where s.company_id = target_company
      and ((s.card_required and s.stripe_subscription_id is null)
           or (s.status = 'trialing' and s.trial_ends_at < now() and s.stripe_subscription_id is null)
           or s.status = 'canceled'
           or (s.status = 'past_due'
               and coalesce(s.current_period_end, now()) < now() - interval '7 days')))
$$;

create or replace function public.company_access(target_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  s public.subscription;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.subscription where company_id = target_company;
  return jsonb_build_object(
    'status', coalesce(s.status, 'active'),
    'plan', s.plan,
    'trial_ends_at', s.trial_ends_at,
    'current_period_end', s.current_period_end,
    'subscribed', s.stripe_subscription_id is not null,
    'needs_card', coalesce(s.card_required and s.stripe_subscription_id is null, false),
    'onboarded', s.onboarded_at is not null or s.company_id is null,
    'locked', app.company_locked(target_company));
end
$$;
