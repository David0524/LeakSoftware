-- Demo company, filled out for demonstrations (owner request, 2026-10-13): three more techs,
-- two dozen customers around Phoenix, and a schedule from last week through next week, two or
-- three jobs a day for each of the four techs. Earlier days are done (checklist checked, invoiced, paid; some with
-- a leak found), today has a job in progress, the rest are scheduled, and a few are not yet.
-- The names are made up. The addresses are real public places around Phoenix (parks,
-- libraries, civic buildings), never anyone's home, so maps and drive times are real.
-- Coordinates: © OpenStreetMap contributors (ODbL), looked up once on 2026-10-13.
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
  areas int[] := '{}';
  area int[];
  taken int[] := array[0, 0, 0, 0];
  r int;
  per int;
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
      ('Grace Holloway', 'homeowner', '(480) 555-0111', '5401 N Hayden Rd', 'Scottsdale', '85250', 'gunite_plaster', true, 33.51485, -111.90690),
      ('Carla Ortiz', 'homeowner', '(480) 555-0112', '22 S Delaware St', 'Chandler', '85225', 'vinyl', false, 33.30343, -111.83810),
      ('Desert Oasis Pool Service', 'pool_company', '(602) 555-0113', '1625 N Central Ave', 'Phoenix', '85004', 'gunite_plaster', true, 33.46674, -112.07210),
      ('Harold Kim', 'homeowner', '(480) 555-0114', '3500 S Rural Rd', 'Tempe', '85282', 'fiberglass', false, 33.39148, -111.92805),
      ('Sunrise Villas HOA', 'property_manager', '(623) 555-0115', '8401 W Monroe St', 'Peoria', '85345', 'gunite_plaster', false, 33.57600, -112.23981),
      ('Leah Nguyen', 'homeowner', '(480) 555-0116', '50 E Civic Center Dr', 'Gilbert', '85296', 'gunite_plaster', true, 33.33094, -111.78903),
      ('Marcus Bell', 'homeowner', '(623) 555-0117', '5959 W Brown St', 'Glendale', '85302', 'gunite_plaster', false, 33.57774, -112.18757),
      ('Tanya Brooks', 'homeowner', '(623) 555-0118', '9802 N 59th Ave', 'Glendale', '85302', 'vinyl', false, 33.57648, -112.18789),
      ('Omar Haddad', 'homeowner', '(480) 555-0119', '6401 E Lincoln Dr', 'Paradise Valley', '85253', 'gunite_plaster', true, 33.53068, -111.94257),
      ('Jenna Walsh', 'homeowner', '(480) 555-0120', '1 E Main St', 'Mesa', '85201', 'fiberglass', true, 33.41416, -111.83029),
      ('Victor Ruiz', 'homeowner', '(602) 555-0121', '455 N Galvin Pkwy', 'Phoenix', '85008', 'gunite_plaster', false, 33.44962, -111.94637),
      ('Hannah Price', 'homeowner', '(480) 555-0122', '15525 N Thompson Peak Pkwy', 'Scottsdale', '85260', 'gunite_plaster', true, 33.62953, -111.86320),
      ('Derek Simmons', 'homeowner', '(480) 555-0123', '6111 S All-America Way', 'Tempe', '85283', 'vinyl', false, 33.36677, -111.93513),
      ('Blue Wave Pools', 'pool_company', '(602) 555-0124', '2605 N 15th Ave', 'Phoenix', '85007', 'gunite_plaster', false, 33.47607, -112.09127),
      ('Sofia Martinez', 'homeowner', '(623) 555-0125', '1900 N Civic Square', 'Goodyear', '85395', 'gunite_plaster', true, 33.46719, -112.38532),
      ('Ray Thompson', 'homeowner', '(480) 555-0126', '1045 E Juniper Ave', 'Gilbert', '85234', 'fiberglass', false, 33.36072, -111.76809),
      ('Nina Patel', 'homeowner', '(480) 555-0127', '3839 N Drinkwater Blvd', 'Scottsdale', '85251', 'gunite_plaster', true, 33.49194, -111.92042),
      ('Paul Becker', 'homeowner', '(602) 555-0128', '2301 N Central Ave', 'Phoenix', '85004', 'gunite_plaster', false, 33.47160, -112.07220),
      ('Erin Coleman', 'homeowner', '(480) 555-0129', '7745 E Brown Rd', 'Mesa', '85207', 'vinyl', false, 33.43682, -111.66421),
      ('Andre Wallace', 'homeowner', '(623) 555-0130', '7700 W Arrowhead Towne Center', 'Glendale', '85308', 'gunite_plaster', true, 33.64214, -112.22529),
      ('Lisa Chang', 'homeowner', '(480) 555-0131', '745 E Germann Rd', 'Chandler', '85286', 'gunite_plaster', false, 33.27598, -111.82925),
      ('Copper Ridge Apartments', 'property_manager', '(480) 555-0132', '80 W Rio Salado Pkwy', 'Tempe', '85281', 'gunite_plaster', true, 33.43099, -111.95060),
      ('Kevin Morris', 'homeowner', '(623) 555-0133', '8866 W Thunderbird Rd', 'Peoria', '85381', 'fiberglass', true, 33.61527, -112.24462),
      ('Diana Foster', 'homeowner', '(480) 555-0134', '1201 N Galvin Pkwy', 'Phoenix', '85008', 'gunite_plaster', false, 33.45726, -111.95164)
    ) as v(name, kind, phone, street, city, zip, pool_type, spa, lat, lng)
  loop
    insert into public.customer (id, company_id, kind, name, phone, email)
    values (('00000000-0000-4000-8000-0000000c' || lpad((1000 + c.i)::text, 4, '0'))::uuid, co,
            c.kind, c.name, c.phone,
            lower(regexp_replace(c.name, '[^A-Za-z]+', '.', 'g')) || '@example.com')
    returning id into t;
    customers := customers || t;
    insert into public.property (company_id, customer_id, address_line1, city, state, postal_code,
                                 pool_type, has_pool, has_spa, diagram_shape, latitude, longitude,
                                 geocoded_address, location_source)
    values (co, t, c.street, c.city, 'AZ', c.zip, c.pool_type, true, c.spa,
            (array['rectangle', 'kidney', 'oval', 'freeform'])[1 + c.i % 4], c.lat, c.lng,
            c.street || ', ' || c.city || ', AZ ' || c.zip, 'manual')
    returning id into t;
    -- Each tech covers part of the valley: Tony central, Luis west, Jake southeast,
    -- Priya northeast.
    areas := areas || (case when c.lng < -112.15 then 2 when c.lng < -111.98 then 1
                            when c.lat > 33.42 then 4 else 3 end);
    properties := properties || t;
    spas := spas || c.spa;
    types := types || c.pool_type;
  end loop;

  -- Last week through next week: each tech has two or three jobs a weekday in their part of
  -- the valley, plus one Saturday morning job. Booked in the order customers called, not the
  -- best driving order, so Plan Route on the schedule has something to improve.
  today := (now() at time zone tz)::date;
  monday := date_trunc('week', today)::date;
  for d in -7..11 loop
    day := monday + d;
    continue when extract(isodow from day) = 7;
    for r in 1..4 loop
    continue when extract(isodow from day) = 6 and r > 1;
    per := case when extract(isodow from day) = 6 then 1 when (d + r) % 2 = 0 then 3 else 2 end;
    for slot in 1..per loop
      n := n + 1;
      select array_agg(i order by i) into area
      from generate_subscripts(areas, 1) as i where areas[i] = r;
      ci := coalesce(area[1 + taken[r] % greatest(cardinality(area), 1)],
                     1 + (n - 1) % array_length(customers, 1));
      taken[r] := taken[r] + 1;
      t := techs[r];
      start_at := (day + (array[time '08:00', time '11:00', time '14:00'])[slot])
                  at time zone tz;
      fee := case when spas[ci] then 45000 else 37500 end;
      insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                              assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                              route_order, arrival_fixed, fee_cents, intake, summary_notes)
      values (co, 'detection', properties[ci], customers[ci], 'scheduled', t,
              case when n % 5 = 0 then owner_id end, start_at, start_at + interval '2 hours 30 minutes',
              slot, n % 7 = 0, fee,
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
