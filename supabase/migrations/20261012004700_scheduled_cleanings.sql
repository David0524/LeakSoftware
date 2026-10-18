-- Scheduled cleanings on maintenance plans (owner, 2026-10-18: "On the maintenance package,
-- let's have a way to schedule regular salt cell and filter cleanings").
--
-- Some visit items aren't done every visit: a filter or salt cell is cleaned every few
-- months. Those checklist items are marked "on a schedule" (Settings › Checklist Components)
-- and stay off ordinary visits. A plan turns one on with how often (in months), when it's
-- next due, and an optional price. The item is put on the plan's first visit on or after the
-- due date; when that visit is finished with the item done, the next due date moves on by the
-- interval and the item goes on the visit after that. Skipped, it stays due and moves to the
-- next visit. A priced cleaning that was done is billed on the month's invoice as its own
-- line, next to the visit.

-- ---------------------------------------------------------------------------
-- Checklist items that are done on a schedule
-- ---------------------------------------------------------------------------

alter table public.component_type add column on_schedule boolean not null default false;
grant insert (on_schedule) on public.component_type to authenticated;
grant update (on_schedule) on public.component_type to authenticated;
update app.sync_table
set insert_columns = insert_columns || '{on_schedule}',
    update_columns = update_columns || '{on_schedule}'
where table_name = 'component_type';

update app.config_default
set rows = rows || $json$[
  {"key": "svc_filter_clean", "name": "Clean filter", "section": "service", "answer": "done", "job_type": "maintenance", "on_schedule": true, "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Service"], "sort_order": 545},
  {"key": "svc_salt_clean", "name": "Clean salt cell", "section": "service", "answer": "done", "job_type": "maintenance", "on_schedule": true, "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Service"], "sort_order": 565}
]$json$::jsonb
where key = 'component_type';

-- The price book's cleanings point at the new items (their price is the plan's default).
update app.config_default
set rows = (
  select jsonb_agg(case
    when r ->> 'name' in ('Filter clean, cartridge', 'Filter clean, DE (with new DE)')
      then jsonb_set(r, '{component_type_key}', '"svc_filter_clean"')
    when r ->> 'name' = 'Salt cell clean'
      then jsonb_set(r, '{component_type_key}', '"svc_salt_clean"')
    else r end order by ord)
  from jsonb_array_elements(rows) with ordinality as e(r, ord))
where key = 'price_book_item';

-- Pool shops get the two items now (only where missing; nothing else of theirs changes).
insert into public.component_type
  (company_id, key, name, section, answer, job_type, on_schedule, allows_multiple,
   default_count, applies_to, methods, sort_order)
select co.id, r.key, r.name, r.section, r.answer, r.job_type, true, r.allows_multiple,
       r.default_count, r.applies_to, r.methods, r.sort_order
from public.company co
cross join app.config_default d
cross join lateral jsonb_to_recordset(d.rows) as r(key text, name text, section text,
  answer text, job_type text, on_schedule boolean, allows_multiple boolean,
  default_count integer, applies_to text, methods text[], sort_order integer)
where d.key = 'component_type' and r.on_schedule
  and exists (select 1 from public.component_type t
              where t.company_id = co.id and t.job_type = 'maintenance' and t.deleted_at is null)
  and not exists (select 1 from public.component_type t
                  where t.company_id = co.id and t.key = r.key and t.deleted_at is null);

update public.price_book_item
set component_type_key = case when name = 'Salt cell clean' then 'svc_salt_clean'
                              else 'svc_filter_clean' end
where name in ('Filter clean, cartridge', 'Filter clean, DE (with new DE)', 'Salt cell clean')
  and component_type_key in ('svc_filter', 'svc_equipment') and deleted_at is null
  and exists (select 1 from public.component_type t
              where t.company_id = price_book_item.company_id
                and t.key = case when price_book_item.name = 'Salt cell clean' then 'svc_salt_clean'
                                 else 'svc_filter_clean' end
                and t.deleted_at is null);

