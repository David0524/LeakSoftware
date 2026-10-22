-- The Admin portal (owner, 2026-10-22: "Build a desktop-only Admin portal. Analytics, customer
-- data, finances, Admin access to customer accounts for tech help"). Plan:
-- docs/plans/admin-portal.md.
--
-- Staff are the emails in SUNDECK_STAFF_EMAILS on the server; the database doesn't know who
-- they are. Everything here is either read and written by the server with the service role
-- after it has checked staff and two-step, or (support sessions) checked by the membership
-- functions every query already uses.
--
--   1. Support sessions: staff open a shop's office to help (owner: without asking the shop,
--      "silently"), View Only or Can Make Changes, for a set time. The membership checks
--      accept an open session; the owner checks never do. View Only can't write anything.
--   2. Staff actions (insert-only), shop notes, and subscription history.
--   3. The portal's reads (admin_*), executable by the service role only.
--   4. Extend Trial and Make Demo Shop / End Demo.
--
-- These tables use company_ref, not company_id, like feature_request: they are Sundeck Pro's
-- records about a shop, not the shop's own rows, and never sync to devices.

-- ---------------------------------------------------------------------------
-- 1. Support sessions
-- ---------------------------------------------------------------------------

create table public.support_session (
  id uuid primary key default gen_random_uuid(),
  company_ref uuid not null references public.company (id) on delete cascade,
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  staff_email text not null,
  reason text not null check (length(trim(reason)) between 3 and 500),
  access text not null default 'view' check (access in ('view', 'edit')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  ended_at timestamptz,
  check (ends_at > started_at and ends_at <= started_at + interval '2 hours')
);
alter table public.support_session enable row level security;
revoke all on public.support_session from public, anon, authenticated;
create index support_session_open_idx on public.support_session (staff_user_id)
  where ended_at is null;
create index support_session_company_idx on public.support_session (company_ref, started_at desc);

-- The shops the signed-in staff person has open now. Only a session that passed two-step
-- counts, whatever their own two-step setting. `writable`: only Can Make Changes sessions.
create or replace function app.support_companies(writable boolean default false) returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then
    (select coalesce(array_agg(s.company_ref), '{}') from public.support_session s
     where s.staff_user_id = auth.uid() and s.ended_at is null and s.ends_at > now()
       and (not writable or s.access = 'edit'))
  else '{}'::uuid[] end
$$;

-- Support works like a shop admin: every check below that admins pass, an open session passes
-- too. app.is_owner and app.owner_companies are unchanged, so billing, payments setup, roles,
-- security settings and deleting the shop stay the owner's.

create or replace function app.is_member(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (exists (
    select 1 from public.membership
    where company_id = target_company
      and user_id = auth.uid()
      and status = 'active'
      and deleted_at is null
  ) and app.two_step_ok())
  or target_company = any (app.support_companies())
$$;

create or replace function app.member_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.two_step_ok() then
    (select coalesce(array_agg(company_id), '{}') from public.membership
     where user_id = auth.uid() and status = 'active' and deleted_at is null)
  else '{}'::uuid[] end || app.support_companies()
$$;

create or replace function app.is_manager(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (exists (
    select 1 from public.membership
    where company_id = target_company
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and status = 'active'
      and deleted_at is null
  ) and app.two_step_ok())
  or target_company = any (app.support_companies())
$$;

create or replace function app.manager_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.two_step_ok() then
    (select coalesce(array_agg(company_id), '{}') from public.membership
     where user_id = auth.uid() and role in ('owner', 'admin') and status = 'active'
       and deleted_at is null)
  else '{}'::uuid[] end || app.support_companies()
$$;

create or replace function app.all_jobs_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.two_step_ok() then
    (select coalesce(array_agg(m.company_id), '{}')
     from public.membership m join public.company c on c.id = m.company_id
     where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
       and (m.role in ('owner', 'admin')
            or coalesce((c.settings ->> 'techs_see_all_jobs')::boolean, true)))
  else '{}'::uuid[] end || app.support_companies()
$$;

create or replace function app.job_maker_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select array_agg(m.company_id)
    from public.membership m join public.company c on c.id = m.company_id
    where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
      and (m.role in ('owner', 'admin') or coalesce((c.settings ->> 'techs_make_jobs')::boolean, true))
  ), '{}') || app.support_companies()
$$;

-- Teammates' names: support sees the shop's people, as its admins do.
create or replace function app.shares_company(other_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (exists (
    select 1
    from public.membership mine
    join public.membership theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.status = 'active' and mine.deleted_at is null
      and theirs.user_id = other_user and theirs.status = 'active' and theirs.deleted_at is null
  ) and app.two_step_ok())
  or exists (
    select 1 from public.membership theirs
    where theirs.user_id = other_user and theirs.deleted_at is null
      and theirs.company_id = any (app.support_companies())
  )
$$;

create or replace function app.owns_member(other_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (exists (
    select 1
    from public.membership mine
    join public.membership theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.role in ('owner', 'admin') and mine.status = 'active'
      and mine.deleted_at is null and theirs.user_id = other_user
  ) and app.two_step_ok())
  or exists (
    select 1 from public.membership theirs
    where theirs.user_id = other_user and theirs.company_id = any (app.support_companies())
  )
$$;

-- View Only: true when the signed-in person sees this shop only through a View Only session
-- (a staff person who is also a real member of the shop keeps their own rights).
create or replace function app.support_view_only(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select target_company = any (app.support_companies())
     and not target_company = any (app.support_companies(true))
     and not exists (
       select 1 from public.membership
       where company_id = target_company and user_id = auth.uid()
         and status = 'active' and deleted_at is null)
$$;

revoke all on function app.support_companies(boolean), app.support_view_only(uuid) from public;
grant execute on function app.support_companies(boolean), app.support_view_only(uuid)
  to authenticated, service_role;

-- Refuses any change a View Only session makes, on every shop table. Everyone else pays one
-- indexed lookup (no open session) and goes on.
create or replace function app.guard_support_view() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r jsonb;
  co uuid;
begin
  if auth.uid() is null or coalesce(current_setting('role', true), '') <> 'authenticated'
     or not exists (select 1 from public.support_session s
                    where s.staff_user_id = auth.uid() and s.ended_at is null) then
    return coalesce(new, old);
  end if;
  r := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  -- The company row's company_id is generated, so a BEFORE trigger doesn't see it yet.
  co := coalesce(app.try_uuid(r ->> 'company_id'),
                 case when tg_table_name = 'company' then app.try_uuid(r ->> 'id') end);
  if co is not null and app.support_view_only(co) then
    raise exception 'Support is in View Only for this shop. Nothing was changed.'
      using errcode = 'TL403';
  end if;
  return coalesce(new, old);
end
$$;
revoke all on function app.guard_support_view() from public;

-- On every table with a company_id now (base tables in public), and on tables made later
-- through app.make_synced. 670_admin_portal checks none is missed.
do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'company_id'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop trigger if exists guard_support_view on public.%I', t);
    execute format(
      'create trigger guard_support_view before insert or update or delete on public.%I
         for each row execute function app.guard_support_view()', t);
  end loop;
end
$$;

create or replace function app.make_synced(t regclass) returns void
language plpgsql as $$
declare
  rel text := (select relname from pg_class where oid = t);
begin
  execute format(
    'alter table %s
       add column if not exists created_at timestamptz not null default now(),
       add column if not exists updated_at timestamptz not null default now(),
       add column if not exists deleted_at timestamptz,
       add column if not exists field_hlc jsonb not null default %L::jsonb,
       add column if not exists sync_xid xid8 not null default pg_current_xact_id(),
       add constraint %I unique (id, company_id)',
    t, '{}', rel || '_id_company_key');
  execute format('create index %I on %s (company_id)', rel || '_company_idx', t);
  execute format('create index %I on %s (sync_xid)', rel || '_sync_xid_idx', t);
  execute format(
    'create trigger touch_row before insert or update on %s
       for each row execute function app.touch_row()', t);
  execute format(
    'create trigger audit_row after insert or update on %s
       for each row execute function app.audit_row()', t);
  execute format(
    'create trigger guard_support_view before insert or update or delete on %s
       for each row execute function app.guard_support_view()', t);
  execute format('alter table %s enable row level security', t);
end
$$;

-- Photos, texts' pictures and logos: View Only uploads nothing.
create policy support_view_only_files on storage.objects as restrictive for insert to authenticated
  with check (not coalesce(app.support_view_only(app.object_company(name)), false));
create policy support_view_only_file_changes on storage.objects as restrictive for update to authenticated
  using (not coalesce(app.support_view_only(app.object_company(name)), false));

-- Starts a session for a staff person the server has checked (staff, two-step). One session at
-- a time: starting another ends the open one.
create or replace function public.admin_start_support(
  target_company uuid, staff_user uuid, staff_email text, why text, minutes integer, how text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  new_id uuid;
begin
  if minutes not in (30, 60, 120) then
    raise exception 'Choose 30 minutes, 1 hour or 2 hours.' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from public.company where id = target_company) then
    raise exception 'No such shop.' using errcode = 'invalid_parameter_value';
  end if;
  update public.support_session set ended_at = now()
  where staff_user_id = staff_user and ended_at is null;
  insert into public.support_session (company_ref, staff_user_id, staff_email, reason, access, ends_at)
  values (target_company, staff_user, lower(staff_email), trim(why), how,
          now() + make_interval(mins => minutes))
  returning id into new_id;
  return new_id;
end
$$;

create or replace function public.admin_end_support(staff_user uuid) returns integer
language sql security definer set search_path = public, pg_temp as $$
  with ended as (
    update public.support_session set ended_at = now()
    where staff_user_id = staff_user and ended_at is null
    returning 1)
  select count(*)::integer from ended
$$;

-- ---------------------------------------------------------------------------
-- 2. Staff actions, shop notes, subscription history
-- ---------------------------------------------------------------------------

create table public.staff_action (
  id bigint generated always as identity primary key,
  staff_user_id uuid,
  staff_email text not null,
  -- 'support_start', 'support_end', 'trial_extend', 'demo_on', 'demo_off', 'password_reset',
  -- 'two_step_off', 'invite_resend', 'note', 'export', ...
  action text not null check (action ~ '^[a-z_]{2,40}$'),
  company_ref uuid references public.company (id) on delete set null,
  -- The shop's name as it was, so the log still reads after a rename or a deleted shop.
  company_name text,
  target_user uuid,
  target_email text,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.staff_action enable row level security;
revoke all on public.staff_action from public, anon, authenticated;
create index staff_action_created_idx on public.staff_action (created_at desc);
create index staff_action_company_idx on public.staff_action (company_ref, created_at desc);

-- The log is kept as written: no one changes or removes a row, the server included.
create or replace function app.staff_action_insert_only() returns trigger
language plpgsql as $$
begin
  raise exception 'The staff activity log can''t be changed.' using errcode = 'insufficient_privilege';
end
$$;
create trigger staff_action_insert_only before update or delete on public.staff_action
  for each row execute function app.staff_action_insert_only();

create table public.shop_note (
  id uuid primary key default gen_random_uuid(),
  company_ref uuid not null references public.company (id) on delete cascade,
  staff_email text not null,
  note text not null check (length(trim(note)) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.shop_note enable row level security;
revoke all on public.shop_note from public, anon, authenticated;
create index shop_note_company_idx on public.shop_note (company_ref, created_at desc);

-- Every change of a shop's subscription status or plan, for MRR over time and churn. History
-- starts with this migration: each shop gets its trial start and, if different, today's status.
create table public.subscription_event (
  id bigint generated always as identity primary key,
  company_ref uuid not null references public.company (id) on delete cascade,
  status text not null,
  plan text not null,
  at timestamptz not null default now()
);
alter table public.subscription_event enable row level security;
revoke all on public.subscription_event from public, anon, authenticated;
create index subscription_event_company_idx on public.subscription_event (company_ref, at);

insert into public.subscription_event (company_ref, status, plan, at)
select s.company_id, 'trialing', 'standard', s.created_at from public.subscription s;
insert into public.subscription_event (company_ref, status, plan, at)
select s.company_id, s.status, s.plan, now() from public.subscription s
where s.status <> 'trialing' or s.plan <> 'standard';

create or replace function app.record_subscription_event() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.plan is distinct from old.plan then
    insert into public.subscription_event (company_ref, status, plan) values (new.company_id, new.status, new.plan);
  end if;
  return new;
end
$$;
create trigger record_subscription_event after insert or update on public.subscription
  for each row execute function app.record_subscription_event();

-- ---------------------------------------------------------------------------
-- 3. The portal's reads (service role only)
-- ---------------------------------------------------------------------------

-- One row per shop (all shops, or just `target_shop`): what the Shops list and a shop's page need.
-- Prices are worked out on the server from packages/core/src/plans.ts, not here.
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
    'payments_details_submitted', coalesce(sa.details_submitted, false))
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

create or replace function public.admin_shops() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(r), '[]'::jsonb) from app.admin_shop_rows() r
$$;

create or replace function public.admin_shop(target uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'shop', (select r from app.admin_shop_rows(target) r),
    'team', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'name', p.full_name, 'email', u.email, 'phone', p.phone,
        'role', m.role, 'status', m.status, 'joined_at', m.created_at,
        'last_sign_in_at', u.last_sign_in_at, 'two_step', coalesce(p.two_step, false),
        'apps', (select coalesce(jsonb_agg(distinct d.app) filter (where d.app is not null), '[]'::jsonb)
                 from public.push_device d where d.user_id = m.user_id),
        'last_seen_at', (select max(d.last_seen_at) from public.push_device d where d.user_id = m.user_id))
        order by (m.status = 'active') desc,
                 case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.full_name), '[]'::jsonb)
      from public.membership m join auth.users u on u.id = m.user_id
      left join public.profile p on p.id = m.user_id
      where m.company_id = target and m.deleted_at is null),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at,
        'expires_at', i.expires_at) order by i.created_at desc), '[]'::jsonb)
      from public.invite i
      where i.company_id = target and i.accepted_at is null and i.revoked_at is null
        and i.expires_at > now()),
    'usage', jsonb_build_object(
      'customers', (select count(*) from public.customer where company_id = target and deleted_at is null),
      'pools', (select count(*) from public.property where company_id = target and deleted_at is null),
      'jobs_open', (select count(*) from public.job where company_id = target and deleted_at is null
                    and not sample and completed_at is null and status <> 'canceled'),
      'jobs_done_month', (select count(*) from public.job where company_id = target and deleted_at is null
                          and not sample and completed_at >= date_trunc('month', now())),
      'jobs_total', (select count(*) from public.job where company_id = target and deleted_at is null
                     and not sample),
      'reports_sent', (select count(*) from public.report where company_id = target and sent_at is not null),
      'quotes_sent', (select count(*) from public.quote where company_id = target and deleted_at is null
                      and status <> 'draft'),
      'quotes_accepted', (select count(*) from public.quote where company_id = target
                          and deleted_at is null and status = 'accepted'),
      'invoices_sent', (select count(*) from public.invoice where company_id = target
                        and deleted_at is null and status not in ('draft', 'void')),
      'collected_cents', (select coalesce(sum(amount_cents), 0) from public.payment
                          where company_id = target and status = 'succeeded'),
      'outstanding_cents', (select coalesce(sum(total_cents - amount_paid_cents), 0) from public.invoice
                            where company_id = target and deleted_at is null
                              and status in ('sent', 'partially_paid')),
      'photos', (select count(*) from public.media where company_id = target and deleted_at is null
                 and kind = 'photo'),
      'storage_bytes', (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o
                        where o.name like target::text || '/%')),
    'today', (select coalesce(jsonb_object_agg(d.kind, d.used), '{}'::jsonb)
              from app.daily_usage d where d.company_id = target and d.day = current_date),
    'activity', (select coalesce(jsonb_agg(a order by a.created_at desc), '[]'::jsonb) from (
        select x.kind, x.created_at, x.customer_name, x.job_number, x.amount_cents, x.preview
        from public.activity x where x.company_id = target and x.deleted_at is null
        order by x.created_at desc limit 40) a),
    'failed_messages', (select coalesce(jsonb_agg(f order by f.created_at desc), '[]'::jsonb) from (
        select x.channel, x.recipient, x.template, x.error, x.created_at
        from public.message x where x.company_id = target and x.status = 'failed'
          and x.created_at > now() - interval '30 days'
        order by x.created_at desc limit 25) f),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', n.id, 'staff_email', n.staff_email, 'note', n.note, 'created_at', n.created_at)
        order by n.created_at desc), '[]'::jsonb)
      from public.shop_note n where n.company_ref = target),
    'support', (select coalesce(jsonb_agg(s order by s.started_at desc), '[]'::jsonb) from (
        select x.id, x.staff_email, x.reason, x.access, x.started_at, x.ends_at, x.ended_at
        from public.support_session x where x.company_ref = target
        order by x.started_at desc limit 25) s))
  where exists (select 1 from public.company where id = target and deleted_at is null)
