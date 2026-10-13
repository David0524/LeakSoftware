-- Demo company, filled out for demonstrations (owner request, 2026-10-13): three more techs,
-- two dozen customers around Phoenix, and a schedule from last week through next week, three jobs a day
-- across the four techs. Earlier days are done (checklist checked, invoiced, paid; some with
-- a leak found), today has a job in progress, the rest are scheduled, and a few are not yet.
-- All names and addresses are made up.
--
-- Idempotent: does nothing once the first demo customer exists. Runs after seed.sql and
-- seed_sample_job.sql locally and in CI, and on the dev project through
-- `pnpm db:deploy -- --seed`. Dates are relative to the day it runs.
--
-- Demo sign-ins added (password leakbook-demo):
--   luis@demo.leakbook.test, jake@demo.leakbook.test, priya@demo.leakbook.test   techs

do $$
declare
  co uuid;
  tz text;
  owner_id uuid := '00000000-0000-4000-8000-00000000d001';
  techs uuid[] := array['00000000-0000-4000-8000-00000000d002',
                        '00000000-0000-4000-8000-00000000d003',
                        '00000000-0000-4000-8000-00000000d004',
                        '00000000-0000-4000-8000-00000000d005']::uuid[];
  u record;
  c record;
  customers uuid[] := '{}';
  properties uuid[] := '{}';
  spas boolean[] := '{}';
  types text[] := '{}';
  today date;
  monday date;
  d int;
  slot int;
  n int := 0;
  day date;
  start_at timestamptz;
  j uuid;
  ci int;
  t uuid;
  comp uuid;
  leak uuid;
  fee int;
  inv uuid;
  st text;
