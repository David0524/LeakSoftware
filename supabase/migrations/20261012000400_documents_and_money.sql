-- Reports, quotes, invoices, payments, media, signatures, and delivery.
-- Money is integer cents everywhere.

create table public.report (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  template_key text not null check (template_key in ('homeowner', 'partner', 'insurance')),
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'superseded')),
  ai_draft jsonb,
  final_sections jsonb,
  -- Frozen copy of the job data the report was built from. Set when sent.
  data_snapshot jsonb,
  model text,
  prompt_version text,
  pdf_path text,
  sent_at timestamptz,
  foreign key (job_id, company_id) references public.job (id, company_id)
);
select app.make_synced('public.report');
create unique index report_version_key on public.report (job_id, template_key, version)
  where deleted_at is null;

-- What the customer received must never change. After sending, only the move to
-- 'superseded' (when a new version is sent) is allowed.
create or replace function app.freeze_sent_report() returns trigger
language plpgsql as $$
begin
  if old.status in ('sent', 'superseded') then
    if new.status = 'superseded' and old.status = 'sent'
       and (to_jsonb(new) - array['status', 'updated_at', 'sync_xid', 'field_hlc'])
           = (to_jsonb(old) - array['status', 'updated_at', 'sync_xid', 'field_hlc']) then
      return new;
    end if;
    raise exception 'Report % has been sent and cannot be changed', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger freeze_sent_report before update on public.report
  for each row execute function app.freeze_sent_report();

create table public.quote (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  number integer,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0 check (discount_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0,
  -- Copy of the company deposit rule when the quote was built.
  deposit_rule jsonb,
  deposit_cents integer not null default 0 check (deposit_cents >= 0),
  valid_until date,
  notes text,
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_by_name text,
  accepted_ip inet,
  accepted_user_agent text,
  repair_job_id uuid,
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (repair_job_id, company_id) references public.job (id, company_id)
);
select app.make_synced('public.quote');
create index quote_job_idx on public.quote (job_id);
create unique index quote_number_key on public.quote (company_id, number);
create trigger assign_number before insert on public.quote
  for each row execute function app.assign_number();

create table public.quote_line_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  quote_id uuid not null,
  finding_id uuid,
  price_book_item_id uuid,
  -- Description and price are copied from the price book so later edits don't change quotes.
  description text not null check (length(trim(description)) > 0),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  taxable boolean not null default true,
  warranty_months integer check (warranty_months >= 0),
  sort_order integer not null default 0,
  foreign key (quote_id, company_id) references public.quote (id, company_id),
  foreign key (finding_id, company_id) references public.finding (id, company_id),
  foreign key (price_book_item_id, company_id) references public.price_book_item (id, company_id)
);
select app.make_synced('public.quote_line_item');
create index quote_line_item_quote_idx on public.quote_line_item (quote_id);

create table public.invoice (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  quote_id uuid,
  number integer,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partially_paid', 'paid', 'void')),
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null default 0,
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  due_date date,
  notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (quote_id, company_id) references public.quote (id, company_id)
);
select app.make_synced('public.invoice');
create index invoice_job_idx on public.invoice (job_id);
create unique index invoice_number_key on public.invoice (company_id, number);
create trigger assign_number before insert on public.invoice
  for each row execute function app.assign_number();

create table public.invoice_line_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  invoice_id uuid not null,
  kind text not null default 'item' check (kind in ('item', 'deposit_credit')),
  description text not null check (length(trim(description)) > 0),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  -- Negative only for deposit credits.
  unit_price_cents integer not null
    check (unit_price_cents >= 0 or kind = 'deposit_credit'),
  taxable boolean not null default true,
  warranty_months integer check (warranty_months >= 0),
  sort_order integer not null default 0,
  foreign key (invoice_id, company_id) references public.invoice (id, company_id)
);
select app.make_synced('public.invoice_line_item');
create index invoice_line_item_invoice_idx on public.invoice_line_item (invoice_id);