$$;

-- Everyone with an account, newest first, or those matching `search` (name or email).
create or replace function public.admin_people(search text default null) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select u.id, u.email, p.full_name as name, p.phone, u.created_at, u.last_sign_in_at,
      coalesce(p.two_step, false) as two_step,
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

create or replace function public.admin_person(target uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', u.id, 'email', u.email, 'name', p.full_name, 'phone', p.phone,
    'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'two_step', coalesce(p.two_step, false),
    'shops', (select coalesce(jsonb_agg(jsonb_build_object('company_id', c.id, 'company_name', c.name,
                'role', m.role, 'status', m.status, 'joined_at', m.created_at) order by c.name), '[]'::jsonb)
              from public.membership m join public.company c on c.id = m.company_id
              where m.user_id = u.id and m.deleted_at is null and c.deleted_at is null),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('app', d.app, 'service', d.service,
                  'created_at', d.created_at, 'last_seen_at', d.last_seen_at)
                  order by d.last_seen_at desc), '[]'::jsonb)
                from public.push_device d where d.user_id = u.id),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'company_id', i.company_id,
                  'company_name', c.name, 'role', i.role, 'expires_at', i.expires_at,
                  'accepted_at', i.accepted_at, 'revoked_at', i.revoked_at)
                  order by i.created_at desc), '[]'::jsonb)
                from public.invite i join public.company c on c.id = i.company_id
                where lower(i.email) = lower(u.email)),
    'lead', (select to_jsonb(l) - 'user_id' from public.signup_lead l where l.email = lower(u.email)))
  from auth.users u left join public.profile p on p.id = u.id
  where u.id = target
