-- Several repairs on one repair job (owner, 2026-10-22: "On repair jobs, (in the intake and
-- actually working the job) we need a button to 'add additional repair'. It's common to go out
-- and repair multiple parts in one job."; docs/design/2026-10-22-multiple-repairs.md).
--
-- One row per repair, not a list inside job.intake: a list in one jsonb field is one field to
-- the sync's last-writer-wins, so two techs adding a repair at once would lose one. As rows,
-- each phone adds its own, offline too, and both stay.
--
-- The job's price (job.fee_cents) is the sum of its live repairs. Phones write it with each
-- change so it shows at once; the server keeps it right whatever they wrote
-- (app.job_repair_fee), so two phones adding at once still end at the full sum.
--
-- Jobs booked before this have no rows: their booking (intake.repair_item and fee_cents) is
-- their one repair. The first change on such a job writes that repair as a row whose id is the
-- job's id (packages/core/src/repairs.ts), so two phones doing it at once write the same row.
--
-- New Job › Repair saves its repairs through create_job (job -> 'repairs'). The invoice bills one
-- line per repair, and the repair report lists every repair. Invoices already made keep their
-- lines.

create table public.job_repair (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  job_id uuid not null,
  -- The price book item it was picked from, if any (its name and price are copied).
  price_book_item_id uuid,
  description text not null check (length(trim(description)) between 1 and 200),
  price_cents integer not null default 0 check (price_cents between 0 and 999999999),
  sort_order integer not null default 0,
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (price_book_item_id, company_id) references public.price_book_item (id, company_id)
);
select app.make_synced('public.job_repair');
create index job_repair_job_idx on public.job_repair (job_id);

-- ---------------------------------------------------------------------------
-- Access: as the registry generates it (20261012000600_access.sql): members read and write,
-- narrowed to the jobs they may see (20261012002300_job_visibility.sql). Phones keep a job's
-- repairs with the job (20261012003400_phone_history_window.sql).
-- ---------------------------------------------------------------------------

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order,
   job_ref)
values ('job_repair', 'member', 'member',
  '{job_id,price_book_item_id,description,price_cents,sort_order}',
  '{description,price_cents,sort_order,deleted_at}', true, 302, 't.job_id');

grant select on public.job_repair to authenticated;
create policy job_repair_select on public.job_repair for select to authenticated
  using (app.is_member(company_id));
grant insert (id, company_id, job_id, price_book_item_id, description, price_cents, sort_order)
  on public.job_repair to authenticated;
create policy job_repair_insert on public.job_repair for insert to authenticated
  with check (app.is_member(company_id));
grant update (description, price_cents, sort_order, deleted_at) on public.job_repair
  to authenticated;
create policy job_repair_update on public.job_repair for update to authenticated
  using (app.is_member(company_id)) with check (app.is_member(company_id));
create policy job_repair_job_visible on public.job_repair as restrictive for all to authenticated
  using (app.job_visible(company_id, job_id)) with check (app.job_visible(company_id, job_id));

-- Read-only (canceled) shops can't add repairs, like every other synced table.
create trigger guard_writable before insert or update or delete on public.job_repair
  for each row execute function app.guard_writable();

select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- The job's price is the sum of its repairs
-- ---------------------------------------------------------------------------

