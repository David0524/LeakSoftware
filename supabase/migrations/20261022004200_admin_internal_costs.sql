-- Admin portal (owner, 2026-11-16): "clear out the test shop, so we should show 0 users"; "Do
-- not include this on our finances"; "Include a company finances section … allow us to add
-- certain expenses and keep track of which one of the owners paid for it, David, Cole, or the
-- company."
--
-- 1. Internal shops and accounts: Sundeck Pro's own (the demo shop, App Review's shop, test
--    shops, staff logins). They keep working, but the portal leaves them out of every list,
--    count and money figure (Overview, Shops, People, Usage, Finances, Leads to call). Staff mark
--    a shop or a person in the portal. A person also counts as internal when every shop they
--    belong to is.
-- 2. Company costs: what Sundeck Pro itself pays (services and one-off expenses), and who paid:
--    David, Cole or the company. Staff only, through the server.

-- ---------------------------------------------------------------------------
-- 1. Internal shops and accounts
-- ---------------------------------------------------------------------------
create table public.admin_internal (
  id bigint generated always as identity primary key,
  company_ref uuid unique references public.company (id) on delete cascade,
  user_ref uuid unique references auth.users (id) on delete cascade,
  staff_email text not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(company_ref, user_ref) = 1)
);
alter table public.admin_internal enable row level security;
revoke all on public.admin_internal from public, anon, authenticated;
grant select, insert, delete on public.admin_internal to service_role;

create or replace function app.internal_shop(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin_internal i where i.company_ref = target)
$$;

-- Marked themselves, or every shop they belong to is internal (a demo shop's techs).
create or replace function app.internal_person(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admin_internal i where i.user_ref = target)
    or (exists (select 1 from public.membership m join public.company c on c.id = m.company_id
                where m.user_id = target and m.deleted_at is null and c.deleted_at is null)
        and not exists (select 1 from public.membership m join public.company c on c.id = m.company_id
                        where m.user_id = target and m.deleted_at is null and c.deleted_at is null
                          and not app.internal_shop(c.id)))
$$;
revoke all on function app.internal_shop(uuid), app.internal_person(uuid) from public, anon, authenticated;
grant execute on function app.internal_shop(uuid), app.internal_person(uuid) to service_role;

-- Shop rows as 20261022003800_team_size.sql, plus internal. The website leaves internal shops
-- out of the lists and money (packages/core countedShops), and lists them under Internal.
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

-- People as 20261022000700_admin_portal.sql, plus internal.
create or replace function public.admin_people(search text default null) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select u.id, u.email, p.full_name as name, p.phone, u.created_at, u.last_sign_in_at,
      coalesce(p.two_step, false) as two_step, app.internal_person(u.id) as internal,
      (select coalesce(jsonb_agg(jsonb_build_object('company_id', c.id, 'company_name', c.name,
                                                    'role', m.role, 'status', m.status)
                                 order by c.name), '[]'::jsonb)
       from public.membership m join public.company c on c.id = m.company_id
       where m.user_id = u.id and m.deleted_at is null and c.deleted_at is null) as shops,
      (select coalesce(jsonb_agg(distinct d.app) filter (where d.app is not null), '[]'::jsonb)
       from public.push_device d where d.user_id = u.id) as apps
    from auth.users u left join public.profile p on p.id = u.id
    where search is null or trim(search) = ''
       or u.email ilike '%' || trim(search) || '%'
       or p.full_name ilike '%' || trim(search) || '%'
       or p.phone ilike '%' || trim(search) || '%'
    order by u.created_at desc
    limit 300) x
$$;

-- As 20261022000700_admin_portal.sql, plus internal.
create or replace function public.admin_person(target uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'name', p.full_name, 'phone', p.phone,
    'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'two_step', coalesce(p.two_step, false), 'internal', app.internal_person(u.id),
    'shops', (select coalesce(jsonb_agg(jsonb_build_object('company_id', c.id, 'company_name', c.name,
                'role', m.role, 'status', m.status, 'joined_at', m.created_at) order by c.name), '[]'::jsonb)
              from public.membership m join public.company c on c.id = m.company_id
              where m.user_id = u.id and m.deleted_at is null and c.deleted_at is null),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('app', d.app, 'service', d.service,
                  'created_at', d.created_at, 'last_seen_at', d.last_seen_at)
                  order by d.last_seen_at desc), '[]'::jsonb)
                from public.push_device d where d.user_id = u.id),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'company_id', i.company_id, 'token', i.token,
                  'company_name', c.name, 'role', i.role, 'expires_at', i.expires_at,
                  'accepted_at', i.accepted_at, 'revoked_at', i.revoked_at)
                  order by i.created_at desc), '[]'::jsonb)
                from public.invite i join public.company c on c.id = i.company_id
                where lower(i.email) = lower(u.email)),
    'lead', (select to_jsonb(l) - 'user_id' from public.signup_lead l where l.email = lower(u.email)))
  from auth.users u left join public.profile p on p.id = u.id
  where u.id = target
