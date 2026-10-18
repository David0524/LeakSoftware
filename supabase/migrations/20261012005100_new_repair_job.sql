-- New Job offers Repair to every shop (owner, 2026-10-18: "New job options should be leak
-- detection, pool service, repair. Both profiles get repair."). Until now a repair job came
-- only from an accepted quote; the office or a tech can now make one directly. It has no
-- checklist, like a quote's repair job, and its price is billed as "Repair".

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
begin
  select * into cp from app.customer_and_pool(target_company, new_customer, existing_customer,
                                              new_property, existing_property);
  insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                          assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                          summary_notes, fee_cents, intake)
  values (target_company,
          case when job ->> 'type' in ('maintenance', 'repair') then job ->> 'type'
               else 'detection' end,
          cp.prop, cp.cust, job ->> 'status',
          (job ->> 'assigned_user_id')::uuid, (job ->> 'second_tech_id')::uuid,
          (job ->> 'scheduled_start')::timestamptz, (job ->> 'scheduled_end')::timestamptz,
          job ->> 'summary_notes', (job ->> 'fee_cents')::integer, job -> 'intake')
  returning id into new_job;

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

-- The job's price is its first invoice line: "Leak detection", or "Repair" on a repair job.
-- The body behind public.create_invoice, which checks the job is visible first
-- (20261012002800_visibility_functions.sql).
create or replace function app.create_invoice_unchecked(target_job uuid) returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  j public.job;
  q public.quote;
  inv uuid;
  deposit bigint;
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

  if j.fee_cents is not null and j.fee_cents > 0 then
    insert into public.invoice_line_item (company_id, invoice_id, description, unit_price_cents,
                                          taxable, sort_order)
    values (j.company_id, inv,
            case when j.type = 'repair' then 'Repair' else 'Leak detection' end, j.fee_cents,
            false, 0);
  end if;
  if q.id is not null then
    insert into public.invoice_line_item (company_id, invoice_id, description, quantity,
                                          unit_price_cents, taxable, warranty_months, sort_order)
    select j.company_id, inv, l.description, l.quantity, l.unit_price_cents, l.taxable,
           l.warranty_months, 10 + row_number() over (order by l.sort_order, l.id)
    from public.quote_line_item l where l.quote_id = q.id and l.deleted_at is null;

    select coalesce(sum(amount_cents), 0) into deposit from public.payment
    where quote_id = q.id and status = 'succeeded' and deleted_at is null;
    if deposit > 0 then
      perform set_config('app.invoice_server', 'on', true);
      insert into public.invoice_line_item (company_id, invoice_id, kind, description,
                                            unit_price_cents, taxable, sort_order)
      values (j.company_id, inv, 'deposit_credit',
              'Deposit paid on quote #' || coalesce(q.number::text, ''), -deposit, false, 1000);
      perform set_config('app.invoice_server', 'off', true);
    end if;
  end if;
  return inv;
end
$$;
