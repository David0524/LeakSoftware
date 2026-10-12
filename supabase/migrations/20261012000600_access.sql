-- Access control. Everything here is generated from app.sync_table so every company table
-- follows the same rules:
--   * anon gets nothing. Customer pages go through server code with the service role.
--   * authenticated: SELECT where it is a member (or owner), INSERT/UPDATE only on the
--     listed columns and only where it holds the write role. No DELETE: rows are
--     soft-deleted with deleted_at so the deletion syncs to other devices.
--   * Columns not listed are server-owned (payment status, numbers, accepted_at, ...).

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon;

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values
  ('company', 'member', 'owner', null,
   '{name,legal_name,phone,email,address_line1,address_line2,city,state,postal_code,logo_path,brand_primary,brand_secondary,review_url,timezone,settings}',
   true, 10),
  ('membership', 'member', 'owner', null, '{role,status}', true, 20),

  ('component_type', 'member', 'owner',
   '{key,name,allows_multiple,default_count,applies_to,methods,sort_order,active}',
   '{name,allows_multiple,default_count,applies_to,methods,sort_order,active,deleted_at}', true, 100),
  ('test_type', 'member', 'owner',
   '{key,name,field_schema,schema_version,calculator,result_options,sort_order,active}',
   '{name,field_schema,schema_version,calculator,result_options,sort_order,active,deleted_at}', true, 110),
  ('severity_level', 'member', 'owner',
   '{key,name,color,must_mention,sort_order,active}',
   '{name,color,must_mention,sort_order,active,deleted_at}', true, 120),
  ('exclusion_reason', 'member', 'owner',
   '{label,sort_order,active}', '{label,sort_order,active,deleted_at}', true, 130),
  ('report_template', 'member', 'owner', null, '{name,enabled,sections,tone}', true, 140),
  ('price_book_item', 'member', 'owner',
   '{name,description,category,component_type_key,unit,price_cents,taxable,warranty_months,sort_order,active}',
   '{name,description,category,component_type_key,unit,price_cents,taxable,warranty_months,sort_order,active,deleted_at}',
   true, 150),

  ('customer', 'member', 'member',
   '{kind,name,company_name,email,phone,notes,marketing_opt_out}',
   '{kind,name,company_name,email,phone,notes,marketing_opt_out,deleted_at}', true, 200),
  ('property', 'member', 'member',
   '{customer_id,address_line1,address_line2,city,state,postal_code,latitude,longitude,pool_type,has_pool,has_spa,diagram_shape,approx_gallons,access_notes,notes}',
   '{customer_id,address_line1,address_line2,city,state,postal_code,latitude,longitude,pool_type,has_pool,has_spa,diagram_shape,approx_gallons,access_notes,notes,deleted_at}',
   true, 210),

  ('job', 'member', 'member',
   '{type,property_id,bill_to_customer_id,parent_job_id,status,assigned_user_id,scheduled_start,scheduled_end,started_at,completed_at,summary_notes}',
   '{property_id,bill_to_customer_id,status,assigned_user_id,scheduled_start,scheduled_end,started_at,completed_at,summary_notes,deleted_at}',
   true, 300),
  ('job_component', 'member', 'member',
   '{job_id,component_type_id,instance_number,label,location_note,sort_order}',
   '{instance_number,label,location_note,sort_order,deleted_at}', true, 310),
  ('checklist_item_result', 'member', 'member',
   '{job_id,job_component_id,status,method,exclusion_reason,notes,inspected_at,inspected_by}',
   '{status,method,exclusion_reason,notes,inspected_at,inspected_by,deleted_at}', true, 320),
  ('test_result', 'member', 'member',
   '{job_id,job_component_id,test_type_id,schema_version,data,computed,outcome,performed_at,notes}',
   '{job_component_id,schema_version,data,computed,outcome,performed_at,notes,deleted_at}', true, 330),
  ('finding', 'member', 'member',
   '{job_id,job_component_id,title,location_text,severity_key,pin_x,pin_y,status,notes}',
   '{job_component_id,title,location_text,severity_key,pin_x,pin_y,status,notes,deleted_at}', true, 340),

  ('report', 'member', 'member',
   '{job_id,template_key,version,final_sections}', '{final_sections,deleted_at}', true, 400),
  ('quote', 'member', 'member',
   '{job_id,subtotal_cents,discount_cents,tax_cents,total_cents,deposit_rule,deposit_cents,valid_until,notes}',
   '{subtotal_cents,discount_cents,tax_cents,total_cents,deposit_rule,deposit_cents,valid_until,notes,deleted_at}',
   true, 410),
  ('quote_line_item', 'member', 'member',
   '{quote_id,finding_id,price_book_item_id,description,quantity,unit_price_cents,taxable,warranty_months,sort_order}',
   '{finding_id,price_book_item_id,description,quantity,unit_price_cents,taxable,warranty_months,sort_order,deleted_at}',
   true, 420),
  ('invoice', 'member', 'member',
   '{job_id,quote_id,subtotal_cents,tax_cents,total_cents,due_date,notes}',
   '{subtotal_cents,tax_cents,total_cents,due_date,notes,deleted_at}', true, 430),
  ('invoice_line_item', 'member', 'member',
   '{invoice_id,kind,description,quantity,unit_price_cents,taxable,warranty_months,sort_order}',
   '{kind,description,quantity,unit_price_cents,taxable,warranty_months,sort_order,deleted_at}',
   true, 440),
  ('payment', 'member', 'none', null, null, true, 450),

  ('media', 'member', 'member',
   '{job_id,finding_id,job_component_id,test_result_id,kind,storage_path,upload_state,mime_type,size_bytes,sha256,width,height,duration_ms,captured_at,latitude,longitude,markup,caption}',
   '{finding_id,job_component_id,test_result_id,storage_path,upload_state,markup,caption,deleted_at}',
   true, 500),
  ('signature', 'member', 'member',
   '{job_id,report_id,quote_id,purpose,signer_name,signer_role,image_path,signed_at,latitude,longitude,device_id}',
   '{image_path}', true, 510),

  ('share_link', 'member', 'none', null, null, true, 600),
  ('message', 'member', 'member', '{job_id,channel,recipient,template,status}', null, true, 610),
  ('warranty', 'member', 'owner', null, '{description,ends_on,terms}', true, 620),

  -- Server-only tables: owners can read them in the office view; phones never pull them.
  ('invite', 'owner', 'none', null, null, false, 900),
  ('stripe_account', 'owner', 'none', null, null, false, 910),
  ('subscription', 'owner', 'none', null, null, false, 920),
  ('audit_log', 'owner', 'none', null, null, false, 930);

