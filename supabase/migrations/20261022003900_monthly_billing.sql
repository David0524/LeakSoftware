-- Monthly billing: charges on visits, an invoice day, and Send All (owner, 2026-11-15, passing on
-- a pool service shop: "a way to invoice all service customers at once"; "a way to add extra
-- charges for each customer like if they cleaned their filter or cleaned the salt cell, or
-- replaced any parts that month like a skimmer basket ... Then send all at once"; the owner's
-- own "set the invoice date when setting up a new recurring job").
-- Design: docs/design/2026-11-15-monthly-billing.md.
--
--   * visit_charge: a part or service added on a maintenance visit ("Replace skimmer basket"),
--     by anyone on the team, offline like the rest of a visit. A price book item's price is the
--     server's; a custom charge keeps the price typed. Each is its own line on the customer's
--     monthly invoice; a sent invoice's charges can't change; voiding frees them.
--   * service_plan.invoice_day and company.settings.invoice_day (1 to 28, default 1): the day of
--     the next month a customer's monthly invoice is drafted. A customer with several plans is
--     billed on the earliest. Create Invoices still drafts everyone at once.
--   * public.billing_months and public.month_billing: what Invoices › Monthly Billing and a
--     month's page show, the same on every platform. Sending them all is the website's
--     (each through the usual send_invoice).

-- ---------------------------------------------------------------------------
-- Charges on a visit
-- ---------------------------------------------------------------------------

-- The screens offer charges on maintenance visits only, and only those are billed monthly
-- (other jobs have their own invoice).

create table public.visit_charge (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  -- The price book item; its name is copied, so a rename never rewrites history. None: a
  -- custom charge with the price typed.
  price_book_item_id uuid,
  name text not null check (length(trim(name)) between 1 and 120),
  quantity numeric(10, 2) not null default 1 check (quantity > 0 and quantity <= 10000),
  unit_price_cents integer not null default 0 check (unit_price_cents between 0 and 99999999),
  taxable boolean not null default true,
  -- Server-set: the monthly invoice that billed it.
  billed_invoice_id uuid,
  added_by uuid default auth.uid(),
  added_at timestamptz not null default now(),
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (price_book_item_id, company_id) references public.price_book_item (id, company_id),
  foreign key (billed_invoice_id, company_id) references public.invoice (id, company_id),
  foreign key (company_id, added_by) references public.membership (company_id, user_id)
);
select app.make_synced('public.visit_charge');
create index visit_charge_job_idx on public.visit_charge (job_id);
create index visit_charge_invoice_idx on public.visit_charge (billed_invoice_id)
  where billed_invoice_id is not null;

-- Access: as the registry generates it (20261012000600_access.sql), like chemical_addition:
-- members read and write, narrowed to the jobs they may see; phones keep a visit's charges with
-- the visit. The billing is the server's.
insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order,
   job_ref)
values ('visit_charge', 'member', 'member',
  '{job_id,price_book_item_id,name,quantity,unit_price_cents,taxable,added_at}',
  '{price_book_item_id,name,quantity,unit_price_cents,taxable,deleted_at}',
  true, 309, 't.job_id');

grant select on public.visit_charge to authenticated;
create policy visit_charge_select on public.visit_charge for select to authenticated
  using (app.is_member(company_id));
grant insert (id, company_id, job_id, price_book_item_id, name, quantity, unit_price_cents,
  taxable, added_at) on public.visit_charge to authenticated;
create policy visit_charge_insert on public.visit_charge for insert to authenticated
  with check (app.is_member(company_id));
grant update (price_book_item_id, name, quantity, unit_price_cents, taxable, deleted_at)
  on public.visit_charge to authenticated;
create policy visit_charge_update on public.visit_charge for update to authenticated
  using (app.is_member(company_id)) with check (app.is_member(company_id));