-- New shops: as 20261012003700_package_defaults.sql, reading on_schedule too.
create or replace function app.seed_package_defaults(target_company uuid, pkg text) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if pkg not in ('pool', 'leak') then
    raise exception 'Unknown package %', pkg using errcode = 'invalid_parameter_value';
  end if;

  -- Checklist: inspection items for leak detection, visit items for pool care.
  insert into public.component_type
    (company_id, key, name, section, answer, job_type, on_schedule, applies_to_pool_type,
     allows_multiple, default_count, applies_to, methods, sort_order)
  select target_company, r.key, r.name, coalesce(r.section, 'visual'), coalesce(r.answer, 'leak'),
         coalesce(r.job_type, 'detection'), coalesce(r.on_schedule, false), r.pool_type,
         r.allows_multiple, r.default_count, r.applies_to, r.methods, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, section text, answer text,
         job_type text, on_schedule boolean, pool_type text, allows_multiple boolean,
         default_count integer, applies_to text, methods text[], sort_order integer)
  where d.key = 'component_type'
    and coalesce(r.job_type, 'detection') = case pkg when 'pool' then 'maintenance' else 'detection' end
    and not exists (select 1 from public.component_type t
                    where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

  if pkg = 'leak' then
    insert into public.test_type
      (company_id, key, name, field_schema, calculator, result_options, sort_order)
    select target_company, r.key, r.name, r.field_schema, r.calculator, r.result_options, r.sort_order
    from app.config_default d,
         jsonb_to_recordset(d.rows) as r(key text, name text, field_schema jsonb, calculator text,
           result_options text[], sort_order integer)
    where d.key = 'test_type'
      and not exists (select 1 from public.test_type t
                      where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

    insert into public.severity_level (company_id, key, name, color, must_mention, sort_order)
    select target_company, r.key, r.name, r.color, r.must_mention, r.sort_order
    from app.config_default d,
         jsonb_to_recordset(d.rows) as r(key text, name text, color text, must_mention boolean,
           sort_order integer)
    where d.key = 'severity_level'
      and not exists (select 1 from public.severity_level t
                      where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

    insert into public.exclusion_reason (company_id, label, sort_order)
    select target_company, r.label, r.sort_order
    from app.config_default d, jsonb_to_recordset(d.rows) as r(label text, sort_order integer)
    where d.key = 'exclusion_reason'
      and not exists (select 1 from public.exclusion_reason t
                      where t.company_id = target_company and t.label = r.label and t.deleted_at is null);
  end if;

  insert into public.price_book_item
    (company_id, name, category, component_type_key, unit, price_cents, taxable, warranty_months,
     sort_order)
  select target_company, r.name, r.category, r.component_type_key, r.unit, r.price_cents,
         r.taxable, r.warranty_months, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(package text, name text, category text,
         component_type_key text, unit text, price_cents integer, taxable boolean,
         warranty_months integer, sort_order integer)
  where d.key = 'price_book_item' and coalesce(r.package, 'leak') = pkg
    and not exists (select 1 from public.price_book_item t
                    where t.company_id = target_company and t.name = r.name and t.deleted_at is null);
end
$$;

-- ---------------------------------------------------------------------------
-- A plan's cleanings
-- ---------------------------------------------------------------------------

create table public.plan_cleaning (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  service_plan_id uuid not null,
  component_type_id uuid not null,
  every_months smallint not null check (every_months between 1 and 12),
  -- The first visit on or after this date gets the item.
  next_due date not null,
  -- The plan date of the visit it was last done on.
  last_done_on date,
  -- Billed per cleaning done; none: included in the visit price.
  price_cents integer check (price_cents >= 0),
  foreign key (service_plan_id, company_id) references public.service_plan (id, company_id),
  foreign key (component_type_id, company_id) references public.component_type (id, company_id)
);
select app.make_synced('public.plan_cleaning');
create unique index plan_cleaning_once on public.plan_cleaning (service_plan_id, component_type_id)
  where deleted_at is null;

-- Which cleaning put an item on a visit, and what it bills once done (both server-set).
alter table public.job_component
  add column plan_cleaning_id uuid,
  add column price_cents integer check (price_cents >= 0),
  add foreign key (plan_cleaning_id, company_id) references public.plan_cleaning (id, company_id);
create index job_component_plan_cleaning_idx on public.job_component (plan_cleaning_id)
  where plan_cleaning_id is not null;

-- Access: like the plan itself. Everyone reads (a limited tech only their own plans'),
-- owners write; offices only, phones see the item on the visit.
insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('plan_cleaning', 'member', 'owner',
  '{service_plan_id,component_type_id,every_months,next_due,price_cents}',
  '{every_months,next_due,price_cents,deleted_at}', false, 306);

grant select on public.plan_cleaning to authenticated;
create policy plan_cleaning_select on public.plan_cleaning for select to authenticated
  using (app.is_member(company_id));
grant insert (id, company_id, service_plan_id, component_type_id, every_months, next_due,
  price_cents) on public.plan_cleaning to authenticated;
create policy plan_cleaning_insert on public.plan_cleaning for insert to authenticated
  with check (app.is_owner(company_id));
grant update (every_months, next_due, price_cents, deleted_at) on public.plan_cleaning
  to authenticated;
create policy plan_cleaning_update on public.plan_cleaning for update to authenticated
  using (app.is_owner(company_id)) with check (app.is_owner(company_id));
create policy plan_cleaning_plan_visible on public.plan_cleaning as restrictive for all
  to authenticated
  using (exists (select 1 from public.service_plan p where p.id = service_plan_id))
  with check (exists (select 1 from public.service_plan p where p.id = service_plan_id));

create trigger guard_writable before insert or update or delete on public.plan_cleaning
  for each row execute function app.guard_writable();

select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- Putting cleanings on visits
-- ---------------------------------------------------------------------------

-- Each live cleaning of a plan sits on one visit that hasn't started: the first on or after
-- its due date (a visit up to six days late still counts). It is taken off any other visit
-- that hasn't started. A visit in progress keeps what it has, and while it does, the
-- cleaning isn't put anywhere else.
create or replace function app.place_cleanings(target_plan uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c public.plan_cleaning;
  tz text;
  today date;
  target uuid;
  jc uuid;
begin
  select co.timezone into tz
  from public.service_plan p join public.company co on co.id = p.company_id
  where p.id = target_plan;
  if tz is null then
    return;
  end if;
  today := (now() at time zone tz)::date;

  for c in select * from public.plan_cleaning where service_plan_id = target_plan loop
    target := null;
    if c.deleted_at is null and not exists (
      select 1 from public.job_component x join public.job j on j.id = x.job_id
      where x.plan_cleaning_id = c.id and x.deleted_at is null and j.deleted_at is null
        and j.status = 'in_progress') then
      select j.id into target from public.job j
      where j.service_plan_id = target_plan and j.deleted_at is null and j.status = 'scheduled'
        and j.plan_date >= greatest(c.next_due, today - 6)
      order by j.plan_date
      limit 1;
    end if;

    with gone as (
      update public.job_component x set deleted_at = now()
      from public.job j
      where x.plan_cleaning_id = c.id and x.deleted_at is null and j.id = x.job_id
        and j.status = 'scheduled' and x.job_id is distinct from target
      returning x.id)
    update public.checklist_item_result r set deleted_at = now()
    where r.job_component_id in (select id from gone) and r.deleted_at is null;

    if target is not null and not exists (
      select 1 from public.job_component x
      where x.job_id = target and x.plan_cleaning_id = c.id and x.deleted_at is null) then
      insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                        label, sort_order, plan_cleaning_id)
      select c.company_id, target, ty.id, 1, ty.name, ty.sort_order * 100 + 1, c.id
      from public.component_type ty where ty.id = c.component_type_id
      returning id into jc;
      insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
      values (c.company_id, target, jc, 'pending');
    end if;
  end loop;
end
$$;

create or replace function app.plan_cleaning_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.place_cleanings(new.service_plan_id);
  return null;
end
$$;

create trigger plan_cleaning_changed after insert or update on public.plan_cleaning
  for each row execute function app.plan_cleaning_changed();

-- A finished visit: each cleaning done on it is due again after its interval and carries its
-- price for the bill; one skipped stays due. Then the cleanings go on their next visits.
create or replace function app.visit_cleanings_done() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  tz text;
  visit_day date;
begin
  select timezone into tz from public.company where id = new.company_id;
  visit_day := coalesce(new.plan_date, (coalesce(new.completed_at, now()) at time zone tz)::date);

  update public.job_component x
  set price_cents = case when r.status = 'inspected' then pc.price_cents end
  from public.plan_cleaning pc, public.checklist_item_result r
  where x.job_id = new.id and x.deleted_at is null and pc.id = x.plan_cleaning_id
    and r.job_component_id = x.id and r.deleted_at is null
    and x.price_cents is distinct from case when r.status = 'inspected' then pc.price_cents end;

  update public.plan_cleaning pc
  set last_done_on = visit_day,
      next_due = (visit_day + make_interval(months => pc.every_months))::date
  from public.job_component x, public.checklist_item_result r
  where x.job_id = new.id and x.deleted_at is null and x.plan_cleaning_id = pc.id
    and r.job_component_id = x.id and r.deleted_at is null and r.status = 'inspected'
    and pc.deleted_at is null and pc.last_done_on is distinct from visit_day;

  perform app.place_cleanings(new.service_plan_id);
  return null;
end
$$;

create trigger visit_cleanings_done after update of status on public.job
  for each row
  when (new.status = 'done' and old.status is distinct from 'done'
        and new.service_plan_id is not null)
  execute function app.visit_cleanings_done();

-- Visits are made as before (20261012002400_maintenance.sql), but items on a schedule stay
-- off them; the plan's cleanings are placed after.
create or replace function app.plan_visits(target_plan uuid, reset boolean) returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  p public.service_plan;
  tz text;
  s jsonb;
  today date;
  through date;
  d date;
  step integer;
  starts time;
  last_end timestamptz;
  start_at timestamptz;
  spa boolean;
  ptype text;
  j uuid;
  made integer := 0;
begin
  select * into p from public.service_plan where id = target_plan;
  if p.id is null then
    return 0;
  end if;
  select co.timezone, co.settings into tz, s from public.company co where co.id = p.company_id;
  today := (now() at time zone tz)::date;
  through := today + 7 * greatest(1, least(12,
    coalesce((s #>> '{maintenance,weeks_ahead}')::integer, 4)));
  if reset then
    update public.job set deleted_at = now()
    where service_plan_id = p.id and deleted_at is null and status = 'scheduled'
      and plan_date >= today;
  end if;
  if p.deleted_at is not null or p.paused then
    perform app.place_cleanings(p.id);
    return 0;
  end if;

  select has_spa, pool_type into spa, ptype from public.property where id = p.property_id;
  step := 7 * p.interval_weeks;
  d := p.starts_on;
  if d < today then
    d := d + step * ceil((today - d)::numeric / step)::integer;
  end if;
  while d <= through and (p.ends_on is null or d <= p.ends_on) loop
    if not exists (select 1 from public.job
                   where service_plan_id = p.id and plan_date = d and deleted_at is null) then
      if p.visit_time is not null then
        start_at := (d + p.visit_time) at time zone tz;
      else
        -- After the tech's last job that day (15 minutes to get there), or first thing.
        starts := coalesce((s #>> '{routing,day_start}')::time, time '08:00');
        select max(j2.scheduled_end) into last_end from public.job j2
        where j2.company_id = p.company_id and j2.deleted_at is null and j2.status <> 'canceled'
          and p.assigned_user_id is not null and j2.assigned_user_id = p.assigned_user_id
          and (j2.scheduled_start at time zone tz)::date = d;
        start_at := greatest(coalesce(last_end + interval '15 minutes', (d + starts) at time zone tz),
                             (d + starts) at time zone tz);
      end if;
      insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                              assigned_user_id, scheduled_start, scheduled_end, fee_cents,
                              arrival_fixed, service_plan_id, plan_date, summary_notes)
      values (p.company_id, 'maintenance', p.property_id, p.customer_id, 'scheduled',
              p.assigned_user_id, start_at,
              start_at + make_interval(mins => p.duration_minutes), p.price_cents,
              p.visit_time is not null, p.id, d, p.notes)
      returning id into j;
      insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                        label, sort_order)
      select p.company_id, j, ty.id, 1, ty.name, ty.sort_order * 100 + 1
      from public.component_type ty
      where ty.company_id = p.company_id and ty.job_type = 'maintenance' and ty.active
        and not ty.on_schedule and ty.deleted_at is null
        and (ty.applies_to <> 'spa' or spa)
        and (ty.applies_to_pool_type is null or ty.applies_to_pool_type = ptype);
      insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
      select p.company_id, j, jc.id, 'pending' from public.job_component jc where jc.job_id = j;
      made := made + 1;
    end if;
    d := d + step;
  end loop;
  perform app.place_cleanings(p.id);
  return made;
end
$$;

revoke all on function app.place_cleanings(uuid), app.plan_cleaning_changed(),
  app.visit_cleanings_done(), app.plan_visits(uuid, boolean) from public;

-- ---------------------------------------------------------------------------
-- Billing: a visit is billable for its price, its cleanings' prices, or both
-- ---------------------------------------------------------------------------

create or replace function app.visit_cleaning_cents(target_job uuid) returns integer
language sql stable set search_path = public, app, pg_temp as $$
  select coalesce(sum(price_cents), 0)::integer from public.job_component
  where job_id = target_job and plan_cleaning_id is not null and deleted_at is null
    and price_cents > 0
$$;

create or replace function app.unbilled_visits(target_company uuid, month date default null)
returns setof public.job
language sql stable set search_path = public, app, pg_temp as $$
  select j.* from public.job j join public.company c on c.id = j.company_id
  where j.company_id = target_company and j.type = 'maintenance' and j.deleted_at is null
    and j.status in ('done', 'invoiced') and j.billed_invoice_id is null
    and coalesce(j.fee_cents, 0) + app.visit_cleaning_cents(j.id) > 0
    and j.bill_to_customer_id is not null
    and (month is null or app.visit_month(j, c.timezone) = date_trunc('month', month)::date)
    and not exists (select 1 from public.invoice i where i.job_id = j.id and i.period_month is null
                    and i.status <> 'void' and i.deleted_at is null)
$$;

-- As 20261012002900_monthly_invoices.sql, with a line per priced cleaning done after its
-- visit's line ("Clean filter, Oct 3").
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
    select target_company, inv.id, l.label || ', ' || to_char(l.day, 'Mon FMDD'), l.cents, false,
           next_sort + row_number() over (order by l.day, l.started, l.job_id, l.line_order)
    from (
      select coalesce(j.plan_date,
               (coalesce(j.scheduled_start, j.completed_at, j.created_at) at time zone tz)::date) as day,
             j.scheduled_start as started, j.id as job_id, 'Pool service' as label,
             j.fee_cents as cents, 0 as line_order
      from app.unbilled_visits(target_company, m) j
      where j.bill_to_customer_id = cust.customer_id and coalesce(j.fee_cents, 0) > 0
      union all
      select coalesce(j.plan_date,
               (coalesce(j.scheduled_start, j.completed_at, j.created_at) at time zone tz)::date),
             j.scheduled_start, j.id, x.label, x.price_cents, x.sort_order
      from app.unbilled_visits(target_company, m) j
      join public.job_component x on x.job_id = j.id and x.plan_cleaning_id is not null
        and x.deleted_at is null and x.price_cents > 0
      where j.bill_to_customer_id = cust.customer_id
    ) l;

    update public.job set billed_invoice_id = inv.id
    where id in (select j.id from app.unbilled_visits(target_company, m) j
                 where j.bill_to_customer_id = cust.customer_id);
    touched := touched + 1;
  end loop;
  return touched;
end
$$;

create or replace function public.unbilled_maintenance(target_company uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when not app.is_owner(target_company) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('month', m, 'visits', visits, 'customers', customers,
                                        'total_cents', total) order by m)
    from (
      select app.visit_month(j, c.timezone) as m, count(*) as visits,
             count(distinct j.bill_to_customer_id) as customers,
             sum(coalesce(j.fee_cents, 0) + app.visit_cleaning_cents(j.id)) as total
      from app.unbilled_visits(target_company) j join public.company c on c.id = j.company_id
      group by 1
    ) x), '[]'::jsonb) end
$$;

revoke all on function app.visit_cleaning_cents(uuid), app.unbilled_visits(uuid, date),
  app.bill_maintenance_month(uuid, date) from public;
revoke all on function public.unbilled_maintenance(uuid) from public, anon;
grant execute on function public.unbilled_maintenance(uuid) to authenticated;
