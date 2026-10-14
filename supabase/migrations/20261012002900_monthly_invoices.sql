-- Monthly maintenance invoices (owner, 2026-10-13: "Billing is monthly": one invoice per
-- customer per month for the visits done).
--
-- Each finished maintenance visit with a price is billed once. On the 1st of a month (and
-- whenever an owner asks), every customer with unbilled visits in a month gets one draft
-- invoice for that month with a line per visit; owners review and send drafts as usual.
-- The invoice is attached to the month's last visit, so sending, the customer page, card and
-- bank payment, receipts, and who-sees-what work exactly as for any invoice. The other visits
-- point at it (job.billed_invoice_id) and follow its status: sent makes them invoiced, paid
-- makes them paid, void frees them to be billed again.

alter table public.invoice
  -- First day of the month billed; null for an ordinary job invoice.
  add column period_month date check (period_month is null or extract(day from period_month) = 1),
  add column customer_id uuid,
  add foreign key (customer_id, company_id) references public.customer (id, company_id);
create unique index invoice_one_per_customer_month on public.invoice (customer_id, period_month)
  where period_month is not null and status <> 'void' and deleted_at is null;

-- Server-owned: not in the sync registry's writable columns.
alter table public.job
  add column billed_invoice_id uuid,
  add foreign key (billed_invoice_id, company_id) references public.invoice (id, company_id);
create index job_billed_invoice_idx on public.job (billed_invoice_id) where billed_invoice_id is not null;

-- A visit's month: its plan date, or the day it was scheduled, in the shop's time zone.
create or replace function app.visit_month(j public.job, tz text) returns date
language sql stable as $$
  select date_trunc('month', coalesce(j.plan_date,
           (coalesce(j.scheduled_start, j.completed_at, j.created_at) at time zone tz)::date))::date
$$;

-- Visits waiting to be billed: finished maintenance visits with a price and someone to bill,
-- on no live invoice (a voided one frees them again), in the given month or any month. A
-- monthly invoice sits on one of its visits, so only invoices of their own count here.
create or replace function app.unbilled_visits(target_company uuid, month date default null)
returns setof public.job
language sql stable set search_path = public, app, pg_temp as $$
  select j.* from public.job j join public.company c on c.id = j.company_id
  where j.company_id = target_company and j.type = 'maintenance' and j.deleted_at is null
    and j.status in ('done', 'invoiced') and j.billed_invoice_id is null
    and coalesce(j.fee_cents, 0) > 0 and j.bill_to_customer_id is not null
    and (month is null or app.visit_month(j, c.timezone) = date_trunc('month', month)::date)
    and not exists (select 1 from public.invoice i where i.job_id = j.id and i.period_month is null
                    and i.status <> 'void' and i.deleted_at is null)
$$;

-- ---------------------------------------------------------------------------
-- Billing a month
-- ---------------------------------------------------------------------------

/**
 * Bills one month for a shop: its unbilled visits in that month, grouped by customer. Adds to
 * the customer's draft for the month if there is one, makes a draft otherwise, and leaves
 * visits alone when that month's invoice was already sent (the office can bill those by
 * hand). Returns how many invoices it made or added to.
 */
create or replace function app.bill_maintenance_month(target_company uuid, month date)
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
begin
  select timezone into tz from public.company where id = target_company;
  for cust in
    select bill_to_customer_id as customer_id from app.unbilled_visits(target_company, m)
    group by bill_to_customer_id
  loop
    inv := null;
    select * into inv from public.invoice
    where company_id = target_company and customer_id = cust.customer_id and period_month = m
      and status <> 'void' and deleted_at is null;
    if inv.id is not null and inv.status <> 'draft' then
      continue;
    end if;

    -- The month's last visit carries the invoice.
    select v.id into anchor from (
      select j.id, j.scheduled_start, j.completed_at, j.plan_date
      from app.unbilled_visits(target_company, m) j where j.bill_to_customer_id = cust.customer_id
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
    insert into public.invoice_line_item (company_id, invoice_id, description, unit_price_cents,
                                          taxable, sort_order)
    select target_company, inv.id,
           'Pool service, ' || to_char(coalesce(j.plan_date,
             (coalesce(j.scheduled_start, j.completed_at, j.created_at) at time zone tz)::date),
             'Mon FMDD'),
           j.fee_cents, false,
           next_sort + row_number() over (order by j.plan_date, j.scheduled_start, j.id)
    from app.unbilled_visits(target_company, m) j
    where j.bill_to_customer_id = cust.customer_id;

    update public.job set billed_invoice_id = inv.id
    where id in (select j.id from app.unbilled_visits(target_company, m) j
                 where j.bill_to_customer_id = cust.customer_id);
    touched := touched + 1;
  end loop;
  return touched;
end
$$;

-- Owners: bill a month now (the Invoices page). Returns how many invoices were made or added to.
create or replace function public.create_monthly_invoices(target_company uuid, month date)
returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_owner(target_company) then
    raise exception 'Only owners can bill maintenance' using errcode = 'insufficient_privilege';
  end if;
  return app.bill_maintenance_month(target_company, month);
end
$$;

-- What's waiting to be billed, per month: [{month, visits, customers, total_cents}].
create or replace function public.unbilled_maintenance(target_company uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when not app.is_owner(target_company) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('month', m, 'visits', visits, 'customers', customers,
                                        'total_cents', total) order by m)
    from (
      select app.visit_month(j, c.timezone) as m, count(*) as visits,
             count(distinct j.bill_to_customer_id) as customers, sum(j.fee_cents) as total
      from app.unbilled_visits(target_company) j join public.company c on c.id = j.company_id
      group by 1
    ) x), '[]'::jsonb) end
$$;

-- The daily run (service role): on and after the 1st, bill last month for every shop. Safe
-- to run every day; visits finished late join the month's draft.
create or replace function public.bill_maintenance_due(at timestamptz default now())
returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c record;
  total integer := 0;
begin
  for c in select id, timezone from public.company loop
    total := total + app.bill_maintenance_month(
      c.id, (date_trunc('month', (at at time zone c.timezone)::date) - interval '1 month')::date);
  end loop;
  return total;
end
$$;

revoke all on function app.visit_month(public.job, text), app.unbilled_visits(uuid, date),
  app.bill_maintenance_month(uuid, date) from public;
revoke all on function public.create_monthly_invoices(uuid, date), public.unbilled_maintenance(uuid),
  public.bill_maintenance_due(timestamptz) from public, anon, authenticated;
grant execute on function public.create_monthly_invoices(uuid, date), public.unbilled_maintenance(uuid)
  to authenticated;
grant execute on function public.bill_maintenance_due(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- The visits follow their monthly invoice
-- ---------------------------------------------------------------------------

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
  end if;
  return null;
end
$$;

create trigger monthly_invoice_status after update of status on public.invoice
  for each row execute function app.monthly_invoice_status();

-- A visit on a monthly invoice can't also get an invoice of its own.
create or replace function app.visit_billed_monthly() returns trigger
language plpgsql set search_path = public, app, pg_temp as $$
begin
  if new.period_month is null
     and exists (select 1 from public.job where id = new.job_id and billed_invoice_id is not null) then
    raise exception 'This visit is on its monthly invoice' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger visit_billed_monthly before insert on public.invoice
  for each row execute function app.visit_billed_monthly();
