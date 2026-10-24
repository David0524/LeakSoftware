-- Added chemicals, and charging for them (owner, 2026-10-24: "we'll have the actual reading, the
-- aim for, the suggested chemicals to add, and what was actually added ... some pool companies
-- charge for chemicals, so that should be automatically invoiced in the monthly portion";
-- docs/design/2026-10-24-chemicals-added.md, approved with its recommendations).
--
--   * chemical_addition: one row per chemical a tech adds on a visit (a suggestion that wasn't
--     added is worked out on the device, never a row). Rows, not a list on the reading, so two
--     phones adding at once both keep theirs under last-writer-wins sync (as job_repair).
--     The price is the server's: copied from the price book when the row arrives.
--   * price_book_item.chemical: which calculator chemical an item is, so a suggestion finds its
--     price. The pool price book gains tabs, shock, baking soda and the rest (first drafts).
--   * chemical_reading.goals: the Aim For levels used. On a visit the reading is one row, its id
--     the visit's id, updated as the tech types (no Submit on visits).
--   * company.settings.charge_chemicals (off by default) and charge_chemicals_from (the month it
--     was switched on): when on, each month's additions become one invoice line per chemical on
--     the customer's monthly invoice.
--   * The visit report's snapshot keeps the additions, the Aim For levels, and whether the shop
--     charged, so a sent report never changes.

-- ---------------------------------------------------------------------------
-- The price book knows its chemicals
-- ---------------------------------------------------------------------------

alter table public.price_book_item add column chemical text
  check (chemical is null or chemical ~ '^[a-z][a-z_]{0,39}$');

-- Access: as the registry generates it (20261012000600_access.sql).
update app.sync_table
set insert_columns = insert_columns || '{chemical}',
    update_columns = update_columns || '{chemical}'
where table_name = 'price_book_item';
grant insert (chemical), update (chemical) on public.price_book_item to authenticated;

-- The pool price book's chemicals (new shops): the five drafted 2026-10-16 get their key; nine
-- more join them. Prices are first drafts every shop edits (owner approved, 2026-10-24).
update app.config_default
set rows = (
  select jsonb_agg(
    case r ->> 'name'
      when 'Liquid chlorine' then r || '{"chemical": "liquid_chlorine"}'
      when 'Muriatic acid' then r || '{"chemical": "muriatic_acid"}'
      when 'Stabilizer (CYA)' then r || '{"chemical": "stabilizer"}'
      when 'Salt, 40 lb bag' then r || '{"chemical": "salt"}'
      when 'Phosphate remover' then r || '{"chemical": "phosphate_remover"}'
      else r end
    order by ord)
  from jsonb_array_elements(rows) with ordinality as t(r, ord)
)
where key = 'price_book_item';

update app.config_default
set rows = rows || $json$[
  {"package": "pool", "name": "Chlorine tabs (3″)", "category": "Chemicals", "component_type_key": "svc_water", "unit": "tab", "price_cents": 250, "taxable": true, "warranty_months": null, "sort_order": 122, "chemical": "tabs"},
  {"package": "pool", "name": "Shock (cal-hypo)", "category": "Chemicals", "component_type_key": "svc_water", "unit": "lb", "price_cents": 600, "taxable": true, "warranty_months": null, "sort_order": 124, "chemical": "cal_hypo"},
  {"package": "pool", "name": "Dry acid", "category": "Chemicals", "component_type_key": "svc_water", "unit": "lb", "price_cents": 500, "taxable": true, "warranty_months": null, "sort_order": 126, "chemical": "dry_acid"},
  {"package": "pool", "name": "Baking soda", "category": "Chemicals", "component_type_key": "svc_water", "unit": "lb", "price_cents": 300, "taxable": true, "warranty_months": null, "sort_order": 142, "chemical": "baking_soda"},
  {"package": "pool", "name": "Soda ash", "category": "Chemicals", "component_type_key": "svc_water", "unit": "lb", "price_cents": 400, "taxable": true, "warranty_months": null, "sort_order": 144, "chemical": "soda_ash"},
  {"package": "pool", "name": "Calcium chloride", "category": "Chemicals", "component_type_key": "svc_water", "unit": "lb", "price_cents": 400, "taxable": true, "warranty_months": null, "sort_order": 146, "chemical": "calcium_chloride"},
  {"package": "pool", "name": "Algaecide", "category": "Chemicals", "component_type_key": "svc_water", "unit": "qt", "price_cents": 1500, "taxable": true, "warranty_months": null, "sort_order": 152, "chemical": "algaecide"},
  {"package": "pool", "name": "Clarifier", "category": "Chemicals", "component_type_key": "svc_water", "unit": "qt", "price_cents": 1500, "taxable": true, "warranty_months": null, "sort_order": 154, "chemical": "clarifier"},
  {"package": "pool", "name": "Enzyme", "category": "Chemicals", "component_type_key": "svc_water", "unit": "qt", "price_cents": 1800, "taxable": true, "warranty_months": null, "sort_order": 156, "chemical": "enzyme"}
]$json$::jsonb
where key = 'price_book_item';

