-- Promo and referral codes (owner, 2026-11-23: "i think promo code might be best. And we should
-- be able to see what promo code they use. We could have it so if someone recommend the app to
-- a friend and they use their code, it gives both companies a free month or something.").
-- Design: docs/design/2026-11-23-promo-and-referral-codes.md.
--
-- 1. Promo codes (app.promo_code): made by Sundeck Pro staff in the Admin portal. An offer is
--    free months (the trial lasts that many months from sign-up, like the mailer's 3 months;
--    0 to 12) and/or a percent off (1 to 100) for some paid months or forever. Staff can turn a code off, give it an end date and a most-uses; the
--    offer itself never changes once made, so what a shop was promised stays true.
-- 2. Referral codes: every shop has its own: its name, in capitals, letters and numbers only,
--    without LLC, Inc and the like (owner: "Maybe the companies name actually?"), a number
--    added only when another shop has the same (subscription.referral_code). A new shop that enters one gets 1 extra free month; the shop that referred it gets
--    a free month when the new shop's first real payment succeeds (the server, on Stripe's
--    invoice.paid, through public.referral_reward).
-- 3. One field takes every code: demo codes (app.access_code, unchanged), promo codes and
--    referral codes share one namespace (public.redeem_code). A shop uses one promo or
--    referral code, before it subscribes. The offer is copied onto the shop's subscription row
--    when applied, so Checkout and the pages read it from there.

-- ---------------------------------------------------------------------------
-- Codes as people type them: any case; spaces and punctuation ignored ("Blue Wave Pools" is
-- BLUEWAVEPOOLS).
-- ---------------------------------------------------------------------------
create or replace function app.normalize_code(raw text) returns text
language sql immutable set search_path = pg_temp as $$
  select upper(regexp_replace(coalesce(raw, ''), '[^A-Za-z0-9]+', '', 'g'))
$$;
grant execute on function app.normalize_code(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Promo codes (staff only, like app.access_code)
-- ---------------------------------------------------------------------------
create table app.promo_code (
  code text primary key check (code ~ '^[A-Z0-9]{3,24}$'),
  free_months smallint not null default 0 check (free_months between 0 and 12),
  percent_off smallint check (percent_off between 1 and 100),
  -- free_months: the trial lasts this many months from sign-up (never shorter than it was).
  -- Paid months the percent off lasts; null with a percent off means for good.
  percent_months smallint check (percent_months between 1 and 36),
  active boolean not null default true,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses >= 1),
  note text check (note is null or length(note) <= 500),
  created_by text,
  created_at timestamptz not null default now(),
  check (free_months > 0 or percent_off is not null),
  check (percent_off is not null or percent_months is null)
);
alter table app.promo_code enable row level security;
revoke all on app.promo_code from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. On the shop's subscription row: its own referral code, and the code it used
-- ---------------------------------------------------------------------------
alter table public.subscription
  add column referral_code text unique check (referral_code ~ '^[A-Z0-9]{3,24}$'),
  add column promo_code text,
  add column promo_kind text check (promo_kind in ('promo', 'referral')),
  add column promo_applied_at timestamptz,
  add column promo_free_months smallint not null default 0,
  add column promo_percent_off smallint check (promo_percent_off between 1 and 100),
  add column promo_percent_months smallint,
  add column referred_by uuid references public.company (id) on delete set null,
  add column referral_rewarded_at timestamptz,
  add column referral_reward text check (referral_reward in ('credit', 'trial', 'none')),
  add column referral_reward_cents integer,
  add constraint subscription_promo_kind check ((promo_code is null) = (promo_kind is null)),
  add constraint subscription_referred_kind check (referred_by is null or promo_kind = 'referral');

create index subscription_promo_code_idx on public.subscription (promo_code)
  where promo_code is not null;
create index subscription_referred_by_idx on public.subscription (referred_by)
  where referred_by is not null;

comment on column public.subscription.referral_code is
  'The shop''s own code to give other shops (Give a Month, Get a Month).';
comment on column public.subscription.promo_code is
  'The promo or referral code the shop used (promo_kind), one per shop; the offer is copied
   into promo_free_months, promo_percent_off and promo_percent_months.';
