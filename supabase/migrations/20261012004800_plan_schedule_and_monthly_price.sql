-- Maintenance plans: how often, and a monthly price (owner, 2026-10-18: "For maintenance
-- accounts, change 'Price per visit ($)' to per month"; "Make the options multiple times per
-- week (then a day selector), weekly, every two weeks, monthly").
--
-- A plan now repeats one of four ways:
--   several times a week: on each of its weekdays, every week (weekdays);
--   weekly or every 2 weeks: on the first visit's weekday (interval_weeks 1 or 2);
--   monthly: once a month on the same weekday as the first visit, in the same week of the
--   month ("the 2nd Tuesday"; the 4th at most) (monthly).
-- Plans that repeated every 3 or 4 weeks become monthly.
--
-- The plan's price is per month. Its visits carry no price of their own; the month's invoice
-- gets one "Pool service, October" line per priced plan with a visit done that month, once.
-- Single maintenance visits (Just Once) keep their own price, and priced cleanings
-- (20261012004700_scheduled_cleanings.sql) are still billed each time.

-- ---------------------------------------------------------------------------
-- How often
-- ---------------------------------------------------------------------------

alter table public.service_plan
  -- Several times a week: the days of the week, 0 Sunday to 6 Saturday.
  add column weekdays smallint[]
    check (weekdays is null or (cardinality(weekdays) between 1 and 7
                                and weekdays <@ '{0,1,2,3,4,5,6}'::smallint[])),
  add column monthly boolean not null default false;

-- One shape per plan: weekdays and monthly repeat every week or month, so interval_weeks is 1;
-- every 3 or 4 weeks (older plans, imports saying "monthly") becomes monthly.
create or replace function app.plan_shape() returns trigger
language plpgsql as $$
begin
  if new.weekdays is not null then
    new.weekdays := (select array_agg(distinct d order by d) from unnest(new.weekdays) d);
    if cardinality(new.weekdays) = 0 then
      new.weekdays := null;
    end if;
  end if;
  if new.interval_weeks > 2 then
    new.monthly := true;
  end if;
  if new.weekdays is not null or new.monthly then
    new.interval_weeks := 1;
  end if;
  if new.weekdays is not null then
    new.monthly := false;
  end if;
  return new;
end
$$;

create trigger plan_shape before insert or update on public.service_plan
  for each row execute function app.plan_shape();

grant insert (weekdays, monthly) on public.service_plan to authenticated;
grant update (weekdays, monthly) on public.service_plan to authenticated;
update app.sync_table
set insert_columns = insert_columns || '{weekdays,monthly}',
    update_columns = update_columns || '{weekdays,monthly}'
where table_name = 'service_plan';

-- The week of the month a date falls in, 1 to 5.
create or replace function app.week_of_month(d date) returns integer
language sql immutable as $$
  select ((extract(day from d)::integer - 1) / 7) + 1
$$;

-- A plan's visit dates from one day through another (mirrored in packages/core
-- upcomingVisitDates).
create or replace function app.plan_dates(p public.service_plan, from_day date, through date)
returns setof date
language sql stable as $$
  select d::date
  from generate_series(greatest(p.starts_on, from_day),
                       least(through, coalesce(p.ends_on, through)), interval '1 day') d
  where case
    when p.weekdays is not null then extract(dow from d)::smallint = any (p.weekdays)
    when p.monthly then extract(dow from d) = extract(dow from p.starts_on)
      and app.week_of_month(d::date) = least(4, app.week_of_month(p.starts_on))
    else (d::date - p.starts_on) % (7 * p.interval_weeks) = 0
  end
$$;

-- Visits as before (20261012004700_scheduled_cleanings.sql), on the plan's dates, and with no
-- price of their own: the plan bills by the month.
create or replace function app.plan_visits(target_plan uuid, reset boolean) returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  p public.service_plan;
  tz text;
  s jsonb;
  today date;
  through date;
  d date;
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
  for d in select * from app.plan_dates(p, today, through) loop
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
              start_at + make_interval(mins => p.duration_minutes), null,
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
  end loop;
  perform app.place_cleanings(p.id);
  return made;
end
$$;

revoke all on function app.plan_shape(), app.plan_dates(public.service_plan, date, date),
  app.plan_visits(uuid, boolean) from public;

-- New Job's plan for a new customer (20261012002500_new_maintenance_job.sql), with the days
-- of the week and monthly.
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
  if not app.is_owner(target_company) then
    raise exception 'Only owners can start maintenance plans' using errcode = 'insufficient_privilege';
  end if;
  select * into cp from app.customer_and_pool(target_company, new_customer, existing_customer,
                                              new_property, existing_property);
  insert into public.service_plan (company_id, customer_id, property_id, assigned_user_id,
                                   starts_on, interval_weeks, weekdays, monthly, visit_time,
                                   duration_minutes, price_cents, ends_on, notes)
  values (target_company, cp.cust, cp.prop, (plan ->> 'assigned_user_id')::uuid,
          (plan ->> 'starts_on')::date, coalesce((plan ->> 'interval_weeks')::smallint, 1),
          case when jsonb_typeof(plan -> 'weekdays') = 'array'
               then array(select jsonb_array_elements_text(plan -> 'weekdays')::smallint) end,
          coalesce((plan ->> 'monthly')::boolean, false),
          (plan ->> 'visit_time')::time, coalesce((plan ->> 'duration_minutes')::integer, 30),
          (plan ->> 'price_cents')::integer, (plan ->> 'ends_on')::date, plan ->> 'notes')
  returning id into new_plan;
  return jsonb_build_object('plan', new_plan, 'customer', cp.cust, 'property', cp.prop);
