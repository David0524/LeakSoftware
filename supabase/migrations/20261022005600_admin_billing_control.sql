-- Full control over a shop's billing from the Admin portal, and refunds (owner, 2026-11-24: "In
-- our admin panel, we should have full control over pricing, deals, etc. also switching account
-- settings from leak detection, maintenance, both"; "how would we reverse a charge?"; "Build
-- all 6"). Replaces the 2026-10-22 rule that refunds and plan changes stay in Stripe's dashboard.
--
-- 1. Prices are rows (public.price_list), not code. Staff edit them in Admin › Pricing; each
--    save is a new row and the newest is what new shops pay. A shop that subscribes keeps the
--    list it subscribed under (subscription.price_list_id), so price changes never move an
--    existing shop (owner: "your call"). Anyone may read prices: the home page shows them.
-- 2. A shop's own price (staff): a fixed monthly amount or a percent off its standard price,
--    through a date or for good (subscription.custom_price_*). The website sets the Stripe
--    subscription's amount from it, and the daily run puts the standard price back after.
-- 3. Staff switch a shop between Leak Detection, Pool Maintenance and Both, as its owner can in
--    Settings, and apply a promo code or free months to a shop that has already signed up.
-- 4. Refunds of a shop's invoice payments: payment.refunded_cents. A refund lowers the
--    payment's amount_cents (what the shop still keeps), so every total of payments stays right;
--    a payment refunded in full is 'refunded' and keeps its original amount. Owners and admins
--    refund through the website (public.payment_refund_info, then Stripe, then
--    public.stripe_record_refund); refunds made in Stripe's dashboard arrive by webhook through
--    the same function. Staff in a support session can't refund a shop's customer (owner: "ok
--    agreed").

-- ---------------------------------------------------------------------------
-- 1. Price lists
-- ---------------------------------------------------------------------------

create table public.price_list (
  id bigint generated always as identity primary key,
  -- packages/core PriceList as JSON: {maintenance: {tiers: [{name, up_to, price_cents}],
  -- per_extra_cents}, leak: {...}, both_addon_cents}. The website checks it before saving.
  prices jsonb not null check (coalesce(jsonb_typeof(prices) = 'object'
    and jsonb_typeof(prices -> 'maintenance' -> 'tiers') = 'array'
    and jsonb_typeof(prices -> 'leak' -> 'tiers') = 'array'
    and jsonb_typeof(prices -> 'both_addon_cents') = 'number', false)),
  note text check (note is null or length(note) <= 500),
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.price_list enable row level security;
revoke all on public.price_list from public, anon, authenticated;

-- The prices Sundeck Pro published until now (packages/core/src/plans.ts).
insert into public.price_list (prices, note, created_by) values (
  '{"maintenance": {"tiers": [{"name": "Starter", "up_to": 2, "price_cents": 7900},
                              {"name": "Team", "up_to": 6, "price_cents": 14900},
                              {"name": "Fleet", "up_to": 12, "price_cents": 24900}],
                    "per_extra_cents": 1500},
    "leak": {"tiers": [{"name": "Solo", "up_to": 1, "price_cents": 4900},
                       {"name": "Team", "up_to": 4, "price_cents": 9900}],
             "per_extra_cents": 2500},
    "both_addon_cents": 4900}',
  'The prices published at launch', 'system');

-- The list a subscribed shop pays under, and its own price (section 2).
alter table public.subscription
  add column price_list_id bigint references public.price_list (id),
  add column custom_price_kind text check (custom_price_kind in ('fixed', 'percent')),
  add column custom_price_cents integer check (custom_price_cents between 0 and 1000000),
  add column custom_percent_off smallint check (custom_percent_off between 1 and 100),
  -- The last day the shop's own price applies (its time zone); null for good.
  add column custom_price_until date,
  add column custom_price_note text check (custom_price_note is null or length(custom_price_note) <= 500),
  add constraint subscription_custom_price_check check (
    (custom_price_kind is null and custom_price_cents is null and custom_percent_off is null
       and custom_price_until is null)
    or (custom_price_kind = 'fixed' and custom_price_cents is not null and custom_percent_off is null)
    or (custom_price_kind = 'percent' and custom_percent_off is not null and custom_price_cents is null));
