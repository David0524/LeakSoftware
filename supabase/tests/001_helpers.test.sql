-- Shared test helpers. This file commits (no rollback) so later test files can use them.
-- Tests run against a fresh database each time (`supabase db reset` / `pnpm test:db`).
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.create_user(user_email text) returns uuid
language plpgsql as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (new_id, user_email, jsonb_build_object('full_name', split_part(user_email, '@', 1)));
  return new_id;
end
$$;

-- Switch the rest of the transaction to the `authenticated` role as this user.
-- Switch back with `reset role;`.
create or replace function tests.authenticate_as(user_id uuid) returns void
language plpgsql as $$
declare
  user_email text := (select email from auth.users where id = user_id);
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated', 'email', user_email)::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;

-- Run a statement and return how many rows it touched (RLS filters silently).
create or replace function tests.rows_affected(statement text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end
$$;

-- A company with an owner, a tech, default config, and at least one row in every
-- company-scoped table and storage bucket. Returns ids as jsonb.
create or replace function tests.make_company(label text) returns jsonb
language plpgsql as $$
declare
  c uuid; o uuid; ad uuid; t uuid; cust uuid; prop uuid; j uuid; jc uuid; tr uuid; f uuid;
  rep uuid; q uuid; qli uuid; inv uuid; conv uuid; sp uuid;
begin
  o := tests.create_user(label || '-owner@test.local');
  t := tests.create_user(label || '-tech@test.local');
  ad := tests.create_user(label || '-admin@test.local');
  insert into company (name) values ('Company ' || label) returning id into c;
  insert into membership (company_id, user_id, role)
    values (c, o, 'owner'), (c, ad, 'admin'), (c, t, 'tech');
  perform app.seed_company_defaults(c);

  insert into customer (company_id, name, email) values (c, 'Customer ' || label, 'c@example.com')
    returning id into cust;
  insert into property (company_id, customer_id, address_line1, has_spa)
    values (c, cust, '1 Test St', true) returning id into prop;
  insert into job (company_id, property_id, bill_to_customer_id, status, assigned_user_id)
    values (c, prop, cust, 'in_progress', t) returning id into j;
  insert into job_component (company_id, job_id, component_type_id, label)
    values (c, j, (select id from component_type where company_id = c and key = 'return'), 'Return 1')
    returning id into jc;
  insert into checklist_item_result (company_id, job_id, job_component_id, status, method)
    values (c, j, jc, 'inspected', 'Pressure test');
  insert into test_result (company_id, job_id, job_component_id, test_type_id, schema_version, data, outcome)
    values (c, j, jc, (select id from test_type where company_id = c and key = 'pressure'), 1,
            '{"line_name": "Return 1", "start_psi": 20, "end_psi": 12, "duration_min": 15}', 'fail')
    returning id into tr;
  insert into finding (company_id, job_id, job_component_id, title, severity_key, pin_x, pin_y)
    values (c, j, jc, 'Return 1 line break', 'major', 0.5, 0.5) returning id into f;
  insert into report (company_id, job_id, template_key) values (c, j, 'homeowner') returning id into rep;
  insert into quote (company_id, job_id, total_cents) values (c, j, 18500) returning id into q;
  insert into quote_line_item (company_id, quote_id, finding_id, description, unit_price_cents)
    values (c, q, f, 'Replace return fitting', 18500) returning id into qli;
  insert into invoice (company_id, job_id, quote_id, total_cents) values (c, j, q, 18500)
    returning id into inv;
  insert into invoice_line_item (company_id, invoice_id, description, unit_price_cents)
    values (c, inv, 'Replace return fitting', 18500);
  insert into payment (company_id, invoice_id, amount_cents, method) values (c, inv, 18500, 'card');
  insert into media (company_id, job_id, finding_id, test_result_id, kind, sha256)
    values (c, j, f, tr, 'photo', repeat('a', 64));
  insert into signature (company_id, job_id, purpose, signer_name, signed_at)
    values (c, j, 'inspection_ack', 'Customer ' || label, now());
  insert into share_link (company_id, job_id, report_id) values (c, j, rep);
  insert into message (company_id, job_id, channel, recipient, template)
    values (c, j, 'email', 'c@example.com', 'report');
  -- Paused, so it makes no visits here (200_maintenance tests the visits).
  insert into service_plan (company_id, customer_id, property_id, assigned_user_id, starts_on, paused)
    values (c, cust, prop, t, current_date, true) returning id into sp;
  insert into plan_cleaning (company_id, service_plan_id, component_type_id, every_months, next_due)
    values (c, sp, (select id from component_type where company_id = c and key = 'svc_filter_clean'),
            3, current_date);
  insert into chemical_reading (company_id, property_id, job_id, recorded_by, gallons, fc, ph)
    values (c, prop, j, t, 20000, 2.5, 7.6);
  insert into saved_report (company_id, name, sections)
    values (c, 'No leak found ' || label, '{"summary": "We found no leak."}');
  insert into team_profile (company_id, user_id, name, phone, emergency_name, emergency_phone)
    values (c, t, 'Tech ' || label, '(602) 555-0101', 'Pat ' || label, '(602) 555-0102');
  -- Company texting: a number per shop, made unique by the label.
  insert into phone_line (company_id, number)
    values (c, '+1555' || lpad((abs(hashtext(label)) % 10000000)::text, 7, '0'));
  insert into conversation (company_id, phone, customer_id)
    values (c, '+16025550100', cust) returning id into conv;
  insert into text_message (company_id, conversation_id, direction, body, status)
    values (c, conv, 'in', 'Is the tech on the way?', 'received');
  insert into call_log (company_id, conversation_id, direction, status)
    values (c, conv, 'in', 'missed');
  insert into stripe_account (company_id, stripe_account_id) values (c, 'acct_' || label);
  insert into subscription (company_id) values (c);
  insert into invite (company_id, email, role) values (c, 'new-' || label || '@test.local', 'tech');
  insert into audit_log (company_id, table_name, row_id, field) values (c, 'job', j, 'status');

  insert into storage.objects (bucket_id, name) values
    ('media', c || '/' || j || '/photo.jpg'),
    ('company-assets', c || '/logo.png'),
    ('documents', c || '/' || j || '/report.pdf'),
    ('texts', c || '/' || conv || '/picture.jpg');

  return jsonb_build_object('company', c, 'owner', o, 'admin', ad, 'tech', t, 'customer', cust,
    'property', prop, 'job', j, 'report', rep, 'quote', q, 'invoice', inv);
end
$$;

-- Access checks for one table, run as the current (authenticated) user.
-- Expectations come from app.sync_table, the same registry that generated the policies,
-- plus fixed rules: other companies are never visible or writable.
create or replace function tests.check_table_access(
  tbl text, my_company uuid, other_company uuid, my_role text)
returns setof text
language plpgsql as $$
declare
  t app.sync_table;
  can_read boolean;
  can_write boolean;
  n bigint;
  col text;
  cols text;
  label text := format('%s (%s)', tbl, my_role);
begin
  select * into strict t from app.sync_table where table_name = tbl;
  -- 'manager' is an owner or an admin.
  can_read := t.read_role = 'member' or my_role = 'owner'
    or (t.read_role = 'manager' and my_role = 'admin');
  can_write := t.write_role = 'member' or (t.write_role = 'owner' and my_role = 'owner')
    or (t.write_role = 'manager' and my_role in ('owner', 'admin'));

  execute format('select count(*) from public.%I where company_id = $1', tbl)
    into n using my_company;
  return next ok(case when can_read then n > 0 else n = 0 end,
    format('%s: %s own company rows', label, case when can_read then 'reads' else 'cannot read' end));

  execute format('select count(*) from public.%I where company_id = $1', tbl)
    into n using other_company;
  return next is(n, 0::bigint, format('%s: cannot read other company rows', label));

  if t.update_columns is not null then
    col := t.update_columns[1];
    execute format(
      'with u as (update public.%I set %I = %I where company_id = $1 returning 1) select count(*) from u',
      tbl, col, col) into n using other_company;
    return next is(n, 0::bigint, format('%s: cannot update other company rows', label));

    execute format(
      'with u as (update public.%I set %I = %I where company_id = $1 returning 1) select count(*) from u',
      tbl, col, col) into n using my_company;
    return next ok(case when can_write then n > 0 else n = 0 end,
      format('%s: %s own company rows', label, case when can_write then 'updates' else 'cannot update' end));
  end if;

  if t.insert_columns is not null and not can_read then
    -- Nothing to copy from (a manager-only table, read as a tech): row security refuses the
    -- insert before any other column is checked.
    return next throws_ok(
      format('insert into public.%I (id, company_id) values (gen_random_uuid(), %L)', tbl, other_company),
      '42501', null, format('%s: cannot insert into other company', label));
    return next throws_ok(
      format('insert into public.%I (id, company_id) values (gen_random_uuid(), %L)', tbl, my_company),
      '42501', null, format('%s: cannot insert into own company', label));
  elsif t.insert_columns is not null then
    select string_agg(format('%I', c), ', ') into cols from unnest(t.insert_columns) c;
    return next throws_ok(
      format('insert into public.%I (id, company_id, %s) select gen_random_uuid(), %L, %s from public.%I where company_id = %L limit 1',
        tbl, cols, other_company, cols, tbl, my_company),
      '42501', null, format('%s: cannot insert into other company', label));
    if not can_write then
      return next throws_ok(
        format('insert into public.%I (id, company_id, %s) select gen_random_uuid(), %L, %s from public.%I where company_id = %L limit 1',
          tbl, cols, my_company, cols, tbl, my_company),
        '42501', null, format('%s: cannot insert into own company', label));
    end if;
  end if;
end
$$;

grant execute on all functions in schema tests to authenticated;

select plan(1);
select pass('test helpers installed');
select * from finish();
