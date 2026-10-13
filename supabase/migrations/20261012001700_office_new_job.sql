-- New jobs from the office website (owner request, 2026-10-13). The phone creates jobs
-- offline row by row through sync; the website creates the same rows here, in one
-- transaction: an optional new customer, an optional new pool, the job, and its checklist
-- (pending items, planned by packages/core planComponents). Runs as the caller, so row
-- security and column grants apply exactly as for the phone.

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
  cust uuid := existing_customer;
  prop uuid := existing_property;
  new_job uuid;
  c jsonb;
  comp uuid;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
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
    values (target_company, cust, new_property ->> 'address_line1', new_property ->> 'city',
            new_property ->> 'state', new_property ->> 'postal_code',
            new_property ->> 'pool_type', true,
            coalesce((new_property ->> 'has_spa')::boolean, false),
            new_property ->> 'access_notes')
    returning id into prop;
  elsif not exists (select 1 from public.property where id = prop and customer_id = cust) then
    raise exception 'That pool belongs to another customer' using errcode = 'check_violation';
  end if;

  insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                          assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                          summary_notes, fee_cents, intake)
  values (target_company, 'detection', prop, cust, job ->> 'status',
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

revoke all on function public.create_job(uuid, jsonb, uuid, jsonb, uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.create_job(uuid, jsonb, uuid, jsonb, uuid, jsonb, jsonb)
  to authenticated;