/** The sum of a repair job's live repairs, or null when it has no repair rows (live or not). */
create or replace function app.repairs_total(target_job uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(*) = 0 then null
              else least(coalesce(sum(r.price_cents) filter (where r.deleted_at is null), 0),
                         2147483647)::integer end
  from public.job_repair r
  where r.job_id = target_job
$$;

/**
 * Sets a repair job's price to its repairs' total. The job is locked first, so two pushes
 * adding repairs at once take turns and the second counts the first's. Written with the server's
 * clock, not the clocks of the repair a phone pushed.
 */
create or replace function app.job_repair_fee(target_job uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  clocks text := current_setting('leakbook.field_hlc', true);
  total integer;
begin
  perform 1 from public.job where id = target_job and type = 'repair' for update;
  if not found then
    return;
  end if;
  total := app.repairs_total(target_job);
  if total is null then
    return;
  end if;
  perform set_config('leakbook.field_hlc', '', true);
  update public.job set fee_cents = total
  where id = target_job and fee_cents is distinct from total;
  perform set_config('leakbook.field_hlc', coalesce(clocks, ''), true);
end
$$;

create or replace function app.job_repair_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.job_repair_fee(new.job_id);
  return null;
end
$$;

create trigger job_repair_fee after insert or update of price_cents, deleted_at
  on public.job_repair for each row execute function app.job_repair_changed();

-- A price written on a repair job that has repairs (a phone that hadn't seen another's repair
-- yet, an older app's Price field) becomes their total. Runs before touch_row (alphabetical).
create or replace function app.repair_fee_is_total() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  total integer;
begin
  if new.type = 'repair' then
    total := app.repairs_total(new.id);
    if total is not null then
      new.fee_cents := total;
    end if;
  end if;
  return new;
end
$$;

create trigger repair_fee_is_total before update of fee_cents on public.job
  for each row when (new.fee_cents is distinct from old.fee_cents)
  execute function app.repair_fee_is_total();

revoke all on function app.repairs_total(uuid), app.job_repair_fee(uuid),
  app.job_repair_changed(), app.repair_fee_is_total() from public;

-- ---------------------------------------------------------------------------
-- New Job: the repairs come with the job (job -> 'repairs': [{price_book_item_id,
-- description, price_cents}]), saved together. As 20261012006700_pool_inspection.sql otherwise.
-- ---------------------------------------------------------------------------

create or replace function public.create_job(
  target_company uuid,
  new_customer jsonb,
  existing_customer uuid,
  new_property jsonb,
  existing_property uuid,
  job jsonb,
  components jsonb
) returns uuid
language plpgsql security invoker set search_path = public, app, pg_temp as $$
declare
  cp record;
  new_job uuid;
  c jsonb;
  comp uuid;
  r record;
begin
  select * into cp from app.customer_and_pool(target_company, new_customer, existing_customer,
                                              new_property, existing_property);
  insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                          assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                          summary_notes, fee_cents, intake)
  values (target_company,
          case when job ->> 'type' in ('maintenance', 'repair', 'inspection') then job ->> 'type'
               else 'detection' end,
          cp.prop, cp.cust, job ->> 'status',
          (job ->> 'assigned_user_id')::uuid, (job ->> 'second_tech_id')::uuid,
          (job ->> 'scheduled_start')::timestamptz, (job ->> 'scheduled_end')::timestamptz,
          job ->> 'summary_notes', (job ->> 'fee_cents')::integer, job -> 'intake')
  returning id into new_job;

  if job ->> 'type' = 'repair' and jsonb_typeof(job -> 'repairs') = 'array' then
    for r in select e.value as v, e.ordinality - 1 as n
             from jsonb_array_elements(job -> 'repairs') with ordinality e loop
      insert into public.job_repair (company_id, job_id, price_book_item_id, description,
                                     price_cents, sort_order)
      values (target_company, new_job, (r.v ->> 'price_book_item_id')::uuid,
              trim(r.v ->> 'description'), (r.v ->> 'price_cents')::integer, r.n);
    end loop;
  end if;

  for c in select * from jsonb_array_elements(coalesce(components, '[]')) loop
    insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                      label, sort_order)
    values (target_company, new_job, (c ->> 'component_type_id')::uuid,
            (c ->> 'instance_number')::integer, c ->> 'label', (c ->> 'sort_order')::integer)
    returning id into comp;
    insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
    values (target_company, new_job, comp, 'pending');
  end loop;
  return new_job;
end
$$;

-- ---------------------------------------------------------------------------
-- The invoice: one line per repair (a repair job with repair rows), else the job's price as one
-- line, as before. As 20261012006700_pool_inspection.sql otherwise.
-- ---------------------------------------------------------------------------

create or replace function app.create_invoice_unchecked(target_job uuid) returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  j public.job;
  q public.quote;
  inv uuid;
  deposit bigint;
  repairs integer := 0;
begin
  select * into j from public.job where id = target_job and deleted_at is null for update;
  if j.id is null or not app.is_member(j.company_id) then
    raise exception 'Job not found' using errcode = 'insufficient_privilege';
  end if;
  select id into inv from public.invoice
  where job_id = j.id and status <> 'void' and deleted_at is null order by created_at limit 1;
  if inv is not null then
    return inv;
  end if;
  if j.status in ('unscheduled', 'scheduled', 'canceled') then
    raise exception 'Start the job before invoicing it' using errcode = 'check_violation';
  end if;

  select * into q from public.quote
  where repair_job_id = j.id and status = 'accepted' and deleted_at is null
  order by accepted_at desc limit 1;
  if q.id is not null and exists (select 1 from public.payment where quote_id = q.id
                                  and status = 'pending' and deleted_at is null) then
    raise exception 'The deposit is still clearing. Create the invoice once it has cleared.'
      using errcode = 'check_violation', hint = 'deposit_pending';
  end if;

  insert into public.invoice (company_id, job_id, quote_id, discount_cents)
  values (j.company_id, j.id, q.id, coalesce(q.discount_cents, 0))
  returning id into inv;

  if j.type = 'repair' and app.repairs_total(j.id) is not null then
    insert into public.invoice_line_item (company_id, invoice_id, description, unit_price_cents,
                                          taxable, sort_order)
    select j.company_id, inv, trim(r.description), r.price_cents, false,
           row_number() over (order by r.sort_order, r.created_at, r.id) - 1
    from public.job_repair r
    where r.job_id = j.id and r.deleted_at is null;
    get diagnostics repairs = row_count;
  elsif j.fee_cents is not null and j.fee_cents > 0 then
    insert into public.invoice_line_item (company_id, invoice_id, description, unit_price_cents,
                                          taxable, sort_order)
    values (j.company_id, inv,
            case j.type when 'repair' then 'Repair' when 'inspection' then 'Pool inspection'
                         else 'Leak detection' end, j.fee_cents,
            false, 0);
  end if;
  if q.id is not null then
    insert into public.invoice_line_item (company_id, invoice_id, description, quantity,
                                          unit_price_cents, taxable, warranty_months, sort_order)
    select j.company_id, inv, l.description, l.quantity, l.unit_price_cents, l.taxable,
           l.warranty_months, 10 + repairs + row_number() over (order by l.sort_order, l.id)
    from public.quote_line_item l where l.quote_id = q.id and l.deleted_at is null;

    select coalesce(sum(amount_cents), 0) into deposit from public.payment
    where quote_id = q.id and status = 'succeeded' and deleted_at is null;
    if deposit > 0 then
      perform set_config('app.invoice_server', 'on', true);
      insert into public.invoice_line_item (company_id, invoice_id, kind, description,
                                            unit_price_cents, taxable, sort_order)
      values (j.company_id, inv, 'deposit_credit',
              'Deposit paid on quote #' || coalesce(q.number::text, ''), -deposit, false,
              1000 + repairs);
      perform set_config('app.invoice_server', 'off', true);
    end if;
  end if;
  return inv;
end
$$;

-- ---------------------------------------------------------------------------
-- The repair report: "What we did" lists the accepted quote's lines, then every repair; with
-- neither, the item the job was booked for (as 20261022000600_repair_report.sql).
-- ---------------------------------------------------------------------------

create or replace function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when s is null or j.type is distinct from 'repair' then s
    else s || jsonb_build_object('work', coalesce(
      (select jsonb_agg(w.item order by w.part, w.n)
       from (
         select 1 as part, row_number() over (order by l.sort_order, l.id) as n,
                jsonb_build_object('description', trim(l.description), 'quantity', l.quantity)
                  as item
         from public.quote_line_item l
         where l.deleted_at is null and length(trim(l.description)) > 0
           and l.quote_id = (
             select q.id from public.quote q
             where q.repair_job_id = j.id and q.status = 'accepted' and q.deleted_at is null
             order by q.accepted_at desc nulls last, q.id desc limit 1)
         union all
         select 2, row_number() over (order by r.sort_order, r.created_at, r.id),
                jsonb_build_object('description', trim(r.description), 'quantity', 1)
         from public.job_repair r
         where r.job_id = j.id and r.deleted_at is null
       ) w),
      case when jsonb_typeof(j.intake -> 'repair_item') = 'string'
                and length(trim(j.intake ->> 'repair_item')) > 0
                and not exists (select 1 from public.job_repair r where r.job_id = j.id)
           then jsonb_build_array(jsonb_build_object(
                  'description', trim(j.intake ->> 'repair_item'), 'quantity', 1)) end,
      '[]'::jsonb)) end
  from app.report_snapshot_before_repair(target_job) s
  left join public.job j on j.id = target_job and j.deleted_at is null
$$;
revoke all on function app.report_snapshot(uuid) from public;