$$;

-- The Overview's and Finances' numbers over time.
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
        'shops', (select count(*) from public.company c where c.deleted_at is null
                  and c.created_at >= w.wk and c.created_at < w.wk + interval '1 week'))
        order by w.wk) from weeks w),
    'jobs_by_week', (select jsonb_agg(jsonb_build_object('week', w.wk,
        'jobs', (select count(*) from public.job j where j.deleted_at is null and not j.sample
                 and j.completed_at >= w.wk and j.completed_at < w.wk + interval '1 week'))
        order by w.wk) from weeks w),
    'payments_by_month', (select jsonb_agg(jsonb_build_object('month', m.mo,
        'card_cents', (select coalesce(sum(p.amount_cents), 0) from public.payment p
                       where p.status = 'succeeded' and p.method = 'card'
                         and coalesce(p.paid_at, p.created_at) >= m.mo
                         and coalesce(p.paid_at, p.created_at) < m.mo + interval '1 month'),
        'bank_cents', (select coalesce(sum(p.amount_cents), 0) from public.payment p
                       where p.status = 'succeeded' and p.method = 'ach'
                         and coalesce(p.paid_at, p.created_at) >= m.mo
                         and coalesce(p.paid_at, p.created_at) < m.mo + interval '1 month'),
        'other_cents', (select coalesce(sum(p.amount_cents), 0) from public.payment p
                        where p.status = 'succeeded' and p.method = 'other'
                          and coalesce(p.paid_at, p.created_at) >= m.mo
                          and coalesce(p.paid_at, p.created_at) < m.mo + interval '1 month'),
        'refunded_cents', (select coalesce(sum(p.amount_cents), 0) from public.payment p
                           where p.status = 'refunded' and p.updated_at >= m.mo
                             and p.updated_at < m.mo + interval '1 month'),
        'failed', (select count(*) from public.payment p where p.status = 'failed'
                   and p.updated_at >= m.mo and p.updated_at < m.mo + interval '1 month'))
        order by m.mo) from months m),
    'people_active_7d', (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '7 days'
                           or exists (select 1 from public.push_device d where d.user_id = u.id
                                      and d.last_seen_at > now() - interval '7 days')),
    'people_active_30d', (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '30 days'
                            or exists (select 1 from public.push_device d where d.user_id = u.id
                                       and d.last_seen_at > now() - interval '30 days')),
    'people_total', (select count(*) from auth.users),
    'shops_working_7d', (select count(distinct j.company_id) from public.job j
                         where j.deleted_at is null and not j.sample
                           and j.completed_at > now() - interval '7 days'),
    'shops_never_worked', (select count(*) from public.company c where c.deleted_at is null
                           and c.created_at < now() - interval '3 days'
                           and not exists (select 1 from public.job j where j.company_id = c.id
                                           and not j.sample and j.completed_at is not null)),
    'trials_ended_90d', (select count(*) from public.subscription s
                         where s.trial_ends_at between now() - interval '90 days' and now()),
    'trials_converted_90d', (select count(*) from public.subscription s
                             where s.trial_ends_at between now() - interval '90 days' and now()
                               and s.stripe_subscription_id is not null and s.status in ('active', 'past_due')),
    'leads_to_call', (select count(*) from public.signup_lead l where l.contacted_at is null
                      and not exists (select 1 from public.membership m join public.subscription s
                                      on s.company_id = m.company_id
                                      where m.user_id = l.user_id and m.role = 'owner'
                                        and s.stripe_subscription_id is not null)),
    'subscription_events', (select coalesce(jsonb_agg(jsonb_build_object(
        'company_id', e.company_ref, 'status', e.status, 'plan', e.plan, 'at', e.at) order by e.at), '[]'::jsonb)
      from public.subscription_event e where e.at > now() - interval '13 months'
         or e.id in (select max(e2.id) from public.subscription_event e2
                     where e2.at <= now() - interval '13 months' group by e2.company_ref)))