comment on column public.subscription.promo_free_months is
  'A promo code''s free months (the trial runs that many months from sign-up), or for a
   referral code the extra month added to the trial.';
comment on column public.subscription.referred_by is
  'The shop whose referral code this shop used.';
comment on column public.subscription.referral_rewarded_at is
  'When the referring shop got its free month for this shop (referral_reward says how).';

-- A shop's name as a code: capitals, letters and numbers only, without a company-type ending
-- (LLC, Inc, Co, Corp, Ltd), at most 20 characters ("Blue Wave Pools, LLC" is BLUEWAVEPOOLS).
create or replace function app.referral_stem(shop_name text) returns text
language plpgsql immutable set search_path = pg_temp as $$
declare
  words text[] := array(select w from regexp_split_to_table(upper(coalesce(shop_name, '')),
                                                            '[^A-Z0-9]+') w where w <> '');
begin
  while cardinality(words) > 1 and words[cardinality(words)] in
      ('LLC', 'PLLC', 'LC', 'INC', 'INCORPORATED', 'CO', 'CORP', 'CORPORATION', 'LTD', 'LLP') loop
    words := words[1:cardinality(words) - 1];
  end loop;
  return left(array_to_string(words, ''), 20);
end
$$;
grant execute on function app.referral_stem(text) to authenticated, service_role;

-- The shop's referral code: its name, with 2, 3, ... added only when the name is taken by
-- another shop's code, a demo code or a promo code.
create or replace function app.make_referral_code(shop_name text) returns text
language plpgsql volatile set search_path = public, app, pg_temp as $$
declare
  stem text := app.referral_stem(shop_name);
  candidate text;
  n integer := 1;
begin
  if length(stem) < 3 then
    stem := stem || 'POOLS';
  end if;
  candidate := stem;
  while exists (select 1 from public.subscription s where s.referral_code = candidate)
     or exists (select 1 from app.access_code a where app.normalize_code(a.code) = candidate)
     or exists (select 1 from app.promo_code p where p.code = candidate) loop
    n := n + 1;
    candidate := stem || n;
  end loop;
  return candidate;
end
$$;
revoke all on function app.make_referral_code(text) from public, anon, authenticated;

-- Every new shop gets its code when its subscription row is made (create_company, tests).
create or replace function app.set_referral_code() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.referral_code is null then
    new.referral_code := app.make_referral_code(
      (select c.name from public.company c where c.id = new.company_id));
  end if;
  return new;
end
$$;
revoke all on function app.set_referral_code() from public, anon, authenticated;

create trigger set_referral_code before insert on public.subscription
  for each row execute function app.set_referral_code();

-- Existing shops, one at a time so each sees the codes given before it.
do $$
declare
  r record;
begin
  for r in select s.company_id, c.name from public.subscription s
           join public.company c on c.id = s.company_id
           where s.referral_code is null order by s.created_at loop
    update public.subscription set referral_code = app.make_referral_code(r.name)
    where company_id = r.company_id;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Entering a code (owners): demo, promo or referral, in one field
-- ---------------------------------------------------------------------------

-- The offer a shop has applied, for the pages and Checkout.
create or replace function app.applied_offer(target_company uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'kind', s.promo_kind, 'code', s.promo_code, 'applied_at', s.promo_applied_at,
    'free_months', s.promo_free_months, 'percent_off', s.promo_percent_off,
    'percent_months', s.promo_percent_months, 'trial_ends_at', s.trial_ends_at,
    'referrer_name', (select c.name from public.company c where c.id = s.referred_by))
  from public.subscription s where s.company_id = target_company
$$;
revoke all on function app.applied_offer(uuid) from public, anon, authenticated;

-- A promo code wins over a shop's name (staff can't make one that matches a shop's code, but
-- a shop made later could be named like one; it then gets a number). A shop's name typed with
-- its LLC or Inc still finds its code.
-- Wrong codes get one message whatever the reason (unknown, turned off, ended, used up), as
-- demo codes do; the shop's own situation gets its own sentence.
create or replace function public.redeem_code(target_company uuid, code text) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  wanted text := app.normalize_code(code);
  demo_code text;
  s public.subscription;
  p app.promo_code;
  referrer public.subscription;
