-- New maintenance work from Jobs › New Job (owner request, 2026-10-13: "There is no way to
-- add a maintenance job"). New Job could only book leak detection. Now it books a single
-- maintenance visit (create_job with type 'maintenance'), or starts a maintenance plan for a
-- new or existing customer and pool in one step (create_service_plan; owners only, by row
-- security). Both run as the caller, like create_job always has.

-- The customer and pool for new work: existing ones, or new ones made here.
create or replace function app.customer_and_pool(
  target_company uuid,
  new_customer jsonb,
  existing_customer uuid,
  new_property jsonb,
  existing_property uuid,
  out cust uuid,
  out prop uuid
)
language plpgsql security invoker set search_path = public, app, pg_temp as $$
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  cust := existing_customer;
  prop := existing_property;
  if cust is null then
    insert into public.customer (company_id, kind, name, phone, email, cc_emails)
    values (target_company, 'homeowner', new_customer ->> 'name', new_customer ->> 'phone',
            new_customer ->> 'email',
            coalesce(array(select jsonb_array_elements_text(new_customer -> 'cc_emails')), '{}'))
    returning id into cust;
  end if;
  if prop is null then
    insert into public.property (company_id, customer_id, address_line1, city, state, postal_code,
                                 pool_type, has_pool, has_spa, access_notes)
    values (target_company, cust, new_property ->> 'address_line1',
            new_property ->> 'city', new_property ->> 'state', new_property ->> 'postal_code',
            new_property ->> 'pool_type', true,
            coalesce((new_property ->> 'has_spa')::boolean, false),
            new_property ->> 'access_notes')
    returning id into prop;
  elsif not exists (select 1 from public.property p
                    where p.id = prop and p.customer_id = cust) then
    raise exception 'That pool belongs to another customer' using errcode = 'check_violation';
  end if;
end
$$;

revoke all on function app.customer_and_pool(uuid, jsonb, uuid, jsonb, uuid) from public;
grant execute on function app.customer_and_pool(uuid, jsonb, uuid, jsonb, uuid) to authenticated;

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
          case when job ->> 'type' = 'maintenance' then 'maintenance' else 'detection' end,
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

-- A maintenance plan with, if needed, its new customer and pool. Saving the plan makes its
-- visits (app.plan_visits). Returns the plan's and the customer's ids.
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
                                   starts_on, interval_weeks, visit_time, duration_minutes,
                                   price_cents, ends_on, notes)
  values (target_company, cp.cust, cp.prop, (plan ->> 'assigned_user_id')::uuid,
          (plan ->> 'starts_on')::date, coalesce((plan ->> 'interval_weeks')::smallint, 1),
          (plan ->> 'visit_time')::time, coalesce((plan ->> 'duration_minutes')::integer, 30),
          (plan ->> 'price_cents')::integer, (plan ->> 'ends_on')::date, plan ->> 'notes')
  returning id into new_plan;
  return jsonb_build_object('plan', new_plan, 'customer', cp.cust,
                            'property', cp.prop);
end
$$;

revoke all on function public.create_service_plan(uuid, jsonb, uuid, jsonb, uuid, jsonb)
  from public, anon;
grant execute on function public.create_service_plan(uuid, jsonb, uuid, jsonb, uuid, jsonb)
  to authenticated;

-- Maintenance plans follow the read-only lock like every other shop table
-- (20261012002100_billing.sql attached it to the tables that existed then).
drop trigger if exists guard_writable on public.service_plan;
create trigger guard_writable before insert or update or delete on public.service_plan
  for each row execute function app.guard_writable();