$$;

-- The Overview's and Finances' numbers as 20261022000700_admin_portal.sql, without internal
-- shops and people.
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
        'refunded_cents', (select coalesce(sum(p.amount_cents), 0) from public.payment p
                           where not app.internal_shop(p.company_id) and p.status = 'refunded' and p.updated_at >= m.mo
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

-- Usage as 20261022001300_usage.sql: everyone's numbers without internal shops and people.
create or replace function public.admin_usage(
  days integer default 30, target_company uuid default null, target_user uuid default null)
returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  with since as (select now() - make_interval(days => greatest(1, least(days, 180))) as t),
  ev as (
    select e.* from public.usage_event e, since
    where e.at >= since.t
      and (target_company is null or e.company_ref = target_company)
      and (target_user is null or e.user_id = target_user)
      -- Everyone's numbers leave out our own shops and accounts; one shop or person shows all.
      and (target_company is not null or target_user is not null
           or (not app.internal_person(e.user_id)
               and (e.company_ref is null or not app.internal_shop(e.company_ref))))),
  acts as (
    select a.user_id, a.company_id, a.created_at, app.feature_of(a) as feature
    from public.audit_log a, since
    where a.user_id is not null and a.created_at >= since.t
      and (target_company is null or a.company_id = target_company)
      and (target_user is null or a.user_id = target_user)
      and (target_company is not null or target_user is not null
           or (not app.internal_person(a.user_id) and not app.internal_shop(a.company_id)))
      -- Only people's own changes: not the server's, and not sync bookkeeping.
      and a.table_name in ('job', 'customer', 'property', 'media', 'checklist_item_result',
                           'test_result', 'finding', 'chemical_reading', 'signature', 'quote',
                           'invoice', 'report', 'service_plan', 'text_message', 'price_book_item')),
  feats as (select * from acts where feature is not null),
  days_series as (
    select generate_series(date_trunc('day', (select t from since)), date_trunc('day', now()),
                           interval '1 day')::date as day)
  select jsonb_build_object(
    'days', greatest(1, least(days, 180)),
    'people_active', (select count(distinct user_id) from ev),
    'sessions', (select count(distinct session_id) from ev),
    'screen_ms', (select coalesce(sum(duration_ms), 0) from ev where kind = 'screen'),
    'person_days', (select count(*) from (select distinct user_id, at::date from ev where kind = 'screen') x),
    'by_day', (select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'people', (select count(distinct user_id) from ev where at::date = d.day),
        'ms', (select coalesce(sum(duration_ms), 0) from ev where kind = 'screen' and at::date = d.day))
        order by d.day) from days_series d),
    'platforms', (select coalesce(jsonb_agg(p order by p.ms desc), '[]'::jsonb) from (
        select platform, count(distinct user_id) as people, coalesce(sum(duration_ms), 0) as ms
        from ev group by platform) p),
    'versions', (select coalesce(jsonb_agg(v order by v.platform, v.last_at desc), '[]'::jsonb) from (
        select platform, coalesce(app_version, '—') as version, count(distinct user_id) as people,
               max(at) as last_at
        from ev where platform <> 'web' group by platform, coalesce(app_version, '—')) v),
    'screens', (select coalesce(jsonb_agg(s order by s.ms desc), '[]'::jsonb) from (
        select screen, coalesce(sum(duration_ms), 0) as ms, count(*) as views,
               count(distinct user_id) as people
        from ev where kind = 'screen' group by screen order by 2 desc limit 40) s),
    'features', (select coalesce(jsonb_agg(f order by f.n desc), '[]'::jsonb) from (
        select feature, count(*) as n, count(distinct user_id) as people,
               count(distinct company_id) as shops, max(created_at) as last_at
        from feats group by feature) f),
    'errors', (select coalesce(jsonb_agg(r order by r.last_at desc), '[]'::jsonb) from (
        select screen, detail, platform, count(*) as n, count(distinct user_id) as people,
               max(at) as last_at
        from ev where kind = 'error' group by screen, detail, platform
        order by max(at) desc limit 40) r),
    'people', (select coalesce(jsonb_agg(p order by p.ms desc), '[]'::jsonb) from (
        select u.id as user_id, u.email, pr.full_name as name,
               coalesce(sum(e.duration_ms) filter (where e.kind = 'screen'), 0) as ms,
               count(distinct e.at::date) as active_days,
               count(distinct e.session_id) as sessions,
               max(e.at) as last_at,
               (select array_agg(distinct platform) from ev x where x.user_id = u.id) as platforms,
               (select count(*) from feats f where f.user_id = u.id) as actions,
               (select string_agg(distinct c.name, ', ') from public.company c
                where c.id in (select company_ref from ev x where x.user_id = u.id)) as shops
        from ev e join auth.users u on u.id = e.user_id
        left join public.profile pr on pr.id = u.id
        group by u.id, u.email, pr.full_name
        order by 4 desc limit 100) p))