begin
  select id, timezone into co, tz from public.company where name = 'Demo Leak Co.'
  order by created_at limit 1;
  if co is null or exists (select 1 from public.customer
                           where id = '00000000-0000-4000-8000-0000000c1001') then
    return;
  end if;

  -- Three more techs.
  for u in
    select * from (values
      (techs[2], 'luis@demo.leakbook.test', 'Luis Ramirez'),
      (techs[3], 'jake@demo.leakbook.test', 'Jake Turner'),
      (techs[4], 'priya@demo.leakbook.test', 'Priya Shah')
    ) as v(id, email, full_name)
  loop
    if not exists (select 1 from auth.users where id = u.id) then
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
    end if;
    insert into public.membership (company_id, user_id, role) values (co, u.id, 'tech')
    on conflict do nothing;
  end loop;

  -- Customers and their pools.
  for c in
    select row_number() over () as i, * from (values
      ('Grace Holloway', 'homeowner', '(480) 555-0111', '7120 E Cactus Rd', 'Scottsdale', '85254', 'gunite_plaster', true),
      ('Carla Ortiz', 'homeowner', '(480) 555-0112', '2245 W Ivanhoe St', 'Chandler', '85224', 'vinyl', false),
      ('Desert Oasis Pool Service', 'pool_company', '(602) 555-0113', '4410 N 32nd St', 'Phoenix', '85018', 'gunite_plaster', true),
      ('Harold Kim', 'homeowner', '(480) 555-0114', '1618 E Lemon St', 'Tempe', '85281', 'fiberglass', false),
      ('Sunrise Villas HOA', 'property_manager', '(623) 555-0115', '9800 W Sunrise Blvd', 'Peoria', '85382', 'gunite_plaster', false),
      ('Leah Nguyen', 'homeowner', '(480) 555-0116', '3352 E Page Ave', 'Gilbert', '85234', 'gunite_plaster', true),
      ('Marcus Bell', 'homeowner', '(623) 555-0117', '8821 W Rose Ln', 'Glendale', '85305', 'gunite_plaster', false),
      ('Tanya Brooks', 'homeowner', '(623) 555-0118', '6015 W Cholla St', 'Glendale', '85304', 'vinyl', false),
      ('Omar Haddad', 'homeowner', '(480) 555-0119', '5700 E Doubletree Ranch Rd', 'Paradise Valley', '85253', 'gunite_plaster', true),
      ('Jenna Walsh', 'homeowner', '(480) 555-0120', '1934 N Lindsay Rd', 'Mesa', '85213', 'fiberglass', true),
      ('Victor Ruiz', 'homeowner', '(602) 555-0121', '2810 E Highland Ave', 'Phoenix', '85016', 'gunite_plaster', false),
      ('Hannah Price', 'homeowner', '(480) 555-0122', '10450 E Cholla St', 'Scottsdale', '85259', 'gunite_plaster', true),
      ('Derek Simmons', 'homeowner', '(480) 555-0123', '4127 S Ash Ave', 'Tempe', '85282', 'vinyl', false),
      ('Blue Wave Pools', 'pool_company', '(602) 555-0124', '1550 E Bethany Home Rd', 'Phoenix', '85014', 'gunite_plaster', false),
      ('Sofia Martinez', 'homeowner', '(623) 555-0125', '14322 W Indianola Ave', 'Goodyear', '85395', 'gunite_plaster', true),
      ('Ray Thompson', 'homeowner', '(480) 555-0126', '2968 E Elgin St', 'Gilbert', '85295', 'fiberglass', false),
      ('Nina Patel', 'homeowner', '(480) 555-0127', '7631 E Thunderbird Rd', 'Scottsdale', '85260', 'gunite_plaster', true),
      ('Paul Becker', 'homeowner', '(602) 555-0128', '418 W Coronado Rd', 'Phoenix', '85003', 'gunite_plaster', false),
      ('Erin Coleman', 'homeowner', '(480) 555-0129', '5214 E Juanita Ave', 'Mesa', '85206', 'vinyl', false),
      ('Andre Wallace', 'homeowner', '(623) 555-0130', '20015 N 67th Ave', 'Glendale', '85308', 'gunite_plaster', true),
      ('Lisa Chang', 'homeowner', '(480) 555-0131', '1342 W Elliot Rd', 'Chandler', '85224', 'gunite_plaster', false),
      ('Copper Ridge Apartments', 'property_manager', '(480) 555-0132', '2200 S Rural Rd', 'Tempe', '85282', 'gunite_plaster', true),
      ('Kevin Morris', 'homeowner', '(623) 555-0133', '7709 W Pinnacle Peak Rd', 'Peoria', '85383', 'fiberglass', true),
      ('Diana Foster', 'homeowner', '(480) 555-0134', '3915 E Camelback Rd', 'Phoenix', '85018', 'gunite_plaster', false)
    ) as v(name, kind, phone, street, city, zip, pool_type, spa)
  loop
    insert into public.customer (id, company_id, kind, name, phone, email)
    values (('00000000-0000-4000-8000-0000000c' || lpad((1000 + c.i)::text, 4, '0'))::uuid, co,
            c.kind, c.name, c.phone,
            lower(regexp_replace(c.name, '[^A-Za-z]+', '.', 'g')) || '@example.com')
    returning id into t;
    customers := customers || t;
    insert into public.property (company_id, customer_id, address_line1, city, state, postal_code,
                                 pool_type, has_pool, has_spa, diagram_shape)
    values (co, t, c.street, c.city, 'AZ', c.zip, c.pool_type, true, c.spa,
            (array['rectangle', 'kidney', 'oval', 'freeform'])[1 + c.i % 4])
    returning id into t;
    properties := properties || t;
    spas := spas || c.spa;
    types := types || c.pool_type;
  end loop;

  -- Last week through next week: Monday to Friday, three jobs a day, plus Saturday mornings.
  today := (now() at time zone tz)::date;
  monday := date_trunc('week', today)::date;
  for d in -7..11 loop
    day := monday + d;
    continue when extract(isodow from day) = 7;
    for slot in 1..(case when extract(isodow from day) = 6 then 1 else 3 end) loop
      n := n + 1;
      ci := 1 + (n - 1) % array_length(customers, 1);
      t := techs[1 + (n + d) % 4];
      start_at := (day + (array[time '08:00', time '11:00', time '14:00'])[slot])
                  at time zone tz;
      fee := case when spas[ci] then 45000 else 37500 end;
      insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                              assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                              fee_cents, intake, summary_notes)
      values (co, 'detection', properties[ci], customers[ci], 'scheduled', t,
              case when n % 5 = 0 then owner_id end, start_at, start_at + interval '2 hours 30 minutes',
              fee,
              jsonb_build_object('reason', jsonb_build_array(
                (array['Pool water level dropping', 'Pool company told them to call',
                       'Spa water level dropping'])[1 + n % 3]),
                'pool_size', 'Normal (about 15x30 or 20x40)'),
              (array['Losing about an inch a day.', 'Water bill went up last month.',
                     'Pool company saw a wet spot by the equipment pad.',
                     'Level drops faster when the pump runs.'])[1 + n % 4])
      returning id into j;

      -- The checklist, as planComponents builds it for this pool.
      leak := null;
      for c in
        select ty.id, ty.key, ty.name, ty.allows_multiple, ty.default_count, ty.sort_order, g.k
        from public.component_type ty
        cross join lateral generate_series(
          1, case when ty.allows_multiple then greatest(ty.default_count, 1) else 1 end) as g(k)
        where ty.company_id = co and ty.active and ty.deleted_at is null
          and (ty.applies_to <> 'spa' or spas[ci])
          and (ty.applies_to_pool_type is null or ty.applies_to_pool_type = types[ci])
        order by ty.sort_order, g.k
      loop
        insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                          label, sort_order)
        values (co, j, c.id, c.k,
                case when c.allows_multiple and (c.k > 1 or c.default_count > 1)
                     then c.name || ' ' || c.k else c.name end,
                c.sort_order * 100 + c.k)
        returning id into comp;
        if day < today then
          insert into public.checklist_item_result (company_id, job_id, job_component_id, status,
                                                    outcome, location_text, inspected_at,
                                                    inspected_by)
          values (co, j, comp, 'inspected',
                  case when c.key = 'skimmer_seam' and n % 3 = 0 then 'leaking' else 'ok' end,
                  case when c.key = 'skimmer_seam' and n % 3 = 0 then 'Seam at the skimmer throat' end,
                  start_at + interval '1 hour', t);
          if c.key = 'skimmer_seam' and n % 3 = 0 then leak := comp; end if;
        else
          insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
          values (co, j, comp, 'pending');
        end if;
      end loop;

      if day < today then
        -- Done: found (sometimes) and repaired on site, invoiced, paid by card.
        if leak is not null then
          insert into public.finding (company_id, job_id, job_component_id, title, location_text,
                                      severity_key, status, notes)
          values (co, j, leak, 'Skimmer seam leak', 'Seam at the skimmer throat', 'moderate',
                  'repaired', 'Dye drew in at the seam. Sealed with underwater epoxy.');
        end if;
        update public.job set status = 'in_progress', started_at = start_at where id = j;
        update public.job set status = 'invoiced', completed_at = start_at + interval '2 hours'
        where id = j;
        insert into public.invoice (company_id, job_id, status, subtotal_cents, total_cents,
                                    amount_paid_cents, due_date, sent_at, paid_at)
        values (co, j, 'paid', fee, fee, fee, day, start_at + interval '2 hours',
                start_at + interval '3 hours')
        returning id into inv;
        -- Written as the server, like send_invoice: the invoice is already paid.
        perform set_config('app.invoice_server', 'on', true);
        insert into public.invoice_line_item (company_id, invoice_id, description,
                                              unit_price_cents, taxable)
        values (co, inv, 'Leak detection', fee, false);
        perform set_config('app.invoice_server', 'off', true);
        insert into public.payment (company_id, invoice_id, amount_cents, method, status, paid_at)
        values (co, inv, fee, 'card', 'succeeded', start_at + interval '3 hours');
        insert into public.share_link (company_id, job_id, invoice_id) values (co, j, inv);
        update public.job set status = 'paid' where id = j;
      elsif day = today and slot = 1 then
        update public.job set status = 'in_progress', started_at = start_at where id = j;
      end if;
    end loop;
  end loop;

  -- Booked but not scheduled yet.
  for slot in 1..3 loop
    ci := array_length(customers, 1) - slot + 1;
    insert into public.job (company_id, type, property_id, bill_to_customer_id, status, fee_cents,
                            summary_notes)
    values (co, 'detection', properties[ci], customers[ci], 'unscheduled',
            case when spas[ci] then 45000 else 37500 end,
            'Called today. Wants the first opening next week.');
  end loop;
end
$$;