$$;

-- For tech help across shops.
create or replace function public.admin_health() returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object(
    'failed_messages_24h', (select coalesce(jsonb_agg(f order by f.n desc), '[]'::jsonb) from (
        select c.id as company_id, c.name, count(*) as n, max(x.created_at) as last_at,
               (array_agg(x.error order by x.created_at desc))[1] as last_error
        from public.message x join public.company c on c.id = x.company_id
        where x.status = 'failed' and x.created_at > now() - interval '24 hours'
        group by c.id, c.name) f),
    'usage_today', (select coalesce(jsonb_agg(jsonb_build_object('company_id', c.id, 'name', c.name,
                      'kind', d.kind, 'used', d.used) order by d.used desc), '[]'::jsonb)
                    from app.daily_usage d join public.company c on c.id = d.company_id
                    where d.day = current_date),
    'mapbox_month', (select coalesce(jsonb_agg(jsonb_build_object('api', b.api,
                       'limit', b.monthly_limit, 'used', coalesce(u.units, 0)) order by b.api), '[]'::jsonb)
                     from app.mapbox_budget b
                     left join app.mapbox_usage u on u.api = b.api
                       and u.month = date_trunc('month', now() at time zone 'utc')::date),
    'support_open', (select count(*) from public.support_session s
                     where s.ended_at is null and s.ends_at > now()),
    'locked_shops', (select count(*) from public.company c
                     where c.deleted_at is null and app.company_locked(c.id)))