create policy visit_charge_job_visible on public.visit_charge as restrictive for all
  to authenticated
  using (app.job_visible(company_id, job_id)) with check (app.job_visible(company_id, job_id));

create trigger guard_writable before insert or update or delete on public.visit_charge
  for each row execute function app.guard_writable();

select app.speed_up_policies();

/**
 * A price book item's price and tax flag are the server's, when a charge arrives or changes to
 * another item: whatever a client sent is replaced. A custom charge keeps what was typed.
 */
create or replace function app.visit_charge_price() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  item public.price_book_item;
begin
  if new.price_book_item_id is not null
     and (tg_op = 'INSERT' or new.price_book_item_id is distinct from old.price_book_item_id
          or new.unit_price_cents is distinct from old.unit_price_cents
          or new.taxable is distinct from old.taxable) then
    select * into item from public.price_book_item
    where id = new.price_book_item_id and company_id = new.company_id;
    new.unit_price_cents := coalesce(item.price_cents, 0);
    new.taxable := coalesce(item.taxable, true);
  end if;
  return new;
end
$$;
create trigger visit_charge_price before insert or update on public.visit_charge
  for each row execute function app.visit_charge_price();

/** A charge on a sent invoice can't change (sent invoices are final); voiding frees it. */
create or replace function app.visit_charge_locked() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if old.billed_invoice_id is not null
     and (new.quantity, new.name, new.price_book_item_id, new.deleted_at, new.unit_price_cents,
          new.taxable)
         is distinct from
         (old.quantity, old.name, old.price_book_item_id, old.deleted_at, old.unit_price_cents,
          old.taxable)
     and exists (select 1 from public.invoice i where i.id = old.billed_invoice_id
                 and i.status not in ('draft', 'void'))
  then
    raise exception 'This charge is on a sent invoice. Change the invoice instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger visit_charge_locked before update on public.visit_charge
  for each row execute function app.visit_charge_locked();

-- ---------------------------------------------------------------------------
-- Charges on the monthly invoice
-- ---------------------------------------------------------------------------

-- The charge an invoice line bills (server-set).
alter table public.invoice_line_item add column visit_charge_id uuid,
  add foreign key (visit_charge_id, company_id) references public.visit_charge (id, company_id);
create index invoice_line_item_charge_idx on public.invoice_line_item (visit_charge_id)
  where visit_charge_id is not null;

/**
 * The charges a month's invoices bill: on finished maintenance visits that month, not billed
 * yet; and the month before's, when that month's invoice for the customer was already sent
 * without them (added late), as chemicals (20261022003000_chemical_additions.sql).
 */
create or replace function app.unbilled_charges(target_company uuid, month date)
returns table (charge_id uuid, job_id uuid, customer_id uuid)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select x.id, j.id, j.bill_to_customer_id
  from public.visit_charge x
  join public.job j on j.id = x.job_id
  join public.company c on c.id = x.company_id
  where x.company_id = target_company and x.deleted_at is null and x.billed_invoice_id is null
    and j.type = 'maintenance' and j.deleted_at is null and j.status in ('done', 'invoiced', 'paid')
    and j.bill_to_customer_id is not null
    and (app.visit_month(j, c.timezone) = date_trunc('month', month)::date
         or (app.visit_month(j, c.timezone) = (date_trunc('month', month) - interval '1 month')::date
             and exists (select 1 from public.invoice i
                         where i.company_id = target_company
                           and i.customer_id = j.bill_to_customer_id
                           and i.period_month = app.visit_month(j, c.timezone)
                           and i.status not in ('draft', 'void') and i.deleted_at is null)))
$$;

/**
 * A draft's charge lines follow its charges: one line per charge, "Replace skimmer basket,
 * Oct 14", after the invoice's other lines. Lines whose charge is gone are removed. Sent
 * invoices never change.
 */