do $$
declare
  t app.sync_table;
  read_check text;
  write_check text;
begin
  for t in select * from app.sync_table order by sort_order loop
    read_check := format('app.is_%s(company_id)', t.read_role);
    execute format('grant select on public.%I to authenticated', t.table_name);
    execute format('create policy %I on public.%I for select to authenticated using (%s)',
      t.table_name || '_select', t.table_name, read_check);

    if t.write_role <> 'none' then
      write_check := format('app.is_%s(company_id)', t.write_role);
      if t.insert_columns is not null then
        execute format('grant insert (id, company_id, %s) on public.%I to authenticated',
          array_to_string(t.insert_columns, ', '), t.table_name);
        execute format(
          'create policy %I on public.%I for insert to authenticated with check (%s)',
          t.table_name || '_insert', t.table_name, write_check);
      end if;
      if t.update_columns is not null then
        execute format('grant update (%s) on public.%I to authenticated',
          array_to_string(t.update_columns, ', '), t.table_name);
        execute format(
          'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
          t.table_name || '_update', t.table_name, write_check, write_check);
      end if;
    end if;
  end loop;
end
$$;

-- Profiles are per user: you see your own and your teammates', and edit only your own.
grant select on public.profile to authenticated;
grant update (full_name, phone) on public.profile to authenticated;
create policy profile_select on public.profile for select to authenticated
  using (id = auth.uid() or app.shares_company(id));
create policy profile_update on public.profile for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Read by triggers that run as the calling user.
grant select on app.job_status_transition to authenticated;