begin
  if not app.is_owner(target_company) then
    raise exception 'Only the shop''s owner can use a code' using errcode = 'insufficient_privilege';
  end if;
  if wanted = '' then
    raise exception 'Enter your code.' using errcode = 'invalid_parameter_value';
  end if;

  -- Demo codes work as before (no card, no charge).
  select a.code into demo_code from app.access_code a where app.normalize_code(a.code) = wanted;
  if demo_code is not null then
    perform public.redeem_access_code(target_company, demo_code);
    return jsonb_build_object('kind', 'demo', 'code', demo_code);
  end if;

  select * into s from public.subscription x where x.company_id = target_company for update;
  select * into p from app.promo_code x where x.code = wanted for update;
  if p.code is null then
    select x.* into referrer from public.subscription x
    join public.company c on c.id = x.company_id and c.deleted_at is null
    where x.referral_code in (wanted, app.referral_stem(code))
    order by x.referral_code = wanted desc
    limit 1;
    if referrer.company_id is null then
      raise exception 'That code isn’t valid.' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- The same code again (a second tap): nothing changes.
  if s.promo_code in (wanted, referrer.referral_code) then
    return app.applied_offer(target_company);
  end if;
  if s.company_id is null or s.plan = 'demo' then
    raise exception 'Your shop doesn’t pay for Sundeck Pro, so it doesn’t need a code.'
      using errcode = 'invalid_parameter_value';
  end if;
  if s.stripe_subscription_id is not null or s.status in ('canceled', 'past_due') then
    raise exception 'Codes are for shops that haven’t subscribed yet.'
      using errcode = 'invalid_parameter_value';
  end if;
  if s.promo_code is not null then
    raise exception 'Your shop already used code %. It’s one code per shop.', s.promo_code
      using errcode = 'invalid_parameter_value';
  end if;

  if p.code is not null then
    if not p.active or (p.expires_at is not null and p.expires_at <= now())
       or (p.max_uses is not null and (select count(*) from public.subscription x
                                       where x.promo_code = p.code and x.promo_kind = 'promo') >= p.max_uses) then
      raise exception 'That code isn’t valid.' using errcode = 'invalid_parameter_value';
    end if;
    update public.subscription
    set promo_code = p.code, promo_kind = 'promo', promo_applied_at = now(),
        promo_free_months = p.free_months, promo_percent_off = p.percent_off,
        promo_percent_months = p.percent_months,
        -- "3 months free": the trial ends 3 months after sign-up, or stays as it was if later.
        trial_ends_at = case when p.free_months > 0
          then greatest(coalesce(trial_ends_at, now()), created_at + make_interval(months => p.free_months))
          else trial_ends_at end,
        updated_at = now()
    where company_id = target_company;
  else
    if referrer.company_id = target_company then
      raise exception 'That’s your own shop’s code. Share it with other pool companies.'
        using errcode = 'invalid_parameter_value';
    end if;
    -- Can't refer yourself through a second shop.
    if exists (select 1 from public.membership m where m.company_id = referrer.company_id
               and m.user_id = auth.uid() and m.deleted_at is null) then
      raise exception 'That code is from a shop you belong to. Share it with other pool companies.'
        using errcode = 'invalid_parameter_value';
    end if;
    update public.subscription
    set promo_code = referrer.referral_code, promo_kind = 'referral', promo_applied_at = now(),
        promo_free_months = 1, promo_percent_off = null, promo_percent_months = null,
        referred_by = referrer.company_id,
        trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + interval '1 month',
        updated_at = now()
    where company_id = target_company;
  end if;
  return app.applied_offer(target_company);
end
$$;
revoke all on function public.redeem_code(uuid, text) from public, anon;
grant execute on function public.redeem_code(uuid, text) to authenticated;

-- The owner's Give a Month, Get a Month card: their code, how many shops used it, and how
-- many free months it has earned.
create or replace function public.referral_summary(target_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_owner(target_company) then
    raise exception 'Only the shop''s owner can see this' using errcode = 'insufficient_privilege';
  end if;
  return (
    select jsonb_build_object(
      'code', s.referral_code,
      'used', (select count(*) from public.subscription x where x.referred_by = target_company),
      'earned', (select count(*) from public.subscription x where x.referred_by = target_company
                 and x.referral_reward in ('credit', 'trial')))
    from public.subscription s where s.company_id = target_company);
end
$$;
revoke all on function public.referral_summary(uuid) from public, anon;
grant execute on function public.referral_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The referring shop's free month (the server, after the new shop's first real payment)
-- ---------------------------------------------------------------------------