create table public.payment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  invoice_id uuid,
  quote_id uuid,
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('card', 'ach', 'other')),
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  check (invoice_id is not null or quote_id is not null),
  foreign key (invoice_id, company_id) references public.invoice (id, company_id),
  foreign key (quote_id, company_id) references public.quote (id, company_id)
);
select app.make_synced('public.payment');

-- ---------------------------------------------------------------------------
-- Media and signatures
-- ---------------------------------------------------------------------------

create table public.media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  finding_id uuid,
  job_component_id uuid,
  test_result_id uuid,
  kind text not null check (kind in ('photo', 'video', 'audio')),
  -- media/{company_id}/{job_id}/{media_id}.{ext}
  storage_path text,
  upload_state text not null default 'pending' check (upload_state in ('pending', 'uploaded')),
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  -- Hash of the original file, for showing it has not been altered since capture.
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  width integer,
  height integer,
  duration_ms integer,
  captured_at timestamptz,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  -- Vector markup (arrows, circles, text) drawn over the untouched original.
  markup jsonb,
  caption text,
  transcript text,
  transcript_status text not null default 'none'
    check (transcript_status in ('none', 'pending', 'done', 'failed')),
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (finding_id, company_id) references public.finding (id, company_id),
  foreign key (job_component_id, company_id) references public.job_component (id, company_id),
  foreign key (test_result_id, company_id) references public.test_result (id, company_id)
);
select app.make_synced('public.media');
create index media_job_idx on public.media (job_id);

create table public.signature (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  report_id uuid,
  quote_id uuid,
  purpose text not null
    check (purpose in ('inspection_ack', 'work_authorization', 'quote_acceptance', 'completion')),
  signer_name text not null check (length(trim(signer_name)) > 0),
  signer_role text,
  image_path text,
  signed_at timestamptz not null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  device_id text,
  check (purpose <> 'quote_acceptance' or quote_id is not null),
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (report_id, company_id) references public.report (id, company_id),
  foreign key (quote_id, company_id) references public.quote (id, company_id)
);
select app.make_synced('public.signature');
create index signature_job_idx on public.signature (job_id);

-- ---------------------------------------------------------------------------
-- Delivery and warranty
-- ---------------------------------------------------------------------------

-- Unguessable link to the customer page (/r/{token}). Created by the server when sending.
create table public.share_link (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  job_id uuid not null,
  report_id uuid,
  quote_id uuid,
  invoice_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (report_id, company_id) references public.report (id, company_id),
  foreign key (quote_id, company_id) references public.quote (id, company_id),
  foreign key (invoice_id, company_id) references public.invoice (id, company_id)
);
select app.make_synced('public.share_link');

create table public.message (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid,
  -- email: sent by the server. sms_device: the tech texted the link from their own phone.
  channel text not null check (channel in ('email', 'sms_device')),
  recipient text not null,
  template text not null,
  status text not null default 'sent' check (status in ('queued', 'sent', 'delivered', 'failed')),
  provider_id text,
  error text,
  foreign key (job_id, company_id) references public.job (id, company_id)
);
select app.make_synced('public.message');
create index message_job_idx on public.message (job_id);

create table public.warranty (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  repair_job_id uuid not null,
  quote_line_item_id uuid,
  description text not null,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  terms text,
  foreign key (repair_job_id, company_id) references public.job (id, company_id),
  foreign key (quote_line_item_id, company_id) references public.quote_line_item (id, company_id)
);
select app.make_synced('public.warranty');
create index warranty_ends_idx on public.warranty (company_id, ends_on);

-- ---------------------------------------------------------------------------
-- Payments setup and LeakBook billing (server-owned, owners can read)
-- ---------------------------------------------------------------------------

create table public.stripe_account (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.company (id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stripe_account enable row level security;

create table public.subscription (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.company (id) on delete cascade,
  plan text not null default 'standard',
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscription enable row level security;