create or replace function app.sync_charge_lines(target_invoice uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  tz text;
  next_sort integer;
begin
  select * into inv from public.invoice where id = target_invoice;
  if inv.id is null or inv.status <> 'draft' or inv.deleted_at is not null then
    return;
  end if;
  select timezone into tz from public.company where id = inv.company_id;
  update public.invoice_line_item l set deleted_at = now()
  where l.invoice_id = inv.id and l.visit_charge_id is not null and l.deleted_at is null
    and not exists (select 1 from public.visit_charge x where x.id = l.visit_charge_id
                    and x.billed_invoice_id = inv.id and x.deleted_at is null);
  update public.invoice_line_item l
  set quantity = x.quantity, unit_price_cents = x.unit_price_cents, taxable = x.taxable
  from public.visit_charge x
  where l.invoice_id = inv.id and l.visit_charge_id = x.id and l.deleted_at is null
    and (l.quantity, l.unit_price_cents, l.taxable)
        is distinct from (x.quantity, x.unit_price_cents, x.taxable);
  select coalesce(max(sort_order), 0) into next_sort
  from public.invoice_line_item where invoice_id = inv.id and deleted_at is null;
  insert into public.invoice_line_item (company_id, invoice_id, description, quantity,
                                        unit_price_cents, taxable, sort_order, visit_charge_id)
  select inv.company_id, inv.id,
         x.name || ', ' || to_char(coalesce(j.plan_date,
           (coalesce(j.scheduled_start, j.completed_at, x.added_at) at time zone tz)::date),
           'Mon FMDD'),
         x.quantity, x.unit_price_cents, x.taxable,
         next_sort + row_number() over (order by j.plan_date nulls last, x.added_at, x.id),
         x.id
  from public.visit_charge x join public.job j on j.id = x.job_id
  where x.billed_invoice_id = inv.id and x.deleted_at is null
    and not exists (select 1 from public.invoice_line_item l where l.invoice_id = inv.id
                    and l.visit_charge_id = x.id and l.deleted_at is null);
end
$$;

/**
 * A charge changed: its draft's lines follow. A new charge on a visit already on a draft joins
 * that draft at once (the office may be reviewing it); others wait for the month's drafting.
 */
create or replace function app.visit_charge_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  draft uuid;
begin
  if tg_op = 'INSERT' and new.billed_invoice_id is null and new.deleted_at is null then
    -- The customer's draft for the finished visit's month.
    select i.id into draft
    from public.job j
    join public.company c on c.id = j.company_id
    join public.invoice i on i.company_id = j.company_id and i.customer_id = j.bill_to_customer_id
      and i.period_month = app.visit_month(j, c.timezone)
    where j.id = new.job_id and j.type = 'maintenance' and j.deleted_at is null
      and j.status in ('done', 'invoiced', 'paid')
      and i.status = 'draft' and i.deleted_at is null;
    if draft is not null then
      update public.visit_charge set billed_invoice_id = draft where id = new.id;
      return null;
    end if;
  end if;
  if new.billed_invoice_id is not null then
    perform app.sync_charge_lines(new.billed_invoice_id);
  end if;
  if tg_op = 'UPDATE' and old.billed_invoice_id is not null
     and old.billed_invoice_id is distinct from new.billed_invoice_id then
    perform app.sync_charge_lines(old.billed_invoice_id);
  end if;
  return null;
end
$$;
create trigger visit_charge_changed after insert or update on public.visit_charge
  for each row execute function app.visit_charge_changed();

-- ---------------------------------------------------------------------------
-- Invoice day
-- ---------------------------------------------------------------------------

alter table public.service_plan add column invoice_day smallint
  check (invoice_day is null or invoice_day between 1 and 28);
update app.sync_table
set insert_columns = insert_columns || '{invoice_day}',
    update_columns = update_columns || '{invoice_day}'
where table_name = 'service_plan';
grant insert (invoice_day), update (invoice_day) on public.service_plan to authenticated;

/** The shop's invoice day (Settings › Payments): 1 to 28, else the 1st. */
create or replace function app.shop_invoice_day(target_company uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select case when c.settings ->> 'invoice_day' ~ '^\d{1,2}$'
                   and (c.settings ->> 'invoice_day')::int between 1 and 28
              then (c.settings ->> 'invoice_day')::int else 1 end
  from public.company c where c.id = target_company
$$;

/** A customer's invoice day: the earliest of their live plans' days (the shop's when unset). */
create or replace function app.customer_invoice_day(target_company uuid, target_customer uuid)
returns integer
language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(min(coalesce(sp.invoice_day, app.shop_invoice_day(target_company))),
                  app.shop_invoice_day(target_company))::int
  from public.service_plan sp
  where sp.company_id = target_company and sp.customer_id = target_customer
    and sp.deleted_at is null
$$;

/** The day a customer's invoice for a month is due to be drafted: their day, the next month. */
create or replace function app.customer_bill_date(target_company uuid, target_customer uuid,
                                                  month date) returns date
language sql stable security definer set search_path = public, app, pg_temp as $$
  select (date_trunc('month', month) + interval '1 month')::date
         + app.customer_invoice_day(target_company, target_customer) - 1
$$;

-- New Job's plan (20261012004800_plan_schedule_and_monthly_price.sql, owners and admins since
-- 20261012005200_admin_role.sql), with the plan's invoice day.
create or replace function public.create_service_plan(
  target_company uuid,
  new_customer jsonb,
  existing_customer uuid,
  new_property jsonb,
  existing_property uuid,
  plan jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, app, pg_temp as $$
declare
  cp record;
  new_plan uuid;
begin
  if not app.is_manager(target_company) then
    raise exception 'Only owners and admins can start maintenance plans'
      using errcode = 'insufficient_privilege';
  end if;
  select * into cp from app.customer_and_pool(target_company, new_customer, existing_customer,
                                              new_property, existing_property);
  insert into public.service_plan (company_id, customer_id, property_id, assigned_user_id,
                                   starts_on, interval_weeks, weekdays, monthly, visit_time,
                                   duration_minutes, price_cents, ends_on, notes, invoice_day)
  values (target_company, cp.cust, cp.prop, (plan ->> 'assigned_user_id')::uuid,
          (plan ->> 'starts_on')::date, coalesce((plan ->> 'interval_weeks')::smallint, 1),
          case when jsonb_typeof(plan -> 'weekdays') = 'array'
               then array(select jsonb_array_elements_text(plan -> 'weekdays')::smallint) end,
          coalesce((plan ->> 'monthly')::boolean, false),
          (plan ->> 'visit_time')::time, coalesce((plan ->> 'duration_minutes')::integer, 30),
          (plan ->> 'price_cents')::integer, (plan ->> 'ends_on')::date, plan ->> 'notes',
          (plan ->> 'invoice_day')::smallint)
  returning id into new_plan;
  return jsonb_build_object('plan', new_plan, 'customer', cp.cust, 'property', cp.prop);
end
$$;

-- ---------------------------------------------------------------------------
-- Drafting a month: charges, and (for the daily run) each customer on their day
-- ---------------------------------------------------------------------------

-- As 20261022003000_chemical_additions.sql, plus the month's charges, and `as_of`: when given
-- (the daily run), only customers whose invoice day has come by that date.
drop function app.bill_maintenance_month(uuid, date);
create function app.bill_maintenance_month(target_company uuid, month date, as_of date default null)
returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  tz text;
  m date := date_trunc('month', month)::date;
  cust record;
  inv public.invoice;
  anchor uuid;
  touched integer := 0;
  next_sort integer;
  visits uuid[];
  chems uuid[];
  charges uuid[];
begin
  select timezone into tz from public.company where id = target_company;
  for cust in
    select u.customer_id from (
      select bill_to_customer_id as customer_id from app.unbilled_visits(target_company, m)
      union
      select customer_id from app.unbilled_chemicals(target_company, m)
      union
      select customer_id from app.unbilled_charges(target_company, m)
    ) u
    where as_of is null or app.customer_bill_date(target_company, u.customer_id, m) <= as_of
  loop
    visits := array(select j.id from app.unbilled_visits(target_company, m) j
                    where j.bill_to_customer_id = cust.customer_id);
    chems := array(select c.addition_id from app.unbilled_chemicals(target_company, m) c
                   where c.customer_id = cust.customer_id);
    charges := array(select c.charge_id from app.unbilled_charges(target_company, m) c
                     where c.customer_id = cust.customer_id);
    inv := null;
    select * into inv from public.invoice
    where company_id = target_company and customer_id = cust.customer_id and period_month = m
      and status <> 'void' and deleted_at is null;
    if inv.id is not null and inv.status <> 'draft' then
      continue;
    end if;

    -- The month's last visit carries the invoice (a visit with chemicals or charges counts too).
    select v.id into anchor from (
      select j.id, j.scheduled_start, j.completed_at, j.plan_date
      from public.job j where j.id = any (visits)
         or j.id in (select a.job_id from public.chemical_addition a where a.id = any (chems))
         or j.id in (select x.job_id from public.visit_charge x where x.id = any (charges))
      union all
      select j.id, j.scheduled_start, j.completed_at, j.plan_date
      from public.job j where inv.id is not null and j.billed_invoice_id = inv.id
    ) v
    order by v.plan_date desc nulls last, coalesce(v.scheduled_start, v.completed_at) desc nulls last,
             v.id desc
    limit 1;

    if inv.id is null then
      insert into public.invoice (company_id, job_id, customer_id, period_month)
      values (target_company, anchor, cust.customer_id, m)
      returning * into inv;
    elsif inv.job_id <> anchor then
      update public.invoice set job_id = anchor where id = inv.id;
    end if;

    select coalesce(max(sort_order), 0) into next_sort
    from public.invoice_line_item where invoice_id = inv.id;

    -- The month's plan lines first.
    insert into public.invoice_line_item (company_id, invoice_id, description, unit_price_cents,
                                          taxable, sort_order, service_plan_id)
    select target_company, inv.id,
           'Pool service, ' || to_char(m, 'FMMonth')
             || case when count(*) over () > 1 then ', ' || pr.address_line1 else '' end,
           sp.price_cents, false,
           next_sort + row_number() over (order by pr.address_line1, sp.id), sp.id
    from public.service_plan sp join public.property pr on pr.id = sp.property_id
    where sp.id in (select j.service_plan_id from public.job j where j.id = any (visits))
      and app.plan_month_cents(sp.id, m) > 0;

    select coalesce(max(sort_order), 0) into next_sort
    from public.invoice_line_item where invoice_id = inv.id;
    insert into public.invoice_line_item (company_id, invoice_id, description, unit_price_cents,
                                          taxable, sort_order)
    select target_company, inv.id, l.label || ', ' || to_char(l.day, 'Mon FMDD'), l.cents, false,
           next_sort + row_number() over (order by l.day, l.started, l.job_id, l.line_order)
    from (
      select coalesce(j.plan_date,
               (coalesce(j.scheduled_start, j.completed_at, j.created_at) at time zone tz)::date) as day,
             j.scheduled_start as started, j.id as job_id, 'Pool service' as label,
             j.fee_cents as cents, 0 as line_order
      from public.job j
      where j.id = any (visits) and coalesce(j.fee_cents, 0) > 0
      union all
      select coalesce(j.plan_date,
               (coalesce(j.scheduled_start, j.completed_at, j.created_at) at time zone tz)::date),
             j.scheduled_start, j.id, x.label, x.price_cents, x.sort_order
      from public.job j
      join public.job_component x on x.job_id = j.id and x.plan_cleaning_id is not null
        and x.deleted_at is null and x.price_cents > 0
      where j.id = any (visits)
    ) l;

    update public.job set billed_invoice_id = inv.id where id = any (visits);
    update public.chemical_addition set billed_invoice_id = inv.id where id = any (chems);
    perform app.sync_chemical_lines(inv.id);
    -- The charges, a line each (app.sync_charge_lines, through their trigger).
    update public.visit_charge set billed_invoice_id = inv.id where id = any (charges);
    perform app.sync_charge_lines(inv.id);
    touched := touched + 1;
  end loop;
  return touched;
end
$$;
revoke all on function app.bill_maintenance_month(uuid, date, date) from public;

-- The daily run: last month, for each customer whose invoice day has come.
create or replace function public.bill_maintenance_due(at timestamptz default now())
returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c record;
  today date;
  total integer := 0;
begin
  for c in select id, timezone from public.company loop
    today := (at at time zone c.timezone)::date;
    total := total + app.bill_maintenance_month(
      c.id, (date_trunc('month', today) - interval '1 month')::date, today);
  end loop;
  return total;
end
$$;

-- Voiding frees the charges too. As 20261022003000_chemical_additions.sql.
create or replace function app.monthly_invoice_status() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.period_month is null or new.status is not distinct from old.status then
    return null;
  end if;
  if new.status in ('sent', 'partially_paid') then
    update public.job set status = 'invoiced', completed_at = coalesce(completed_at, now())
    where billed_invoice_id = new.id and status = 'done';
  elsif new.status = 'paid' then
    update public.job set status = 'invoiced' where billed_invoice_id = new.id and status = 'done';
    update public.job set status = 'paid' where billed_invoice_id = new.id and status = 'invoiced';
  elsif new.status = 'void' then
    update public.job set billed_invoice_id = null where billed_invoice_id = new.id;
    update public.chemical_addition set billed_invoice_id = null where billed_invoice_id = new.id;
    update public.visit_charge set billed_invoice_id = null where billed_invoice_id = new.id;
  end if;
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Monthly Billing (owners and admins)
-- ---------------------------------------------------------------------------

/**
 * What isn't on an invoice yet for a month, per customer: visits, chemicals, charges, and the
 * day their invoice is due to be drafted.
 */
create or replace function app.month_unbilled(target_company uuid, month date)
returns table (customer_id uuid, bill_date date)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select u.customer_id, app.customer_bill_date(target_company, u.customer_id, month)
  from (
    select bill_to_customer_id as customer_id from app.unbilled_visits(target_company, month)
    union
    select customer_id from app.unbilled_chemicals(target_company, month)
    union
    select customer_id from app.unbilled_charges(target_company, month)
  ) u
  -- A customer whose month was already sent waits for the office (as the drafting skips them).
  where not exists (select 1 from public.invoice i
                    where i.company_id = target_company and i.customer_id = u.customer_id
                      and i.period_month = date_trunc('month', month)::date
                      and i.status not in ('draft', 'void') and i.deleted_at is null)
$$;

/**
 * Invoices › Monthly Billing: each month with drafts to send or customers not invoiced yet
 * (this month so far, and earlier), newest first.
 */
create or replace function public.billing_months(target_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  tz text;
  this_month date;
  result jsonb;
begin
  if not app.is_manager(target_company) then
    return '[]'::jsonb;
  end if;
  select timezone into tz from public.company where id = target_company;
  this_month := date_trunc('month', (now() at time zone tz)::date)::date;
  with months as (
    select distinct i.period_month as m from public.invoice i
    where i.company_id = target_company and i.status = 'draft' and i.deleted_at is null
      and i.period_month is not null
    union
    select distinct app.visit_month(j, tz) from app.unbilled_visits(target_company) j
    union
    select this_month where exists (select 1 from app.month_unbilled(target_company, this_month))
    union
    select (this_month - interval '1 month')::date
    where exists (select 1 from app.month_unbilled(target_company,
                                                   (this_month - interval '1 month')::date))
  ),
  rows as (
    select mo.m,
      (select count(*) from public.invoice i where i.company_id = target_company
         and i.period_month = mo.m and i.status = 'draft' and i.deleted_at is null) as drafts,
      (select coalesce(sum((app.invoice_totals(i.id) ->> 'total_cents')::bigint), 0)
       from public.invoice i where i.company_id = target_company
         and i.period_month = mo.m and i.status = 'draft' and i.deleted_at is null) as draft_cents,
      (select count(*) from public.invoice i where i.company_id = target_company
         and i.period_month = mo.m and i.status not in ('draft', 'void')
         and i.deleted_at is null) as sent,
      (select count(*) from app.month_unbilled(target_company, mo.m)) as not_invoiced
    from months mo
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', r.m, 'drafts', r.drafts, 'draft_total_cents', r.draft_cents,
           'sent', r.sent, 'not_invoiced', r.not_invoiced, 'current', r.m = this_month)
           order by r.m desc), '[]'::jsonb)
  into result
  from rows r where r.drafts > 0 or r.not_invoiced > 0;
  return result;
end
$$;

/**
 * A month's page: its monthly invoices (drafts to send and those sent) with each customer's
 * contact and lines, and who isn't invoiced yet (with the day they're due).
 */
create or replace function public.month_billing(target_company uuid, month date) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  m date := date_trunc('month', month)::date;
  tz text;
  today date;
  result jsonb;
begin
  if not app.is_manager(target_company) then
    raise exception 'Only owners and admins can bill the month'
      using errcode = 'insufficient_privilege';
  end if;
  select timezone into tz from public.company where id = target_company;
  today := (now() at time zone tz)::date;
  select jsonb_build_object(
    'month', m,
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'status', i.status, 'job_id', i.job_id,
        'customer_id', cu.id, 'customer', cu.name, 'email', cu.email, 'phone', cu.phone,
        'total_cents', case when i.status = 'draft'
                            then (app.invoice_totals(i.id) ->> 'total_cents')::bigint
                            else i.total_cents end,
        'amount_paid_cents', i.amount_paid_cents, 'sent_at', i.sent_at, 'due_date', i.due_date,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'description', l.description, 'quantity', l.quantity,
            'unit_price_cents', l.unit_price_cents, 'unit', l.unit, 'kind', l.kind,
            'taxable', l.taxable)
            order by l.sort_order, l.id)
          from public.invoice_line_item l
          where l.invoice_id = i.id and l.deleted_at is null), '[]'::jsonb))
        order by lower(cu.name), i.id)
      from public.invoice i join public.customer cu on cu.id = i.customer_id
      where i.company_id = target_company and i.period_month = m and i.status <> 'void'
        and i.deleted_at is null), '[]'::jsonb),
    'not_invoiced', (select count(*) from app.month_unbilled(target_company, m)),
    -- Those whose invoice day hasn't come yet, by day.
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object('date', w.bill_date, 'customers', w.n)
                       order by w.bill_date)
      from (select u.bill_date, count(*) as n from app.month_unbilled(target_company, m) u
            where u.bill_date > today group by u.bill_date) w), '[]'::jsonb)
  ) into result;
  return result;
end
$$;

revoke all on function app.visit_charge_price(), app.visit_charge_locked(),
  app.unbilled_charges(uuid, date), app.sync_charge_lines(uuid),
  app.visit_charge_changed(), app.shop_invoice_day(uuid), app.customer_invoice_day(uuid, uuid),
  app.customer_bill_date(uuid, uuid, date), app.month_unbilled(uuid, date) from public;
revoke all on function public.billing_months(uuid), public.month_billing(uuid, date)
  from public, anon;
grant execute on function public.billing_months(uuid), public.month_billing(uuid, date)
  to authenticated;