create index subscription_price_list_idx on public.subscription (price_list_id);

-- What new shops pay: the newest list.
create or replace function public.current_prices() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select prices from public.price_list order by id desc limit 1
$$;
revoke all on function public.current_prices() from public;
grant execute on function public.current_prices() to anon, authenticated, service_role;

-- What one shop pays under: the list it subscribed under, else the newest.
create or replace function app.shop_prices(target_company uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select l.prices from public.subscription s join public.price_list l on l.id = s.price_list_id
     where s.company_id = target_company),
    public.current_prices())
$$;
revoke all on function app.shop_prices(uuid) from public, anon, authenticated;
grant execute on function app.shop_prices(uuid) to service_role;

create or replace function public.shop_prices(target_company uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.shop_prices(target_company)
$$;
revoke all on function public.shop_prices(uuid) from public, anon, authenticated;
grant execute on function public.shop_prices(uuid) to service_role;

-- Admin › Pricing: a new list (the website has checked it with priceListProblem).
create or replace function public.admin_save_prices(new_prices jsonb, note text, staff_email text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  id bigint;
begin
  insert into public.price_list (prices, note, created_by)
  values (new_prices, nullif(trim(note), ''), staff_email)
  returning price_list.id into id;
  return id;
end
$$;

-- Every list, newest first, with how many subscribed shops pay under each.
create or replace function public.admin_price_lists() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'prices', l.prices, 'note', l.note, 'created_by', l.created_by,
    'created_at', l.created_at,
    'shops', (select count(*) from public.subscription s where s.price_list_id = l.id))
    order by l.id desc), '[]'::jsonb)
  from public.price_list l
$$;

-- ---------------------------------------------------------------------------
-- 2. The shop's price list and its own price
-- ---------------------------------------------------------------------------

-- Shops Stripe already bills keep the launch prices.
update public.subscription
set price_list_id = (select min(id) from public.price_list)
where stripe_subscription_id is not null;

-- A shop subscribing takes the newest list and keeps it.
create or replace function app.keep_price_list() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.stripe_subscription_id is not null and new.price_list_id is null then
    new.price_list_id := (select max(id) from public.price_list);
  end if;
  return new;
end
$$;
revoke all on function app.keep_price_list() from public, anon, authenticated;
create trigger keep_price_list before insert or update of stripe_subscription_id
  on public.subscription for each row execute function app.keep_price_list();