$$;

-- ---------------------------------------------------------------------------
-- 2. Company costs
-- ---------------------------------------------------------------------------
-- One row per cost. repeats: once (an expense on spent_on), monthly or yearly (a service, from
-- spent_on until ended_on). amount_cents is null for a service whose price isn't entered yet.
create table public.company_cost (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null default 'other'
    check (category in ('software', 'processing', 'app_stores', 'marketing', 'legal', 'equipment', 'other')),
  amount_cents integer check (amount_cents between 0 and 100000000),
  repeats text not null default 'once' check (repeats in ('once', 'monthly', 'yearly')),
  spent_on date not null default current_date,
  ended_on date,
  paid_by text not null default 'company' check (paid_by in ('david', 'cole', 'company')),
  note text check (length(note) <= 1000),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (repeats <> 'once' or amount_cents is not null),
  check (ended_on is null or ended_on >= spent_on)
);
alter table public.company_cost enable row level security;
revoke all on public.company_cost from public, anon, authenticated;
grant select, insert, update, delete on public.company_cost to service_role;
create index company_cost_spent_idx on public.company_cost (spent_on desc);

-- The services Sundeck Pro runs on (from .env.example and the release docs). Prices that are
-- the same for everyone are filled in; the rest are entered in the portal from each bill.
insert into public.company_cost (name, category, amount_cents, repeats, spent_on, note, created_by) values
  ('Supabase', 'software', null, 'monthly', date '2026-10-01', 'Database, sign-in and file storage', 'setup'),
  ('Vercel', 'software', null, 'monthly', date '2026-10-01', 'Website hosting (Pro)', 'setup'),
  ('GitHub', 'software', null, 'monthly', date '2026-10-01', 'Code, builds and tests', 'setup'),
  ('Mapbox', 'software', null, 'monthly', date '2026-10-01', 'Maps and drive times (kept inside the free tier)', 'setup'),
  ('Resend', 'software', null, 'monthly', date '2026-10-01', 'Email: reports, invoices, sign-in', 'setup'),
  ('Twilio', 'software', null, 'monthly', date '2026-10-01', 'Shop texting and calls', 'setup'),
  ('Deepgram', 'software', null, 'monthly', date '2026-10-01', 'Voice notes to text', 'setup'),
  ('Sentry', 'software', null, 'monthly', date '2026-10-01', 'Error monitoring', 'setup'),
  ('Expo (EAS)', 'software', null, 'monthly', date '2026-10-01', 'Android app builds', 'setup'),
  ('Claude', 'software', null, 'monthly', date '2026-10-01', 'Building the software', 'setup'),
  ('sundeckpro.com', 'software', null, 'yearly', date '2026-10-01', 'Domain name', 'setup'),
  ('Apple Developer Program', 'app_stores', 9900, 'yearly', date '2026-10-01', 'App Store', 'setup'),
  ('Google Play Console', 'app_stores', 2500, 'once', date '2026-10-01', 'Play Store, one-time sign-up', 'setup');
