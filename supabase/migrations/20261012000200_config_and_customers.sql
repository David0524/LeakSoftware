-- Company configuration (editable by owners, seeded from app.config_default) and
-- customers/properties.

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------

create table public.component_type (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  allows_multiple boolean not null default false,
  default_count integer not null default 1 check (default_count between 0 and 50),
  applies_to text not null default 'pool' check (applies_to in ('pool', 'spa', 'both')),
  -- Inspection methods offered when marking an instance inspected, e.g. "Pressure test".
  methods text[] not null default '{}',
  sort_order integer not null default 0,
  active boolean not null default true
);
select app.make_synced('public.component_type');
create unique index component_type_key on public.component_type (company_id, key)
  where deleted_at is null;

create table public.test_type (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  -- {"fields": [{"key", "label", "type": text|number|select|textarea, "unit", "required", "options"}]}
  field_schema jsonb not null check (jsonb_typeof(field_schema -> 'fields') = 'array'),
  schema_version integer not null default 1,
  -- Named calculator in packages/core. Formulas are code, not data.
  calculator text check (calculator in ('pressure_drop', 'bucket_evaporation')),
  result_options text[] not null default '{pass,fail,inconclusive}',
  sort_order integer not null default 0,
  active boolean not null default true
);
select app.make_synced('public.test_type');
create unique index test_type_key on public.test_type (company_id, key) where deleted_at is null;

create table public.severity_level (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Findings at or above this level must be mentioned in the AI narrative.
  must_mention boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true
);
select app.make_synced('public.severity_level');
create unique index severity_level_key on public.severity_level (company_id, key)
  where deleted_at is null;

create table public.exclusion_reason (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  sort_order integer not null default 0,
  active boolean not null default true
);
select app.make_synced('public.exclusion_reason');

create table public.report_template (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  key text not null check (key in ('homeowner', 'partner', 'insurance')),
  name text not null,
  enabled boolean not null default true,
  -- Ordered block keys rendered by the report page, e.g. ["header","summary","findings"].
  sections jsonb not null check (jsonb_typeof(sections) = 'array'),
  -- Tone and audience instructions for the AI narrative.
  tone text not null default '',
  version integer not null default 1
);
select app.make_synced('public.report_template');
create unique index report_template_key on public.report_template (company_id, key)
  where deleted_at is null;

create table public.price_book_item (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  category text,
  -- Suggests this item for findings on this component type (component_type.key).
  component_type_key text,
  unit text not null default 'each',
  price_cents integer not null default 0 check (price_cents >= 0),
  taxable boolean not null default true,
  warranty_months integer check (warranty_months >= 0),
  sort_order integer not null default 0,
  active boolean not null default true
);
select app.make_synced('public.price_book_item');

-- ---------------------------------------------------------------------------
-- Customers and properties
-- ---------------------------------------------------------------------------

create table public.customer (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  kind text not null default 'homeowner'
    check (kind in ('homeowner', 'pool_company', 'builder', 'insurer', 'property_manager', 'other')),
  name text not null check (length(trim(name)) > 0),
  company_name text,
  email text,
  phone text,
  notes text,
  -- Customer opted out of review requests and reminder emails.
  marketing_opt_out boolean not null default false
);
select app.make_synced('public.customer');

create table public.property (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  customer_id uuid not null,
  address_line1 text not null,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  pool_type text check (pool_type in ('gunite_plaster', 'vinyl', 'fiberglass', 'other')),
  has_pool boolean not null default true,
  has_spa boolean not null default false,
  diagram_shape text not null default 'rectangle'
    check (diagram_shape in ('rectangle', 'oval', 'kidney', 'l_shape', 'freeform')),
  approx_gallons integer check (approx_gallons > 0),
  access_notes text,
  notes text,
  foreign key (customer_id, company_id) references public.customer (id, company_id)
);
select app.make_synced('public.property');
create index property_customer_idx on public.property (customer_id);
