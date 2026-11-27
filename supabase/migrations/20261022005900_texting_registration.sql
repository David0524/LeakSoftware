-- Texting registration (owner, 2026-11-27: "Let's do A and C. Some shops will want their own
-- number"; docs/plans/texting-registration.md). Phone companies need a shop's business on file
-- before its number can text. A shop picks a toll-free number, a local number, or its own
-- number, enters its business details once, and the server submits them to Twilio and follows
-- the review (/api/cron/texting) until the line is ready. Sundeck Pro pays.
--
-- Server only: owners and admins read their shop's registration (its status and the details
-- they entered); nobody writes it directly, and phones never sync it.

create table public.texting_registration (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  kind text not null check (kind in ('toll_free', 'local', 'own')),
  -- The line it sets up (made at the start: pending until the review passes).
  phone_line_id uuid,
  -- What the shop entered (core checkBusinessDetails): legal_name, business_type, ein, street,
  -- city, state, postal_code, website, first_name, last_name, title, email, phone.
  business jsonb not null,
  -- What the shop sees: registering, verify_number (own number: prove it's theirs),
  -- needs_changes (a review came back), ready; cancelled ends it.
  stage text not null default 'registering'
    check (stage in ('registering', 'verify_number', 'needs_changes', 'ready', 'cancelled')),
  -- The next thing the server does (server/texting-registration.ts) and Twilio's ids so far.
  step text not null default 'start',
  twilio jsonb not null default '{}'::jsonb,
  -- Why a review came back, in plain words (shown to the shop), and the last raw error (staff).
  problem text,
  last_error text,
  attempts integer not null default 0 check (attempts >= 0),
  next_check_at timestamptz not null default now(),
  ready_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  foreign key (phone_line_id, company_id) references public.phone_line (id, company_id)
);
select app.make_synced('public.texting_registration');
-- One registration under way (or done) per shop.
create unique index texting_registration_one_per_company on public.texting_registration (company_id)
  where stage <> 'cancelled' and deleted_at is null;
-- The cron run picks the ones due.
create index texting_registration_due on public.texting_registration (next_check_at)
  where stage in ('registering', 'verify_number') and deleted_at is null;

-- Where the line's texts go out (the shop's Twilio subaccount and Messaging Service) is in
-- twilio (account_sid, messaging_service_sid): phone_line is synced to phones, so it stays as is.

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('texting_registration', 'manager', 'none', null, null, false, 970);

-- Access, as the registry generates it (20261012000600_access.sql): managers read, nobody writes.
grant select on public.texting_registration to authenticated;
create policy texting_registration_select on public.texting_registration for select
  to authenticated using (app.is_manager(company_id));
select app.speed_up_policies();