-- Records the reward once per referred shop; false when it was already given (or the shop
-- wasn't referred). 'trial' adds a month to the referrer's trial (it has no Stripe
-- subscription yet), or becomes 'none' when that no longer fits; 'credit' is the Stripe
-- balance credit the server already made (cents); 'none' when the referrer pays nothing.
create or replace function public.referral_reward(referred uuid, reward text, cents integer default null)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.subscription;
  given text := reward;
begin
  if reward not in ('credit', 'trial', 'none') then
    raise exception 'Unknown reward %', reward using errcode = 'invalid_parameter_value';
  end if;
  select * into s from public.subscription where company_id = referred for update;
  if s.referred_by is null or s.referral_rewarded_at is not null then
    return false;
  end if;
  if given = 'trial' then
    update public.subscription
    set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + interval '1 month',
        updated_at = now()
    where company_id = s.referred_by and stripe_subscription_id is null and plan <> 'demo'
      and status = 'trialing';
    if not found then
      given := 'none';
    end if;
  end if;
  update public.subscription
  set referral_rewarded_at = now(), referral_reward = given,
      referral_reward_cents = case when given = 'credit' then cents end
  where company_id = referred;
  return true;
end
$$;
revoke all on function public.referral_reward(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.referral_reward(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The Admin portal (service role, after the website checked staff and two-step)
-- ---------------------------------------------------------------------------

-- Admin › Codes: promo codes with the shops that used each, demo codes, and referrals.
create or replace function public.admin_codes() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object(
    'promo', (select coalesce(jsonb_agg(jsonb_build_object(
        'code', p.code, 'free_months', p.free_months, 'percent_off', p.percent_off,
        'percent_months', p.percent_months, 'active', p.active, 'expires_at', p.expires_at,
        'max_uses', p.max_uses, 'note', p.note, 'created_by', p.created_by,
        'created_at', p.created_at,
        'shops', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'name', c.name, 'applied_at', s.promo_applied_at,
                    'status', s.status, 'subscribed', s.stripe_subscription_id is not null)
                    order by s.promo_applied_at desc), '[]'::jsonb)
                  from public.subscription s join public.company c on c.id = s.company_id
                  where s.promo_code = p.code and s.promo_kind = 'promo'))
        order by p.created_at desc), '[]'::jsonb)
      from app.promo_code p),
    'demo', (select coalesce(jsonb_agg(jsonb_build_object(
        'code', a.code, 'active', a.active, 'note', a.note, 'max_uses', a.max_redemptions,
        'expires_at', a.expires_at,
        'uses', (select count(*) from public.subscription s where s.access_code = a.code))
        order by a.created_at desc), '[]'::jsonb)
      from app.access_code a),
    'referrals', (select coalesce(jsonb_agg(x.r order by x.applied_at desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', c.id, 'name', c.name, 'code', s.promo_code, 'applied_at', s.promo_applied_at,
          'status', s.status, 'subscribed', s.stripe_subscription_id is not null,
          'referrer_id', rc.id, 'referrer_name', rc.name,
          'rewarded_at', s.referral_rewarded_at, 'reward', s.referral_reward,
          'reward_cents', s.referral_reward_cents) as r, s.promo_applied_at as applied_at
        from public.subscription s
        join public.company c on c.id = s.company_id
        left join public.company rc on rc.id = s.referred_by
        where s.promo_kind = 'referral'
        order by s.promo_applied_at desc
        limit 300) x))
$$;

-- New Code. The offer is fixed once made; staff turn a code off or on.
create or replace function public.admin_add_promo_code(
  new_code text, free_months integer, percent_off integer, percent_months integer,
  ends_at timestamptz, max_uses integer, note text, staff_email text)
