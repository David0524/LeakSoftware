-- Jobs and the field inspection: components, checklist results, tests, findings.

create table public.job (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  number integer,
  type text not null default 'detection' check (type in ('detection', 'repair')),
  property_id uuid not null,
  -- Who pays. Often the property owner, but can be a pool company, builder, or insurer.
  bill_to_customer_id uuid,
  -- Repair jobs point at the detection job whose quote created them.
  parent_job_id uuid,
  status text not null default 'unscheduled',
  assigned_user_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz check (scheduled_end is null or scheduled_end >= scheduled_start),
  started_at timestamptz,
  completed_at timestamptz,
  summary_notes text,
  foreign key (property_id, company_id) references public.property (id, company_id),
  foreign key (bill_to_customer_id, company_id) references public.customer (id, company_id),
  foreign key (company_id, assigned_user_id) references public.membership (company_id, user_id)
);
select app.make_synced('public.job');
alter table public.job
  add foreign key (parent_job_id, company_id) references public.job (id, company_id);
create index job_property_idx on public.job (property_id);
create index job_status_idx on public.job (company_id, status);
create index job_schedule_idx on public.job (company_id, scheduled_start);
create unique index job_number_key on public.job (company_id, number);
create trigger assign_number before insert on public.job
  for each row execute function app.assign_number();

-- ---------------------------------------------------------------------------
-- Job status machine. Mirrored in packages/core/src/job-status.ts; a test there
-- parses this table's insert to keep them identical.
-- ---------------------------------------------------------------------------

create table app.job_status_transition (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);

insert into app.job_status_transition (from_status, to_status) values
  ('unscheduled', 'scheduled'),
  ('unscheduled', 'in_progress'),
  ('unscheduled', 'canceled'),
  ('scheduled', 'unscheduled'),
  ('scheduled', 'in_progress'),
  ('scheduled', 'canceled'),
  ('in_progress', 'scheduled'),
  ('in_progress', 'report_sent'),
  ('in_progress', 'invoiced'),
  ('in_progress', 'canceled'),
  ('report_sent', 'in_progress'),
  ('report_sent', 'quote_sent'),
  ('report_sent', 'invoiced'),
  ('report_sent', 'canceled'),
  ('quote_sent', 'report_sent'),
  ('quote_sent', 'quote_accepted'),
  ('quote_sent', 'invoiced'),
  ('quote_sent', 'canceled'),
  ('quote_accepted', 'invoiced'),
  ('quote_accepted', 'canceled'),
  ('invoiced', 'paid'),
  ('invoiced', 'canceled'),
  ('canceled', 'unscheduled');

-- Statuses a new job may start in, and statuses only the server may set (they follow
-- sending a report, a quote being accepted, an invoice, or a payment).
create or replace function app.job_initial_statuses() returns text[]
language sql immutable as $$ select array['unscheduled', 'scheduled', 'in_progress'] $$;

create or replace function app.job_server_statuses() returns text[]
language sql immutable as $$
  select array['report_sent', 'quote_sent', 'quote_accepted', 'invoiced', 'paid']
$$;

create or replace function app.check_job_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not (new.status = any (app.job_initial_statuses())) then
      raise exception 'A job cannot start as %', new.status using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not exists (
      select 1 from app.job_status_transition
      where from_status = old.status and to_status = new.status)
    then
      raise exception 'Job status cannot change from % to %', old.status, new.status
        using errcode = 'check_violation';
    end if;
    if current_user in ('authenticated', 'anon')
       and new.status = any (app.job_server_statuses()) then
      raise exception 'Job status % is set by the server', new.status
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;

create trigger check_job_status before insert or update of status on public.job
  for each row execute function app.check_job_status();

-- ---------------------------------------------------------------------------
-- Inspection
-- ---------------------------------------------------------------------------

-- One instance of a component on this job, e.g. "Return 3".
create table public.job_component (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  component_type_id uuid not null,
  instance_number integer not null default 1 check (instance_number > 0),
  label text not null,
  location_note text,
  sort_order integer not null default 0,
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (component_type_id, company_id) references public.component_type (id, company_id)
);
select app.make_synced('public.job_component');
create index job_component_job_idx on public.job_component (job_id);

-- Inspected (with method) or excluded (with reason). Excluded items are listed on every
-- report with their reason; this is the legal record of what was not checked.
create table public.checklist_item_result (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  job_component_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'inspected', 'excluded')),
  method text,
  exclusion_reason text,
  notes text,
  inspected_at timestamptz,
  inspected_by uuid,
  constraint excluded_needs_reason
    check (status <> 'excluded' or length(trim(coalesce(exclusion_reason, ''))) > 0),
  constraint inspected_needs_method
    check (status <> 'inspected' or length(trim(coalesce(method, ''))) > 0),
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (job_component_id, company_id) references public.job_component (id, company_id)
);
select app.make_synced('public.checklist_item_result');
create unique index checklist_item_result_component_key
  on public.checklist_item_result (job_component_id) where deleted_at is null;
create index checklist_item_result_job_idx on public.checklist_item_result (job_id);

create table public.test_result (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  job_component_id uuid,
  test_type_id uuid not null,
  -- The test_type.schema_version the data was entered against.
  schema_version integer not null,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  computed jsonb not null default '{}'::jsonb,
  outcome text check (outcome in ('pass', 'fail', 'inconclusive')),
  performed_at timestamptz,
  notes text,
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (job_component_id, company_id) references public.job_component (id, company_id),
  foreign key (test_type_id, company_id) references public.test_type (id, company_id)
);
select app.make_synced('public.test_result');
create index test_result_job_idx on public.test_result (job_id);

create table public.finding (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  job_component_id uuid,
  title text not null check (length(trim(title)) > 0),
  location_text text,
  severity_key text not null,
  -- Pin on the top-down pool diagram, normalized 0..1.
  pin_x numeric(5, 4) check (pin_x between 0 and 1),
  pin_y numeric(5, 4) check (pin_y between 0 and 1),
  status text not null default 'open' check (status in ('open', 'quoted', 'repaired', 'monitor')),
  notes text,
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (job_component_id, company_id) references public.job_component (id, company_id)
);
select app.make_synced('public.finding');
create index finding_job_idx on public.finding (job_id);