/**
 * A shop's chemicals from the defaults: the missing ones added (by name, never touching a shop's
 * edits), and the defaults' chemical key set on items of the same name that have none.
 */
create or replace function app.add_chemical_defaults(target_company uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  insert into public.price_book_item
    (company_id, name, category, component_type_key, unit, price_cents, taxable, warranty_months,
     sort_order, chemical)
  select target_company, r.name, r.category, r.component_type_key, r.unit, r.price_cents,
         r.taxable, r.warranty_months, r.sort_order, r.chemical
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(package text, name text, category text,
         component_type_key text, unit text, price_cents integer, taxable boolean,
         warranty_months integer, sort_order integer, chemical text)
  where d.key = 'price_book_item' and r.package = 'pool' and r.chemical is not null
    and not exists (select 1 from public.price_book_item t
                    where t.company_id = target_company and t.name = r.name and t.deleted_at is null);

  update public.price_book_item t set chemical = r.chemical
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(package text, name text, chemical text)
  where d.key = 'price_book_item' and r.package = 'pool' and r.chemical is not null
    and t.company_id = target_company and t.name = r.name and t.chemical is null;
end
$$;

-- New shops and shops turning pool care on: the package's defaults, then the chemicals' keys.
alter function app.seed_package_defaults(uuid, text) rename to seed_package_defaults_before_chemicals;
create or replace function app.seed_package_defaults(target_company uuid, pkg text) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.seed_package_defaults_before_chemicals(target_company, pkg);
  if pkg = 'pool' then
    perform app.add_chemical_defaults(target_company);
  end if;
end
$$;
revoke all on function app.add_chemical_defaults(uuid), app.seed_package_defaults(uuid, text),
  app.seed_package_defaults_before_chemicals(uuid, text) from public;

-- Shops already doing pool care (their price book has the pool chemicals).
select app.add_chemical_defaults(c.id)
from public.company c
where exists (select 1 from public.price_book_item i
              where i.company_id = c.id and i.name = 'Liquid chlorine' and i.deleted_at is null);

-- ---------------------------------------------------------------------------
-- The Aim For levels a reading was taken against
-- ---------------------------------------------------------------------------

alter table public.chemical_reading add column goals jsonb
  check (goals is null or jsonb_typeof(goals) = 'object');
update app.sync_table
set insert_columns = insert_columns || '{goals}',
    update_columns = update_columns || '{goals}'
where table_name = 'chemical_reading';
grant insert (goals), update (goals) on public.chemical_reading to authenticated;

-- ---------------------------------------------------------------------------
-- Added chemicals
-- ---------------------------------------------------------------------------

create table public.chemical_addition (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  -- The visit it was added on, and its pool (so a pool's use reads without the visit).
  job_id uuid not null,
  property_id uuid not null,
  -- The price book item; its name and unit are copied, so a rename never rewrites history.
  price_book_item_id uuid,
  name text not null check (length(trim(name)) between 1 and 120),
  unit text not null default 'each' check (length(trim(unit)) between 1 and 20),
  -- The reading it answered (an accepted suggestion); null when added on its own.
  reading_key text check (reading_key in ('fc', 'ph', 'ta', 'ch', 'cya', 'salt')),
  suggested_quantity numeric(10, 2) check (suggested_quantity >= 0),
  quantity numeric(10, 2) not null check (quantity > 0 and quantity <= 100000),
  -- The customer's own: shown on the report, never billed.
  customer_supplied boolean not null default false,
  note text check (note is null or length(note) <= 200),
  -- Server-set: the price book's price and tax flag when the row arrived, and the monthly
  -- invoice that billed it.
  unit_price_cents integer not null default 0 check (unit_price_cents between 0 and 99999999),
  taxable boolean not null default true,
  billed_invoice_id uuid,
  added_by uuid default auth.uid(),
  added_at timestamptz not null default now(),
  sort_order integer not null default 0,
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (property_id, company_id) references public.property (id, company_id),
  foreign key (price_book_item_id, company_id) references public.price_book_item (id, company_id),
  foreign key (billed_invoice_id, company_id) references public.invoice (id, company_id),
  foreign key (company_id, added_by) references public.membership (company_id, user_id)
);
select app.make_synced('public.chemical_addition');
create index chemical_addition_job_idx on public.chemical_addition (job_id);
create index chemical_addition_property_idx on public.chemical_addition (property_id, added_at desc);
create index chemical_addition_invoice_idx on public.chemical_addition (billed_invoice_id)
  where billed_invoice_id is not null;

-- Access: as the registry generates it (20261012000600_access.sql): members read and write,
-- narrowed to the jobs they may see (20261012002300_job_visibility.sql). Phones keep a visit's
-- additions with the visit (20261012003400_phone_history_window.sql). The price and the
-- billing are the server's: no client writes them.
insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order,
   job_ref)
values ('chemical_addition', 'member', 'member',
  '{job_id,property_id,price_book_item_id,name,unit,reading_key,suggested_quantity,quantity,customer_supplied,note,added_at,sort_order}',
  '{price_book_item_id,name,unit,quantity,customer_supplied,note,sort_order,deleted_at}',
  true, 308, 't.job_id');

grant select on public.chemical_addition to authenticated;
create policy chemical_addition_select on public.chemical_addition for select to authenticated
  using (app.is_member(company_id));
grant insert (id, company_id, job_id, property_id, price_book_item_id, name, unit, reading_key,
  suggested_quantity, quantity, customer_supplied, note, added_at, sort_order)
  on public.chemical_addition to authenticated;
create policy chemical_addition_insert on public.chemical_addition for insert to authenticated
  with check (app.is_member(company_id));
grant update (price_book_item_id, name, unit, quantity, customer_supplied, note, sort_order,
  deleted_at) on public.chemical_addition to authenticated;
create policy chemical_addition_update on public.chemical_addition for update to authenticated
  using (app.is_member(company_id)) with check (app.is_member(company_id));
create policy chemical_addition_job_visible on public.chemical_addition as restrictive for all
  to authenticated
  using (app.job_visible(company_id, job_id)) with check (app.job_visible(company_id, job_id));

-- Read-only (canceled) shops can't add chemicals, like every other synced table.
create trigger guard_writable before insert or update or delete on public.chemical_addition
  for each row execute function app.guard_writable();

select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- The price is the server's
-- ---------------------------------------------------------------------------

/**
 * The price book's price and tax flag when an addition arrives, or when it's changed to
 * another item. Whatever a client sent is replaced (clients can't write these columns anyway).
 */
create or replace function app.chemical_addition_price() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  item public.price_book_item;
begin
  if tg_op = 'INSERT' or new.price_book_item_id is distinct from old.price_book_item_id then
    select * into item from public.price_book_item
    where id = new.price_book_item_id and company_id = new.company_id;
    new.unit_price_cents := coalesce(item.price_cents, 0);
    new.taxable := coalesce(item.taxable, true);
  end if;
  return new;
end
$$;
create trigger chemical_addition_price before insert or update of price_book_item_id
  on public.chemical_addition for each row execute function app.chemical_addition_price();

/**
 * An addition billed on a sent invoice can't change (sent invoices are final); it can on a
 * draft, whose lines follow. Voiding the invoice frees it (only billed_invoice_id changes).
 */
create or replace function app.chemical_addition_locked() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if old.billed_invoice_id is not null
     and (new.quantity, new.unit, new.name, new.price_book_item_id, new.customer_supplied,
          new.deleted_at, new.unit_price_cents)
         is distinct from
         (old.quantity, old.unit, old.name, old.price_book_item_id, old.customer_supplied,
          old.deleted_at, old.unit_price_cents)
     and exists (select 1 from public.invoice i where i.id = old.billed_invoice_id
                 and i.status not in ('draft', 'void'))
  then
    raise exception 'This chemical is on a sent invoice. Change the invoice instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
create trigger chemical_addition_locked before update on public.chemical_addition
  for each row execute function app.chemical_addition_locked();

revoke all on function app.chemical_addition_price(), app.chemical_addition_locked() from public;

-- ---------------------------------------------------------------------------
-- Monthly invoices bill the month's chemicals
-- ---------------------------------------------------------------------------

-- An invoice line's unit ("2¾ gal × $8.00") and the chemical group it totals (server-set).
alter table public.invoice_line_item
  add column unit text,
  add column chemical_group text;

/** Does the shop charge for chemicals, and from which month (null: since always)? */
create or replace function app.charges_chemicals(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((c.settings ->> 'charge_chemicals')::boolean, false)
  from public.company c where c.id = target_company
$$;
create or replace function app.charge_chemicals_from(target_company uuid) returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select case when c.settings ->> 'charge_chemicals_from' ~ '^\d{4}-\d{2}-\d{2}$'
              then date_trunc('month', (c.settings ->> 'charge_chemicals_from')::date)::date end
  from public.company c where c.id = target_company
$$;

/**
 * The chemicals a month's invoices bill: added on finished maintenance visits that month, not
 * billed yet, not the customer's own, in a shop that charges (from the month it started). Also
 * the month before's, when that month's invoice for the customer was already sent without them
 * (added late): they go on this month's invoice, labeled with their own month.
 */
create or replace function app.unbilled_chemicals(target_company uuid, month date)
returns table (addition_id uuid, job_id uuid, customer_id uuid, property_id uuid, visit_month date)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select a.id, j.id, j.bill_to_customer_id, j.property_id, app.visit_month(j, c.timezone)
  from public.chemical_addition a
  join public.job j on j.id = a.job_id
  join public.company c on c.id = a.company_id
  where a.company_id = target_company and app.charges_chemicals(target_company)
    and a.deleted_at is null and a.billed_invoice_id is null and not a.customer_supplied
    and j.type = 'maintenance' and j.deleted_at is null and j.status in ('done', 'invoiced', 'paid')
    and j.bill_to_customer_id is not null
    and app.visit_month(j, c.timezone) >= coalesce(app.charge_chemicals_from(target_company), '-infinity'::date)
    and (app.visit_month(j, c.timezone) = date_trunc('month', month)::date
         or (app.visit_month(j, c.timezone) = (date_trunc('month', month) - interval '1 month')::date
             and exists (select 1 from public.invoice i
                         where i.company_id = target_company
                           and i.customer_id = j.bill_to_customer_id
                           and i.period_month = app.visit_month(j, c.timezone)
                           and i.status not in ('draft', 'void') and i.deleted_at is null)))
$$;

/**
 * The chemical lines an invoice's additions make: one per chemical, unit, price and month (and
 * pool, for a customer with more than one), "Liquid chlorine, October", the quantity the
 * month's total, in the order first added.
 */
create or replace function app.chemical_groups(target_invoice uuid)
returns table (grp text, description text, unit text, quantity numeric, cents integer,
               taxable boolean, first_at timestamptz)
language sql stable security definer set search_path = public, app, pg_temp as $$
  with a as (
    select a.*, app.visit_month(j, c.timezone) as m, p.address_line1,
           (select count(distinct b.property_id) from public.chemical_addition b
            where b.billed_invoice_id = target_invoice and b.deleted_at is null
              and not b.customer_supplied) as pools
    from public.chemical_addition a
    join public.job j on j.id = a.job_id
    join public.company c on c.id = a.company_id
    join public.property p on p.id = a.property_id
    where a.billed_invoice_id = target_invoice and a.deleted_at is null and not a.customer_supplied
  )
  select concat_ws('|', coalesce(a.price_book_item_id::text, a.name), a.unit, a.unit_price_cents,
                   a.m, case when a.pools > 1 then a.property_id::text end),
         min(a.name || ', ' || to_char(a.m, 'FMMonth')
             || case when a.pools > 1 then ', ' || a.address_line1 else '' end),
         min(a.unit), sum(a.quantity), min(a.unit_price_cents), bool_or(a.taxable), min(a.added_at)
  from a
  group by 1
$$;

/**
 * A draft monthly invoice's chemical lines follow its additions: lines no longer backed are
 * removed, a line's quantity follows its additions, new ones are added after the invoice's other
 * lines. An owner's own edits to a line's price or wording stay. Sent invoices never change.
 */
create or replace function app.sync_chemical_lines(target_invoice uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  next_sort integer;
  grp_row record;
begin
  select * into inv from public.invoice where id = target_invoice;
  if inv.id is null or inv.status <> 'draft' or inv.deleted_at is not null then
    return;
  end if;
  -- Lines whose chemicals are gone.
  update public.invoice_line_item l set deleted_at = now()
  where l.invoice_id = inv.id and l.chemical_group is not null and l.deleted_at is null
    and l.chemical_group not in (select g.grp from app.chemical_groups(inv.id) g);
  -- Quantities that changed.
  update public.invoice_line_item l set quantity = g.quantity
  from app.chemical_groups(inv.id) g
  where l.invoice_id = inv.id and l.chemical_group = g.grp and l.deleted_at is null
    and l.quantity is distinct from g.quantity;
  -- New groups.
  select coalesce(max(sort_order), 0) into next_sort
  from public.invoice_line_item where invoice_id = inv.id and deleted_at is null;
  for grp_row in
    select * from app.chemical_groups(inv.id) c
    where not exists (select 1 from public.invoice_line_item l where l.invoice_id = inv.id
                      and l.chemical_group = c.grp and l.deleted_at is null)
    order by c.first_at, c.grp
  loop
    next_sort := next_sort + 1;
    insert into public.invoice_line_item (company_id, invoice_id, description, quantity,
                                          unit_price_cents, taxable, sort_order, unit,
                                          chemical_group)
    values (inv.company_id, inv.id, grp_row.description, grp_row.quantity, grp_row.cents,
            grp_row.taxable, next_sort, grp_row.unit, grp_row.grp);
  end loop;
end
$$;

-- An addition changed on a draft-billed invoice: its lines follow. Unbilled ones wait for the
-- month to be drafted (the daily run redrafts last month every day).
create or replace function app.chemical_addition_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.billed_invoice_id is not null then
    perform app.sync_chemical_lines(new.billed_invoice_id);
  end if;
  if tg_op = 'UPDATE' and old.billed_invoice_id is not null
     and old.billed_invoice_id is distinct from new.billed_invoice_id then
    perform app.sync_chemical_lines(old.billed_invoice_id);
  end if;
  return null;
end
$$;
create trigger chemical_addition_changed after update of quantity, unit, name,
  price_book_item_id, customer_supplied, deleted_at, unit_price_cents, billed_invoice_id
  on public.chemical_addition for each row execute function app.chemical_addition_changed();

-- As 20261012004800_plan_schedule_and_monthly_price.sql, with the month's chemicals: a customer
-- whose only unbilled items are chemicals gets a draft too, and the draft's chemical lines follow
-- its additions.
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
  chems uuid[];
begin
  select timezone into tz from public.company where id = target_company;
  for cust in
    select bill_to_customer_id as customer_id from app.unbilled_visits(target_company, m)
    union
    select customer_id from app.unbilled_chemicals(target_company, m)
  loop
    -- Taken first: once the month's plan line is on, its visits no longer count as unbilled.
    visits := array(select j.id from app.unbilled_visits(target_company, m) j
                    where j.bill_to_customer_id = cust.customer_id);
    chems := array(select c.addition_id from app.unbilled_chemicals(target_company, m) c
                   where c.customer_id = cust.customer_id);
    inv := null;
    select * into inv from public.invoice
    where company_id = target_company and customer_id = cust.customer_id and period_month = m
      and status <> 'void' and deleted_at is null;
    if inv.id is not null and inv.status <> 'draft' then
      continue;
    end if;

    -- The month's last visit carries the invoice (a visit with chemicals counts too).
    select v.id into anchor from (
      select j.id, j.scheduled_start, j.completed_at, j.plan_date
      from public.job j where j.id = any (visits)
         or j.id in (select a.job_id from public.chemical_addition a where a.id = any (chems))
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
    -- The chemicals, totaled per chemical (app.sync_chemical_lines).
    update public.chemical_addition set billed_invoice_id = inv.id where id = any (chems);
    perform app.sync_chemical_lines(inv.id);
    touched := touched + 1;
  end loop;
  return touched;
end
$$;

-- Maintenance to Bill: as before, with customers whose only unbilled items are chemicals and
-- the chemicals in each month's total.
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
  -- This month's and last month's chemicals (older ones are never billed by the month).
  chem_months as (
    select generate_series(
      date_trunc('month', (now() at time zone c.timezone)::date) - interval '1 month',
      date_trunc('month', (now() at time zone c.timezone)::date), interval '1 month')::date as m
    from public.company c where c.id = target_company
  ),
  chems as (
    select cm.m, u.customer_id,
           round(a.quantity * 100)::bigint * a.unit_price_cents / 100.0 as cents
    from chem_months cm
    cross join lateral app.unbilled_chemicals(target_company, cm.m) u
    join public.chemical_addition a on a.id = u.addition_id
  ),
  months as (
    select m, sum(visits) as visits, count(distinct customer) as customers, sum(cents) as cents
    from (
      select v.m, 1 as visits, v.bill_to_customer_id as customer, v.cents from v
      union all
      select m, 0, customer_id, cents from chems
    ) x
    group by m
  )
  select case when not app.is_owner(target_company) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object('month', mo.m, 'visits', mo.visits,
                                        'customers', mo.customers,
                                        'total_cents', round(mo.cents + coalesce(p.cents, 0)))
                     order by mo.m)
    from months mo left join plans p on p.m = mo.m), '[]'::jsonb) end
$$;
revoke all on function public.unbilled_maintenance(uuid) from public, anon;
grant execute on function public.unbilled_maintenance(uuid) to authenticated;

-- The visits (and now the chemicals) follow their monthly invoice. As
-- 20261012002900_monthly_invoices.sql, plus: voiding frees its chemicals to bill again.
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
  end if;
  return null;
end
$$;

revoke all on function app.charges_chemicals(uuid), app.charge_chemicals_from(uuid),
  app.unbilled_chemicals(uuid, date), app.chemical_groups(uuid), app.sync_chemical_lines(uuid),
  app.chemical_addition_changed(), app.bill_maintenance_month(uuid, date) from public;

-- ---------------------------------------------------------------------------
-- The visit report keeps what was added
-- ---------------------------------------------------------------------------

-- As 20261012006300_visit_reports.sql, plus the Aim For levels, the additions (oldest first),
-- whether the shop charged for them when the report was sent, and the visit's month.
create or replace function app.visit_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.report_snapshot(target_job) || jsonb_build_object(
    'chemicals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recorded_at', cr.recorded_at, 'gallons', cr.gallons, 'fc', cr.fc, 'ph', cr.ph,
        'ta', cr.ta, 'ch', cr.ch, 'cya', cr.cya, 'salt', cr.salt,
        'chlorine_product', cr.chlorine_product, 'acid_product', cr.acid_product,
        'notes', cr.notes, 'goals', cr.goals)
        order by cr.recorded_at desc)
      from public.chemical_reading cr
      where cr.job_id = target_job and cr.deleted_at is null), '[]'::jsonb),
    'added', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', a.name, 'unit', a.unit, 'quantity', a.quantity, 'reading_key', a.reading_key,
        'note', a.note, 'customer_supplied', a.customer_supplied,
        'unit_price_cents', a.unit_price_cents)
        order by a.sort_order, a.added_at, a.id)
      from public.chemical_addition a
      where a.job_id = target_job and a.deleted_at is null), '[]'::jsonb),
    'charge_chemicals', (select app.charges_chemicals(j.company_id) from public.job j
                         where j.id = target_job),
    'visit_month', (select app.visit_month(j, c.timezone) from public.job j
                    join public.company c on c.id = j.company_id where j.id = target_job),
    'completed_at', (select j.completed_at from public.job j where j.id = target_job))
$$;
revoke all on function app.visit_snapshot(uuid) from public;

-- ---------------------------------------------------------------------------
-- The invoice's customer page shows a chemical line's unit ("2¾ gal × $8.00")
-- ---------------------------------------------------------------------------

alter function public.invoice_for_token(text, boolean) rename to invoice_for_token_before_units;
revoke all on function public.invoice_for_token_before_units(text, boolean)
  from public, anon, authenticated;
create function public.invoice_for_token(link_token text, count_view boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r jsonb := public.invoice_for_token_before_units(link_token, count_view);
begin
  if r is null then
    return null;
  end if;
  return r || jsonb_build_object('lines', coalesce((
    select jsonb_agg(e.l || jsonb_build_object('unit', li.unit) order by e.ord)
    from jsonb_array_elements(r -> 'lines') with ordinality as e(l, ord)
    left join public.invoice_line_item li on li.id = (e.l ->> 'id')::uuid), '[]'::jsonb));
end
$$;
revoke all on function public.invoice_for_token(text, boolean) from public;
grant execute on function public.invoice_for_token(text, boolean) to anon, authenticated;
