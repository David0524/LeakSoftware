-- Foundation: private helper schema, tenancy (company, people), sync bookkeeping.
--
-- Conventions for every company-scoped table (see docs/BUILD_PLAN.md sections 4-5):
--   * `company_id` on every row; RLS allows only members of that company.
--   * Child rows reference parents by (parent_id, company_id) so a row can never point
--     at another company's data, even by guessing an id.
--   * `app.make_synced()` adds the sync columns (timestamps, soft delete, field HLCs,
--     sync_xid), the (id, company_id) key, the touch trigger, and enables RLS.
--   * Access (RLS policies + column grants) is generated from `app.sync_table` in
--     20261012000600_access.sql. Never grant on a table by hand.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
comment on schema app is 'Private helpers and bookkeeping. Not exposed through the API.';
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

create or replace function app.try_uuid(value text) returns uuid
language plpgsql immutable as $$
begin
  return value::uuid;
exception when others then
  return null;
end
$$;

-- Keeps created_at stable, bumps updated_at, and stamps the transaction id used as the
-- sync pull cursor (BUILD_PLAN 4.4).
create or replace function app.touch_row() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  new.sync_xid := pg_current_xact_id();
  return new;
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
  execute format('alter table %s enable row level security', t);
end
$$;

-- ---------------------------------------------------------------------------
-- Company
-- ---------------------------------------------------------------------------

create table public.company (
  id uuid primary key default gen_random_uuid(),
  -- Same as id. Lets the company row use the same RLS and sync rules as everything else.
  company_id uuid generated always as (id) stored,
  name text not null check (length(trim(name)) > 0),
  legal_name text,
  phone text,
  email text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  logo_path text,
  brand_primary text not null default '#12263A' check (brand_primary ~ '^#[0-9A-Fa-f]{6}$'),
  brand_secondary text check (brand_secondary ~ '^#[0-9A-Fa-f]{6}$'),
  review_url text,
  timezone text not null default 'America/New_York',
  -- Money and rates are integers: cents and basis points (1% = 100 bps).
  settings jsonb not null default '{
    "deposit": {"type": "percent", "value_bps": 5000, "minimum_cents": 0},
    "tax_rate_bps": 0,
    "tech_discount_limit_bps": 1000,
    "reminders": {"quote_days": [3, 7], "invoice_days": [7, 14, 30]},
    "review_requests": true,
    "sync_window_days": 365,
    "signature_purposes": {
      "inspection_ack": true,
      "work_authorization": false,
      "quote_acceptance": true,
      "completion": false
    }
  }'::jsonb
);
select app.make_synced('public.company');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- One row per auth user, created by trigger. Not company-scoped.
create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profile enable row level security;

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profile (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

create table public.membership (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'tech')),
  status text not null default 'active' check (status in ('active', 'disabled'))
);
select app.make_synced('public.membership');
create unique index membership_company_user_key on public.membership (company_id, user_id);
create index membership_user_idx on public.membership (user_id);

create table public.invite (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null check (role in ('owner', 'tech')),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null default now() + interval '14 days',
  created_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.invite enable row level security;
create index invite_company_idx on public.invite (company_id);

-- ---------------------------------------------------------------------------
-- Membership checks used by RLS. SECURITY DEFINER so policies on membership itself
-- do not recurse.
-- ---------------------------------------------------------------------------

create or replace function app.is_member(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.membership
    where company_id = target_company
      and user_id = auth.uid()
      and status = 'active'
      and deleted_at is null
  )
$$;

create or replace function app.is_owner(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.membership
    where company_id = target_company
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
      and deleted_at is null
  )
$$;

-- True when the caller and `other_user` are active members of at least one common company.
create or replace function app.shares_company(other_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.membership mine
    join public.membership theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.status = 'active' and mine.deleted_at is null
      and theirs.user_id = other_user and theirs.status = 'active' and theirs.deleted_at is null
  )
$$;

revoke all on function app.is_member(uuid), app.is_owner(uuid), app.shares_company(uuid) from public;
grant execute on function app.is_member(uuid), app.is_owner(uuid), app.shares_company(uuid), app.try_uuid(text)
  to authenticated, service_role;

-- A company must always keep at least one active owner.
create or replace function app.protect_last_owner() returns trigger
language plpgsql as $$
begin
  if old.role = 'owner' and old.status = 'active' and old.deleted_at is null
     and (tg_op = 'DELETE'
          or new.role <> 'owner' or new.status <> 'active' or new.deleted_at is not null)
     and not exists (
       select 1 from public.membership
       where company_id = old.company_id and id <> old.id
         and role = 'owner' and status = 'active' and deleted_at is null)
  then
    raise exception 'A company must keep at least one active owner'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end
$$;

create trigger protect_last_owner
  before update or delete on public.membership
  for each row execute function app.protect_last_owner();

-- ---------------------------------------------------------------------------
-- Per-company document numbers (job #1001, quote #1001, invoice #1001).
-- Assigned by the server on insert, so records created offline get a number on sync.
-- ---------------------------------------------------------------------------

create table app.company_counter (
  company_id uuid not null references public.company (id) on delete cascade,
  kind text not null,
  last_value integer not null,
  primary key (company_id, kind)
);

create or replace function app.next_number(target_company uuid, counter_kind text) returns integer
language sql security definer set search_path = app, pg_temp as $$
  insert into app.company_counter as c (company_id, kind, last_value)
  values (target_company, counter_kind, 1001)
  on conflict (company_id, kind) do update set last_value = c.last_value + 1
  returning last_value
$$;

create or replace function app.assign_number() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.number is null then
    new.number := app.next_number(new.company_id, tg_table_name);
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Sync bookkeeping (used by sync_push / sync_pull in M2)
-- ---------------------------------------------------------------------------

-- Registry of company-scoped tables. Drives RLS policies, column grants, and sync.
--   read_role / write_role: who may read / insert+update ('member' = owner or tech).
--   insert_columns / update_columns: columns clients may write. Everything else is
--   server-owned (set by triggers, functions, or the service role).
--   device_sync: whether phones pull this table.
create table app.sync_table (
  table_name text primary key,
  read_role text not null check (read_role in ('member', 'owner')),
  write_role text not null check (write_role in ('member', 'owner', 'none')),
  insert_columns text[],
  update_columns text[],
  device_sync boolean not null default true,
  sort_order integer not null
);

create table app.applied_mutation (
  mutation_id uuid primary key,
  company_id uuid not null references public.company (id) on delete cascade,
  user_id uuid,
  applied_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.company (id) on delete cascade,
  user_id uuid,
  device_id text,
  table_name text not null,
  row_id uuid not null,
  field text,
  old_value jsonb,
  new_value jsonb,
  hlc text,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create index audit_log_company_row_idx on public.audit_log (company_id, table_name, row_id);
