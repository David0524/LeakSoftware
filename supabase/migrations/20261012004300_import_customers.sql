-- Importing a shop's customers (owner, 2026-10-16: "build the importer"). The website reads
-- the shop's file and checks it; this creates the customers, their pools, and their visit
-- plans in one transaction, so an import either all happens or none of it does. Saving a
-- plan makes its visits (20261012002400_maintenance.sql), so imported routes appear on the
-- schedule straight away.
--
-- Runs as the caller (row security applies): an owner imports into their own shop. Tidemark
-- staff import for a shop from the server (service role), after the website checked they're
-- staff. Each record: { customer: {...}, property: {...} | null, plan: {...} | null }.

create or replace function public.import_customers(target_company uuid, records jsonb)
returns jsonb
language plpgsql security invoker set search_path = public, app, pg_temp as $$
declare
  rec jsonb;
  cust uuid;
  prop uuid;
  customers integer := 0;
  pools integer := 0;
  plans integer := 0;
begin
  if auth.uid() is not null and not app.is_owner(target_company) then
    raise exception 'Only the shop''s owners can import customers' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(records) <> 'array' or jsonb_array_length(records) > 2000 then
    raise exception 'Import up to 2,000 customers at a time' using errcode = 'invalid_parameter_value';
  end if;

  for rec in select value from jsonb_array_elements(records) loop
    insert into public.customer (company_id, name, company_name, email, phone, notes)
    values (target_company,
            left(trim(rec -> 'customer' ->> 'name'), 200),
            nullif(left(trim(rec -> 'customer' ->> 'company_name'), 200), ''),
            nullif(lower(trim(rec -> 'customer' ->> 'email')), ''),
            nullif(left(trim(rec -> 'customer' ->> 'phone'), 40), ''),
            nullif(left(rec -> 'customer' ->> 'notes', 2000), ''))
    returning id into cust;
    customers := customers + 1;

    if jsonb_typeof(rec -> 'property') = 'object' then
      insert into public.property (company_id, customer_id, address_line1, address_line2, city,
                                   state, postal_code, approx_gallons, pool_type, access_notes)
      values (target_company, cust,
              left(trim(rec -> 'property' ->> 'address_line1'), 200),
              nullif(left(trim(rec -> 'property' ->> 'address_line2'), 100), ''),
              nullif(left(trim(rec -> 'property' ->> 'city'), 100), ''),
              nullif(left(trim(rec -> 'property' ->> 'state'), 50), ''),
              nullif(left(trim(rec -> 'property' ->> 'postal_code'), 20), ''),
              nullif((rec -> 'property' ->> 'approx_gallons')::integer, 0),
              rec -> 'property' ->> 'pool_type',
              nullif(left(rec -> 'property' ->> 'access_notes', 500), ''))
      returning id into prop;
      pools := pools + 1;

      if jsonb_typeof(rec -> 'plan') = 'object' then
        insert into public.service_plan (company_id, customer_id, property_id, assigned_user_id,
                                         starts_on, interval_weeks, price_cents)
        values (target_company, cust, prop,
                nullif(rec -> 'plan' ->> 'tech_id', '')::uuid,
                (rec -> 'plan' ->> 'starts_on')::date,
                coalesce((rec -> 'plan' ->> 'interval_weeks')::smallint, 1),
                (rec -> 'plan' ->> 'price_cents')::integer);
        plans := plans + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('customers', customers, 'pools', pools, 'plans', plans);
end
$$;
revoke all on function public.import_customers(uuid, jsonb) from public, anon;
grant execute on function public.import_customers(uuid, jsonb) to authenticated, service_role;
