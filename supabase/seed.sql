-- Local development seed (runs on `supabase db reset` and in `pnpm test:db`; never in production).
--
-- Demo sign-ins (password for both: leakbook-demo):
--   owner@demo.leakbook.test   owner of "Demo Leak Co."
--   tech@demo.leakbook.test    tech at "Demo Leak Co."

do $$
declare
  owner_id uuid := '00000000-0000-4000-8000-00000000d001';
  tech_id uuid := '00000000-0000-4000-8000-00000000d002';
  demo_company uuid;
  cust uuid := '00000000-0000-4000-8000-00000000c001';
  prop uuid := '00000000-0000-4000-8000-00000000c002';
  u record;
begin
  for u in
    select * from (values
      (owner_id, 'owner@demo.leakbook.test', 'Dana Owner'),
      (tech_id, 'tech@demo.leakbook.test', 'Tony Tech')
    ) as v(id, email, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('leakbook-demo', extensions.gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', u.full_name),
      now(), now(), '', '', '', '');

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id::text, u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now());
  end loop;

  -- Sign up the owner the same way the app does.
  perform set_config('request.jwt.claims',
    json_build_object('sub', owner_id, 'role', 'authenticated',
                      'email', 'owner@demo.leakbook.test')::text, true);
  demo_company := public.create_company('Demo Leak Co.', 'America/Phoenix');
  perform set_config('request.jwt.claims', '', true);

  update public.company
  set phone = '(602) 555-0142', email = 'office@demo.leakbook.test',
      address_line1 = '1200 W Example Rd', city = 'Phoenix', state = 'AZ', postal_code = '85001'
  where id = demo_company;

  insert into public.membership (company_id, user_id, role) values (demo_company, tech_id, 'tech');

  insert into public.customer (id, company_id, kind, name, email, phone)
  values (cust, demo_company, 'homeowner', 'Maria Alvarez', 'maria@example.com', '(602) 555-0199');

  insert into public.property
    (id, company_id, customer_id, address_line1, city, state, postal_code,
     pool_type, has_pool, has_spa, diagram_shape, approx_gallons, access_notes)
  values
    (prop, demo_company, cust, '1423 Palm Ct', 'Phoenix', 'AZ', '85016',
     'gunite_plaster', true, true, 'kidney', 18000, 'Side gate code 4821. Dog in yard.');

  insert into public.job
    (company_id, type, property_id, bill_to_customer_id, status, assigned_user_id,
     scheduled_start, scheduled_end)
  values
    (demo_company, 'detection', prop, cust, 'scheduled', tech_id,
     ((now() at time zone 'America/Phoenix')::date + 1 + time '09:00') at time zone 'America/Phoenix',
     ((now() at time zone 'America/Phoenix')::date + 1 + time '11:00') at time zone 'America/Phoenix');
end
$$;