end
$$;

-- ---------------------------------------------------------------------------
-- Billing by the month
-- ---------------------------------------------------------------------------

-- Which plan a monthly invoice line bills (server-set).
alter table public.invoice_line_item
  add column service_plan_id uuid,
  add foreign key (service_plan_id, company_id) references public.service_plan (id, company_id);
create index invoice_line_item_plan_idx on public.invoice_line_item (service_plan_id)
  where service_plan_id is not null;

-- Has this plan's month been billed on a live invoice?
create or replace function app.plan_month_billed(target_plan uuid, month date) returns boolean
language sql stable set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from public.invoice_line_item l join public.invoice i on i.id = l.invoice_id
    where l.service_plan_id = target_plan and l.deleted_at is null
      and i.period_month = date_trunc('month', month)::date
      and i.status <> 'void' and i.deleted_at is null)
$$;

-- What a plan's month costs while it isn't billed yet: its price, else 0.
create or replace function app.plan_month_cents(target_plan uuid, month date) returns integer
language sql stable set search_path = public, app, pg_temp as $$
  select case when coalesce(sp.price_cents, 0) > 0
                   and not app.plan_month_billed(sp.id, month)
              then sp.price_cents else 0 end
  from public.service_plan sp where sp.id = target_plan
$$;

-- Visits waiting to be billed: as before, and a plan visit counts while its plan's month is
-- still to bill.
create or replace function app.unbilled_visits(target_company uuid, month date default null)
returns setof public.job
language sql stable set search_path = public, app, pg_temp as $$
  select j.* from public.job j join public.company c on c.id = j.company_id
  where j.company_id = target_company and j.type = 'maintenance' and j.deleted_at is null
    and j.status in ('done', 'invoiced') and j.billed_invoice_id is null
    and (coalesce(j.fee_cents, 0) + app.visit_cleaning_cents(j.id) > 0
         or (j.service_plan_id is not null
             and app.plan_month_cents(j.service_plan_id, app.visit_month(j, c.timezone)) > 0))
    and j.bill_to_customer_id is not null
    and (month is null or app.visit_month(j, c.timezone) = date_trunc('month', month)::date)
    and not exists (select 1 from public.invoice i where i.job_id = j.id and i.period_month is null
                    and i.status <> 'void' and i.deleted_at is null)
$$;

-- As 20261012004700_scheduled_cleanings.sql, with one line per priced plan for the month
-- ("Pool service, October", with the pool's street when the customer has more than one).
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
  visits uuid[];
begin
  select timezone into tz from public.company where id = target_company;
  for cust in
    select bill_to_customer_id as customer_id from app.unbilled_visits(target_company, m)
    group by bill_to_customer_id
  loop
    -- Taken first: once the month's plan line is on, its visits no longer count as unbilled.
    visits := array(select j.id from app.unbilled_visits(target_company, m) j
                    where j.bill_to_customer_id = cust.customer_id);
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
      from public.job j where j.id = any (visits)
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
    touched := touched + 1;
  end loop;
  return touched;
end
$$;

-- What's waiting to be billed, per month: [{month, visits, customers, total_cents}].
create or replace function public.unbilled_maintenance(target_company uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  with v as (
    select app.visit_month(j, c.timezone) as m, j.id, j.bill_to_customer_id, j.service_plan_id,
           coalesce(j.fee_cents, 0) + app.visit_cleaning_cents(j.id) as cents
    from app.unbilled_visits(target_company) j join public.company c on c.id = j.company_id
  ),
  plans as (
    select m, sum(app.plan_month_cents(service_plan_id, m)) as cents
    from (select distinct m, service_plan_id from v where service_plan_id is not null) x
    group by m
  ),
  months as (
    select v.m, count(*) as visits, count(distinct v.bill_to_customer_id) as customers,
           sum(v.cents) + coalesce(max(p.cents), 0) as total
    from v left join plans p on p.m = v.m
    group by v.m
  )
  select case when not app.is_owner(target_company) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('month', m, 'visits', visits, 'customers', customers,
                                        'total_cents', total) order by m)
    from months), '[]'::jsonb) end
$$;

revoke all on function app.plan_month_billed(uuid, date), app.plan_month_cents(uuid, date),
  app.unbilled_visits(uuid, date), app.bill_maintenance_month(uuid, date) from public;
revoke all on function public.unbilled_maintenance(uuid) from public, anon;
grant execute on function public.unbilled_maintenance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Plans already made
-- ---------------------------------------------------------------------------

-- Visits not yet billed lose their per-visit price (the plan bills the month), then plans
-- every 3 or 4 weeks become monthly (plan_shape; their upcoming visits are remade).
update public.job set fee_cents = null
where service_plan_id is not null and billed_invoice_id is null and fee_cents is not null
  and status in ('scheduled', 'in_progress', 'done');
update public.service_plan set interval_weeks = interval_weeks where interval_weeks > 2;