-- Admin › the shop › Price. kind null puts the standard price back.
create or replace function public.admin_set_custom_price(
  target_company uuid, kind text, cents integer, percent integer, until date, note text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  zone text;
begin
  select timezone into zone from public.company where id = target_company and deleted_at is null;
  if zone is null then
    raise exception 'That shop no longer exists.' using errcode = 'invalid_parameter_value';
  end if;
  if kind is not null and kind not in ('fixed', 'percent') then
    raise exception 'Choose a fixed price or a percent off.' using errcode = 'invalid_parameter_value';
  end if;
  if kind = 'fixed' and (cents is null or cents not between 0 and 1000000) then
    raise exception 'Enter a monthly price up to $10,000.' using errcode = 'invalid_parameter_value';
  end if;
  if kind = 'percent' and (percent is null or percent not between 1 and 100) then
    raise exception 'Percent off is 1 to 100.' using errcode = 'invalid_parameter_value';
  end if;
  if kind is not null and until is not null and until < (now() at time zone zone)::date then
    raise exception 'The end date has passed.' using errcode = 'invalid_parameter_value';
  end if;
  update public.subscription
  set custom_price_kind = kind,
      custom_price_cents = case when kind = 'fixed' then cents end,
      custom_percent_off = case when kind = 'percent' then percent end,
      custom_price_until = case when kind is not null then until end,
      custom_price_note = case when kind is not null then nullif(trim(note), '') end,
      updated_at = now()
  where company_id = target_company;
  if not found then
    raise exception 'This shop has no subscription.' using errcode = 'invalid_parameter_value';
  end if;
end
$$;

-- What the website needs to price a shop: its list, its own price, and its today.
create or replace function public.shop_billing_price(target_company uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object(
    'price_list', app.shop_prices(c.id),
    'custom_price_kind', s.custom_price_kind, 'custom_price_cents', s.custom_price_cents,
    'custom_percent_off', s.custom_percent_off, 'custom_price_until', s.custom_price_until,
    'today', (now() at time zone c.timezone)::date)
  from public.company c left join public.subscription s on s.company_id = c.id
  where c.id = target_company
$$;
revoke all on function public.shop_billing_price(uuid) from public, anon, authenticated;
grant execute on function public.shop_billing_price(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Package, codes and free months (staff)
-- ---------------------------------------------------------------------------

-- Leak Detection, Pool Maintenance or Both, as the owner's Settings › Company › Services does:
-- a package taken on brings its checklist, tests and price book (nothing is removed). The
-- website then updates the Stripe price.
create or replace function public.admin_set_services(target_company uuid, services text)
returns text
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  was text;
begin
  if services not in ('pool', 'leak', 'both') then
    raise exception 'Choose Leak Detection, Pool Maintenance or Both.' using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(settings ->> 'services', 'both') into was
  from public.company where id = target_company and deleted_at is null for update;
  if was is null then
    raise exception 'That shop no longer exists.' using errcode = 'invalid_parameter_value';
  end if;
  update public.company
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('services', services)
  where id = target_company;
  if services in ('pool', 'both') then
    perform app.seed_package_defaults(target_company, 'pool');
  end if;
  if services in ('leak', 'both') then
    perform app.seed_package_defaults(target_company, 'leak');
  end if;
  return was;
end
$$;

-- Apply a promo code to a shop that already signed up (staff can replace the code it used).
-- Not subscribed yet: as if the owner entered it (free months lengthen the trial; the percent
-- off goes on at Checkout). Subscribed: the code is recorded and the website gives the free
-- months as a Stripe credit and the percent off as a coupon. Returns the offer.
create or replace function public.admin_apply_promo(target_company uuid, code text)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  wanted text := app.normalize_code(code);
  p app.promo_code;
  s public.subscription;
begin
  select * into p from app.promo_code x where x.code = wanted;
  if p.code is null then
    raise exception 'No promo code %.', wanted using errcode = 'invalid_parameter_value';
  end if;
  if not p.active or (p.expires_at is not null and p.expires_at <= now()) then
    raise exception 'Code % is turned off or ended.', p.code using errcode = 'invalid_parameter_value';
  end if;
  select * into s from public.subscription x where x.company_id = target_company for update;
  if s.company_id is null then
    raise exception 'This shop has no subscription.' using errcode = 'invalid_parameter_value';
  end if;
  if s.plan = 'demo' then
    raise exception 'This is a demo shop. End Demo first.' using errcode = 'invalid_parameter_value';
  end if;
  if s.status = 'canceled' then
    raise exception 'This shop canceled.' using errcode = 'invalid_parameter_value';
  end if;
  update public.subscription
  set promo_code = p.code, promo_kind = 'promo', promo_applied_at = now(),
      promo_free_months = p.free_months, promo_percent_off = p.percent_off,
      promo_percent_months = p.percent_months,
      trial_ends_at = case when s.stripe_subscription_id is null and p.free_months > 0
        then greatest(coalesce(trial_ends_at, now()), created_at + make_interval(months => p.free_months))
        else trial_ends_at end,
      status = case when s.stripe_subscription_id is null then 'trialing' else status end,
      card_required = case when s.stripe_subscription_id is null then false else card_required end,
      updated_at = now()
  where company_id = target_company;
  return jsonb_build_object('code', p.code, 'free_months', p.free_months,
    'percent_off', p.percent_off, 'percent_months', p.percent_months,
    'subscribed', s.stripe_subscription_id is not null);
end
$$;

-- Free months for a shop with no Stripe subscription yet: its trial runs that much longer.
-- (Subscribed shops get a Stripe credit from the website instead.)
create or replace function public.admin_trial_months(target_company uuid, months integer)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.subscription;
  ends timestamptz;
begin
  if months not between 1 and 12 then
    raise exception 'Give 1 to 12 months.' using errcode = 'invalid_parameter_value';
  end if;
  select * into s from public.subscription where company_id = target_company for update;
  if s.company_id is null then
    raise exception 'This shop has no subscription.' using errcode = 'invalid_parameter_value';
  end if;
  if s.stripe_subscription_id is not null then
    raise exception 'Stripe bills this shop; its free months are a credit.' using errcode = 'invalid_parameter_value';
  end if;
  if s.plan = 'demo' then
    raise exception 'This is a demo shop. End Demo first.' using errcode = 'invalid_parameter_value';
  end if;
  ends := greatest(coalesce(s.trial_ends_at, now()), now()) + make_interval(months => months);
  update public.subscription
  set status = 'trialing', trial_ends_at = ends, card_required = false, updated_at = now()
  where company_id = target_company;
  return ends;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Refunds of a shop's invoice payments
-- ---------------------------------------------------------------------------

alter table public.payment
  add column refunded_cents integer not null default 0 check (refunded_cents >= 0);

-- A refund can leave a paid invoice owed again; its job goes back to Invoiced (the server
-- only: Invoiced is a server status). Mirrored in packages/core job-status.ts and Swift.
insert into app.job_status_transition (from_status, to_status) values ('paid', 'invoiced');

-- Before a refund: the payment, if the person is an owner or admin of its shop (a real
-- member, never a staff support session), and the Stripe account it was paid on.
create or replace function public.payment_refund_info(target_payment uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  p public.payment;
  inv public.invoice;
begin
  select * into p from public.payment where id = target_payment and deleted_at is null;
  if p.id is null or not (exists (
      select 1 from public.membership m
      where m.company_id = p.company_id and m.user_id = auth.uid()
        and m.role in ('owner', 'admin') and m.status = 'active' and m.deleted_at is null)
      and app.two_step_ok()) then
    raise exception 'Only owners and admins can refund payments' using errcode = 'insufficient_privilege';
  end if;
  select * into inv from public.invoice where id = p.invoice_id and deleted_at is null;
  if inv.id is null or inv.status in ('draft', 'void') then
    raise exception 'Only payments on a sent invoice can be refunded here.' using errcode = 'check_violation';
  end if;
  if p.status <> 'succeeded' or p.method not in ('card', 'ach') or p.stripe_payment_intent_id is null then
    raise exception 'Only card and bank payments that went through can be refunded.' using errcode = 'check_violation';
  end if;
  return jsonb_build_object(
    'payment_id', p.id, 'invoice_id', p.invoice_id, 'company_id', p.company_id,
    'intent_id', p.stripe_payment_intent_id, 'amount_cents', p.amount_cents,
    'refunded_cents', p.refunded_cents, 'method', p.method,
    'account', (select a.stripe_account_id from public.stripe_account a
                where a.company_id = p.company_id));
end
$$;
revoke all on function public.payment_refund_info(uuid) from public, anon;
grant execute on function public.payment_refund_info(uuid) to authenticated;

-- A Stripe charge's refunds, as Stripe reports them: charge_refunded is all refunded on the
-- charge so far (a card fee the shop added is part of the charge, never of the payment), so
-- replays and out-of-order events change nothing. Only on the payment's own shop's account.
-- Returns {payment_id, invoice_id, company_id, refunded_cents, status, changed} or null when
-- no payment matches.
create or replace function public.stripe_record_refund(
  intent_id text, charge_refunded integer, charge_amount integer, paid_account text)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  p public.payment;
  original integer;
  refunded integer;
  inv public.invoice;
begin
  select * into p from public.payment where stripe_payment_intent_id = intent_id for update;
  if p.id is null then
    return null;
  end if;
  if paid_account is null or not exists (select 1 from public.stripe_account a
      where a.company_id = p.company_id and a.stripe_account_id = paid_account) then
    raise exception 'That payment isn''t on this account.' using errcode = 'insufficient_privilege';
  end if;
  original := case when p.status = 'refunded' then p.amount_cents
                   else p.amount_cents + p.refunded_cents end;
  refunded := least(greatest(coalesce(charge_refunded, 0), 0), original);
  if p.status not in ('succeeded', 'refunded') or refunded <= p.refunded_cents then
    return jsonb_build_object('payment_id', p.id, 'invoice_id', p.invoice_id,
      'company_id', p.company_id, 'refunded_cents', p.refunded_cents, 'status', p.status,
      'changed', false);
  end if;
  if refunded >= original or coalesce(charge_refunded, 0) >= coalesce(charge_amount, 0) then
    update public.payment
    set status = 'refunded', amount_cents = original, refunded_cents = original, updated_at = now()
    where id = p.id returning * into p;
  else
    update public.payment
    set amount_cents = original - refunded, refunded_cents = refunded, updated_at = now()
    where id = p.id returning * into p;
  end if;
  if p.invoice_id is not null then
    perform app.refresh_invoice(p.invoice_id);
    -- Not paid in full any more: the job is back to invoiced.
    select * into inv from public.invoice where id = p.invoice_id;
    if inv.status in ('sent', 'partially_paid') then
      update public.job set status = 'invoiced' where id = inv.job_id and status = 'paid';
    end if;
  end if;
  return jsonb_build_object('payment_id', p.id, 'invoice_id', p.invoice_id,
    'company_id', p.company_id, 'refunded_cents', p.refunded_cents, 'status', p.status,
    'changed', true);
end
$$;
revoke all on function public.stripe_record_refund(text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.stripe_record_refund(text, integer, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. The portal's shop rows: its price list, its own price, and its today
-- ---------------------------------------------------------------------------

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
  || jsonb_build_object(
    'price_list', coalesce(pl.prices, cur.prices), 'price_list_id', s.price_list_id,
    'custom_price_kind', s.custom_price_kind, 'custom_price_cents', s.custom_price_cents,
    'custom_percent_off', s.custom_percent_off, 'custom_price_until', s.custom_price_until,
    'custom_price_note', s.custom_price_note,
    'today', (now() at time zone c.timezone)::date)
  from public.company c
  left join public.subscription s on s.company_id = c.id
  left join public.price_list pl on pl.id = s.price_list_id
  left join lateral (select l.prices from public.price_list l order by l.id desc limit 1) cur on true
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
  public.admin_save_prices(jsonb, text, text), public.admin_price_lists(),
  public.admin_set_custom_price(uuid, text, integer, integer, date, text),
  public.admin_set_services(uuid, text), public.admin_apply_promo(uuid, text),
  public.admin_trial_months(uuid, integer), app.admin_shop_rows(uuid)
  from public, anon, authenticated;
grant execute on function
  public.admin_save_prices(jsonb, text, text), public.admin_price_lists(),
  public.admin_set_custom_price(uuid, text, integer, integer, date, text),
  public.admin_set_services(uuid, text), public.admin_apply_promo(uuid, text),
  public.admin_trial_months(uuid, integer), app.admin_shop_rows(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Finances: refunds of part of a payment count too (as 20261022004200_admin_internal_costs.sql)
-- ---------------------------------------------------------------------------

create or replace function public.admin_metrics() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with weeks as (
    select generate_series(date_trunc('week', now()) - interval '11 weeks',
                           date_trunc('week', now()), interval '1 week') as wk),
  months as (
    select generate_series(date_trunc('month', now()) - interval '11 months',
                           date_trunc('month', now()), interval '1 month') as mo)
  select jsonb_build_object(
    'signups_by_week', (select jsonb_agg(jsonb_build_object('week', w.wk,
        'shops', (select count(*) from public.company c where c.deleted_at is null and not app.internal_shop(c.id)
                  and c.created_at >= w.wk and c.created_at < w.wk + interval '1 week'))
        order by w.wk) from weeks w),
    'jobs_by_week', (select jsonb_agg(jsonb_build_object('week', w.wk,
        'jobs', (select count(*) from public.job j where j.deleted_at is null and not j.sample
                 and not app.internal_shop(j.company_id) and j.completed_at >= w.wk and j.completed_at < w.wk + interval '1 week'))
        order by w.wk) from weeks w),
    'payments_by_month', (select jsonb_agg(jsonb_build_object('month', m.mo,
        'card_cents', (select coalesce(sum(p.amount_cents), 0) from public.payment p
                       where not app.internal_shop(p.company_id) and p.status = 'succeeded' and p.method = 'card'
                         and coalesce(p.paid_at, p.created_at) >= m.mo
                         and coalesce(p.paid_at, p.created_at) < m.mo + interval '1 month'),
        'bank_cents', (select coalesce(sum(p.amount_cents), 0) from public.payment p
                       where not app.internal_shop(p.company_id) and p.status = 'succeeded' and p.method = 'ach'
                         and coalesce(p.paid_at, p.created_at) >= m.mo
                         and coalesce(p.paid_at, p.created_at) < m.mo + interval '1 month'),
        'other_cents', (select coalesce(sum(p.amount_cents), 0) from public.payment p
                        where not app.internal_shop(p.company_id) and p.status = 'succeeded' and p.method = 'other'
                          and coalesce(p.paid_at, p.created_at) >= m.mo
                          and coalesce(p.paid_at, p.created_at) < m.mo + interval '1 month'),
        'refunded_cents', (select coalesce(sum(p.refunded_cents), 0) from public.payment p
                           where not app.internal_shop(p.company_id) and p.refunded_cents > 0 and p.updated_at >= m.mo
                             and p.updated_at < m.mo + interval '1 month'),
        'failed', (select count(*) from public.payment p where not app.internal_shop(p.company_id) and p.status = 'failed'
                   and p.updated_at >= m.mo and p.updated_at < m.mo + interval '1 month'))
        order by m.mo) from months m),
    'people_active_7d', (select count(*) from auth.users u where not app.internal_person(u.id) and (u.last_sign_in_at > now() - interval '7 days'
                           or exists (select 1 from public.push_device d where d.user_id = u.id
                                      and d.last_seen_at > now() - interval '7 days'))),
    'people_active_30d', (select count(*) from auth.users u where not app.internal_person(u.id) and (u.last_sign_in_at > now() - interval '30 days'
                            or exists (select 1 from public.push_device d where d.user_id = u.id
                                       and d.last_seen_at > now() - interval '30 days'))),
    'people_total', (select count(*) from auth.users u where not app.internal_person(u.id)),
    'shops_working_7d', (select count(distinct j.company_id) from public.job j
                         where j.deleted_at is null and not j.sample and not app.internal_shop(j.company_id)
                           and j.completed_at > now() - interval '7 days'),
    'shops_never_worked', (select count(*) from public.company c where c.deleted_at is null and not app.internal_shop(c.id)
                           and c.created_at < now() - interval '3 days'
                           and not exists (select 1 from public.job j where j.company_id = c.id
                                           and not j.sample and j.completed_at is not null)),
    'trials_ended_90d', (select count(*) from public.subscription s
                         where s.trial_ends_at between now() - interval '90 days' and now()
                           and not app.internal_shop(s.company_id)),
    'trials_converted_90d', (select count(*) from public.subscription s
                             where s.trial_ends_at between now() - interval '90 days' and now()
                               and not app.internal_shop(s.company_id) and s.stripe_subscription_id is not null and s.status in ('active', 'past_due')),
    'leads_to_call', (select count(*) from public.signup_lead l where l.contacted_at is null
                      and (l.user_id is null or not app.internal_person(l.user_id))
                      and not exists (select 1 from public.membership m join public.subscription s
                                      on s.company_id = m.company_id
                                      where m.user_id = l.user_id and m.role = 'owner'
                                        and s.stripe_subscription_id is not null)),
    'subscription_events', (select coalesce(jsonb_agg(jsonb_build_object(
        'company_id', e.company_ref, 'status', e.status, 'plan', e.plan, 'at', e.at) order by e.at), '[]'::jsonb)
      from public.subscription_event e where not app.internal_shop(e.company_ref)
        and (e.at > now() - interval '13 months' or e.id in (select max(e2.id) from public.subscription_event e2
                     where e2.at <= now() - interval '13 months' group by e2.company_ref))))
$$;