returns text
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c text := app.normalize_code(new_code);
begin
  if c !~ '^[A-Z0-9]{3,24}$' then
    raise exception 'A code is 3 to 24 letters and numbers.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(free_months, 0) not between 0 and 12 then
    raise exception 'Free months are 0 to 12.' using errcode = 'invalid_parameter_value';
  end if;
  if percent_off is not null and percent_off not between 1 and 100 then
    raise exception 'Percent off is 1 to 100.' using errcode = 'invalid_parameter_value';
  end if;
  if percent_off is not null and percent_months is not null and percent_months not between 1 and 36 then
    raise exception 'The percent off lasts 1 to 36 months, or for good.' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(free_months, 0) = 0 and percent_off is null then
    raise exception 'Give the code free months, a percent off, or both.' using errcode = 'invalid_parameter_value';
  end if;
  if max_uses is not null and max_uses < 1 then
    raise exception 'Most uses is at least 1.' using errcode = 'invalid_parameter_value';
  end if;
  if ends_at is not null and ends_at <= now() then
    raise exception 'The end date has passed.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from app.promo_code p where p.code = c)
     or exists (select 1 from app.access_code a where app.normalize_code(a.code) = c)
     or exists (select 1 from public.subscription s where s.referral_code = c) then
    raise exception 'That code is taken. Choose another.' using errcode = 'unique_violation';
  end if;
  insert into app.promo_code (code, free_months, percent_off, percent_months, expires_at,
                              max_uses, note, created_by)
  values (c, coalesce(free_months, 0), percent_off,
          case when percent_off is null then null else percent_months end,
          ends_at, max_uses, nullif(trim(note), ''), staff_email);
  return c;
end
$$;

create or replace function public.admin_set_promo_code_active(target_code text, on_now boolean)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  update app.promo_code set active = on_now where code = app.normalize_code(target_code);
  if not found then
    raise exception 'No such code.' using errcode = 'invalid_parameter_value';
  end if;
end
$$;

-- The shops a shop referred, for its page in the portal.
create or replace function public.admin_shop_referrals(target uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'applied_at', s.promo_applied_at, 'status', s.status,
    'subscribed', s.stripe_subscription_id is not null, 'rewarded_at', s.referral_rewarded_at,
    'reward', s.referral_reward, 'reward_cents', s.referral_reward_cents)
    order by s.promo_applied_at desc), '[]'::jsonb)
  from public.subscription s join public.company c on c.id = s.company_id
  where s.referred_by = target
$$;

-- Shop rows as 20261022004200_admin_internal_costs.sql, plus the code used and referrals.
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
    'heard_from', s.heard_from, 'heard_from_other', s.heard_from_other,
    'team_size', case when jsonb_typeof(c.settings -> 'team_size') = 'number'
                      then (c.settings ->> 'team_size')::numeric end,
    'internal', app.internal_shop(c.id))
  -- (jsonb_build_object takes at most 100 arguments.)
  || jsonb_build_object(
    'promo_code', s.promo_code, 'promo_kind', s.promo_kind, 'promo_applied_at', s.promo_applied_at,
    'promo_free_months', coalesce(s.promo_free_months, 0), 'promo_percent_off', s.promo_percent_off,
    'promo_percent_months', s.promo_percent_months,
    'referral_code', s.referral_code, 'referred_by', s.referred_by,
    'referred_by_name', (select rc.name from public.company rc where rc.id = s.referred_by),
    'referral_rewarded_at', s.referral_rewarded_at, 'referral_reward', s.referral_reward,
    'referral_reward_cents', s.referral_reward_cents,
    'referrals', (select count(*) from public.subscription x where x.referred_by = c.id))
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

revoke all on function
  public.admin_codes(),
  public.admin_add_promo_code(text, integer, integer, integer, timestamptz, integer, text, text),
  public.admin_set_promo_code_active(text, boolean), public.admin_shop_referrals(uuid),
  app.admin_shop_rows(uuid)
  from public, anon, authenticated;
grant execute on function
  public.admin_codes(),
  public.admin_add_promo_code(text, integer, integer, integer, timestamptz, integer, text, text),
  public.admin_set_promo_code_active(text, boolean), public.admin_shop_referrals(uuid),
  app.admin_shop_rows(uuid)
  to service_role;