$$;

-- ---------------------------------------------------------------------------
-- 4. Extend Trial and Make Demo Shop (owner, 2026-10-22). Only for shops Stripe doesn't bill
--    yet: a shop with a Stripe subscription is changed in the Stripe dashboard.
-- ---------------------------------------------------------------------------

-- Adds days to the trial (from today if it already ended) and lets the shop in without a card
-- until then. Returns the new end.
create or replace function public.admin_extend_trial(target_company uuid, days integer)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.subscription;
  ends timestamptz;
begin
  if days not in (7, 14, 30) then
    raise exception 'Choose 7, 14 or 30 days.' using errcode = 'invalid_parameter_value';
  end if;
  select * into s from public.subscription where company_id = target_company for update;
  if s.company_id is null then
    raise exception 'This shop has no subscription.' using errcode = 'invalid_parameter_value';
  end if;
  if s.stripe_subscription_id is not null then
    raise exception 'Stripe bills this shop. Change its trial in the Stripe dashboard.'
      using errcode = 'invalid_parameter_value';
  end if;
  if s.plan = 'demo' then
    raise exception 'This is a demo shop. End Demo first.' using errcode = 'invalid_parameter_value';
  end if;
  ends := greatest(coalesce(s.trial_ends_at, now()), now()) + make_interval(days => days);
  update public.subscription
  set status = 'trialing', trial_ends_at = ends, card_required = false, updated_at = now()
  where company_id = target_company;
  return ends;
