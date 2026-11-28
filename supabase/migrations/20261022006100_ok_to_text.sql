-- OK to Text (owner, 2026-11-28: "Yes" to recording each customer's consent, and "Allow, with a
-- reminder"): when a customer said it's OK to text them, the shop marks it, and the date and
-- who marked it are kept. Phone companies' campaign reviews ask how consent is recorded
-- (docs/plans/texting-registration.md). Texts still go to customers not marked; the message
-- screens remind the sender instead.

alter table public.customer
  add column text_ok_at timestamptz,
  add column text_ok_by uuid;

-- Members write it, like the rest of the customer (registry as 20261012000600_access.sql).
do $$
declare
  cols text[] := array['text_ok_at', 'text_ok_by'];
begin
  update app.sync_table
  set insert_columns = insert_columns || cols,
      update_columns = update_columns || cols
  where table_name = 'customer';
  execute format('grant insert (%s) on public.customer to authenticated', array_to_string(cols, ', '));
  execute format('grant update (%s) on public.customer to authenticated', array_to_string(cols, ', '));
end
$$;

-- New Job and new cleaning plans (create_job, create_service_plan) make the customer here:
-- "text_ok": true in new_customer marks it now, by whoever made it.
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
    insert into public.customer (company_id, kind, name, phone, email, cc_emails, text_ok_at,
                                 text_ok_by)
    values (target_company, 'homeowner', new_customer ->> 'name', new_customer ->> 'phone',
            new_customer ->> 'email',
            coalesce(array(select jsonb_array_elements_text(new_customer -> 'cc_emails')), '{}'),
            case when (new_customer ->> 'text_ok')::boolean then now() end,
            case when (new_customer ->> 'text_ok')::boolean then auth.uid() end)
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