end
$$;

-- A demo shop works like the built-in demo: no card, no charge, no trial end (as the VIP26
-- code does). Ending a demo gives the shop 7 days of trial to add a card.
create or replace function public.admin_set_demo(target_company uuid, demo boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.subscription;
begin
  select * into s from public.subscription where company_id = target_company for update;
  if s.company_id is null then
    raise exception 'This shop has no subscription.' using errcode = 'invalid_parameter_value';
  end if;
  if s.stripe_subscription_id is not null then
    raise exception 'Stripe bills this shop. Cancel it in the Stripe dashboard first.'
      using errcode = 'invalid_parameter_value';
  end if;
  if demo then
    update public.subscription
    set plan = 'demo', status = 'active', card_required = false, updated_at = now()
    where company_id = target_company;
  elsif s.plan = 'demo' then
    update public.subscription
    set plan = 'standard', status = 'trialing', trial_ends_at = now() + interval '7 days',
        updated_at = now()
    where company_id = target_company;
  end if;
end
$$;

revoke all on function
  public.admin_start_support(uuid, uuid, text, text, integer, text), public.admin_end_support(uuid),
  public.admin_shops(), public.admin_shop(uuid), public.admin_people(text), public.admin_person(uuid),
  public.admin_metrics(), public.admin_health(), public.admin_extend_trial(uuid, integer),
  public.admin_set_demo(uuid, boolean), app.admin_shop_rows(uuid)
  from public, anon, authenticated;
grant execute on function
  public.admin_start_support(uuid, uuid, text, text, integer, text), public.admin_end_support(uuid),
  public.admin_shops(), public.admin_shop(uuid), public.admin_people(text), public.admin_person(uuid),
  public.admin_metrics(), public.admin_health(), public.admin_extend_trial(uuid, integer),
  public.admin_set_demo(uuid, boolean), app.admin_shop_rows(uuid)
  to service_role;
