-- Fuller routes for demonstrations (owner request, 2026-10-13: "add more jobs to schedules,
-- I want to see what routes look like with multiple jobs"). Runs after
-- seed_demo_schedule.sql: 16 more customers at real public places around Phoenix, and from
-- today through the next week every tech has four or five 90-minute stops a weekday in
-- their part of the valley. The stops are booked in the order customers called, not the
-- best driving order, so Plan Route on the schedule has something to show.
-- Coordinates: © OpenStreetMap contributors (ODbL), looked up once on 2026-10-13.
--
-- Idempotent: does nothing once its first customer exists, or without the demo schedule.
-- Dates are relative to the day it runs.

do $$
declare
  co uuid;
  tz text;
  techs uuid[] := array['00000000-0000-4000-8000-00000000d002',
                        '00000000-0000-4000-8000-00000000d003',
                        '00000000-0000-4000-8000-00000000d004',
                        '00000000-0000-4000-8000-00000000d005']::uuid[];
  c record;
  t uuid;
  pools uuid[];
  owners uuid[];
  spas boolean[];
  types text[];
  areas int[];
  area int[];
  today date;
  day date;
  r int;
  k int;
  n int := 0;
  want int;
  have int;
  used uuid[];
  ci int;
  j uuid;
  slots time[] := array[time '08:00', time '09:45', time '11:30', time '13:15', time '15:00'];
  first_slot int;
begin
  select id, timezone into co, tz from public.company where name = 'Demo Leak Co.'
  order by created_at limit 1;
  if co is null
     or not exists (select 1 from public.customer where id = '00000000-0000-4000-8000-0000000c1001')
     or exists (select 1 from public.customer where id = '00000000-0000-4000-8000-0000000c2001') then
    return;
  end if;

  -- More customers and their pools (made-up names; real public places).
  for c in
    select row_number() over () as i, * from (values
      ('Rosa Delgado', '(623) 555-0141', '11465 W Civic Center Dr', 'Avondale', '85323', 'gunite_plaster', true, 33.44443, -112.30447),
      ('Brian Foley', '(623) 555-0142', '101 W Wigwam Blvd', 'Litchfield Park', '85340', 'gunite_plaster', false, 33.49332, -112.35965),
      ('Mesa Verde Townhomes', '(623) 555-0143', '16000 N Civic Center Plaza', 'Surprise', '85374', 'gunite_plaster', true, 33.62957, -112.36831),
      ('Alicia Romero', '(623) 555-0144', '9555 W Van Buren St', 'Tolleson', '85353', 'vinyl', false, 33.44957, -112.26625),
      ('Greg Hollis', '(602) 555-0145', '1700 W Washington St', 'Phoenix', '85007', 'gunite_plaster', false, 33.44812, -112.09780),
      ('Camelback Pool Care', '(602) 555-0146', '600 E Washington St', 'Phoenix', '85004', 'gunite_plaster', true, 33.44867, -112.06664),
      ('Megan Price', '(602) 555-0147', '1221 N Central Ave', 'Phoenix', '85004', 'fiberglass', false, 33.46244, -112.07317),
      ('Sam Ochoa', '(602) 555-0148', '67 W Culver St', 'Phoenix', '85003', 'gunite_plaster', true, 33.46246, -112.07468),
      ('Yvonne Carter', '(480) 555-0149', '3111 W Chandler Blvd', 'Chandler', '85226', 'gunite_plaster', true, 33.30183, -111.89972),
      ('Trevor Lang', '(480) 555-0150', '2330 W Rio Salado Pkwy', 'Mesa', '85201', 'vinyl', false, 33.43102, -111.88239),
      ('Priscilla Moore', '(480) 555-0151', '21802 S Ellsworth Rd', 'Queen Creek', '85142', 'gunite_plaster', true, 33.25026, -111.63548),
      ('Water Ranch HOA', '(480) 555-0152', '2757 E Guadalupe Rd', 'Gilbert', '85234', 'gunite_plaster', false, 33.36116, -111.73489),
      ('Daniel Reyes', '(480) 555-0153', '16705 E Avenue of the Fountains', 'Fountain Hills', '85268', 'gunite_plaster', true, 33.60467, -111.72122),
      ('Claire Whitman', '(480) 555-0154', '12621 N Frank Lloyd Wright Blvd', 'Scottsdale', '85259', 'fiberglass', true, 33.60469, -111.84205),
      ('Jordan Ellis', '(480) 555-0155', '7301 E Indian Bend Rd', 'Scottsdale', '85250', 'gunite_plaster', false, 33.53680, -111.92328),
      ('Monica Ruiz', '(480) 555-0156', '10101 N 90th St', 'Scottsdale', '85258', 'vinyl', true, 33.57775, -111.88459)
    ) as v(name, phone, street, city, zip, pool_type, spa, lat, lng)
  loop
    insert into public.customer (id, company_id, kind, name, phone, email)
    values (('00000000-0000-4000-8000-0000000c' || lpad((2000 + c.i)::text, 4, '0'))::uuid, co,
            case when c.name ~ '(HOA|Townhomes)$' then 'property_manager'
                 when c.name ~ 'Pool Care$' then 'pool_company' else 'homeowner' end,
            c.name, c.phone, lower(regexp_replace(c.name, '[^A-Za-z]+', '.', 'g')) || '@example.com')
    returning id into t;
    insert into public.property (company_id, customer_id, address_line1, city, state, postal_code,
                                 pool_type, has_pool, has_spa, diagram_shape, latitude, longitude,
                                 geocoded_address, location_source)
    values (co, t, c.street, c.city, 'AZ', c.zip, c.pool_type, true, c.spa,
            (array['rectangle', 'kidney', 'oval', 'freeform'])[1 + c.i % 4], c.lat, c.lng,
            c.street || ', ' || c.city || ', AZ ' || c.zip, 'manual');
  end loop;

  -- Every demo pool, with the tech whose part of the valley it's in (as in the schedule seed:
  -- Tony central, Luis west, Jake southeast, Priya northeast).
  select array_agg(p.id order by p.customer_id), array_agg(p.customer_id order by p.customer_id),
         array_agg(p.has_spa order by p.customer_id), array_agg(p.pool_type order by p.customer_id),
         array_agg(case when p.longitude < -112.15 then 2 when p.longitude < -111.98 then 1
                        when p.latitude > 33.42 then 4 else 3 end order by p.customer_id)
  into pools, owners, spas, types, areas
  from public.property p
  where p.company_id = co and p.latitude is not null
    and p.customer_id::text ~ '^00000000-0000-4000-8000-0000000c[12]';

  today := (now() at time zone tz)::date;
  for k in 0..9 loop
    day := today + k;
    continue when extract(isodow from day) in (6, 7);
    for r in 1..4 loop
      select array_agg(i order by i) into area
      from generate_subscripts(areas, 1) as i where areas[i] = r;
      continue when area is null;

      -- Top the day up to four or five stops, at pools not already on it.
      want := 4 + (k + r) % 2;
      select count(*), coalesce(array_agg(property_id), '{}') into have, used
      from public.job
      where company_id = co and assigned_user_id = techs[r] and deleted_at is null
        and status <> 'canceled'
        and (scheduled_start at time zone tz)::date = day;
      for c in
        select a.i from unnest(area) with ordinality as a(i, o)
        where not pools[a.i] = any (used)
        order by (a.o + k * 3 + r) % cardinality(area)
        limit greatest(want - have, 0)
      loop
        n := n + 1;
        ci := c.i;
        insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                                assigned_user_id, scheduled_start, scheduled_end, fee_cents,
                                intake, summary_notes)
        values (co, 'detection', pools[ci], owners[ci], 'scheduled', techs[r],
                (day + time '08:00') at time zone tz, (day + time '09:30') at time zone tz,
                case when spas[ci] then 45000 else 37500 end,
                jsonb_build_object('reason', jsonb_build_array(
                  (array['Pool water level dropping', 'Pool company told them to call',
                         'Spa water level dropping'])[1 + n % 3]),
                  'pool_size', 'Normal (about 15x30 or 20x40)'),
                (array['Losing about half an inch a day.', 'Auto-fill runs constantly.',
                       'Crack noticed near the steps.', 'New owners; want it checked.'])[1 + n % 4])
        returning id into j;
        -- The checklist, as planComponents builds it for this pool.
        insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                          label, sort_order)
        select co, j, ty.id, g.k,
               case when ty.allows_multiple and (g.k > 1 or ty.default_count > 1)
                    then ty.name || ' ' || g.k else ty.name end,
               ty.sort_order * 100 + g.k
        from public.component_type ty
        cross join lateral generate_series(
          1, case when ty.allows_multiple then greatest(ty.default_count, 1) else 1 end) as g(k)
        where ty.company_id = co and ty.active and ty.deleted_at is null
          and (ty.applies_to <> 'spa' or spas[ci])
          and (ty.applies_to_pool_type is null or ty.applies_to_pool_type = types[ci]);
        insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
        select co, j, jc.id, 'pending' from public.job_component jc where jc.job_id = j;
      end loop;

      -- Re-time the day's stops that haven't started: 90 minutes each, in booking order
      -- (not the best driving order), after any job already under way.
      select count(*) into first_slot
      from public.job
      where company_id = co and assigned_user_id = techs[r] and deleted_at is null
        and status not in ('scheduled', 'unscheduled', 'canceled')
        and (scheduled_start at time zone tz)::date = day;
      for c in
        select row_number() over (order by md5(id::text)) as o, id
        from public.job
        where company_id = co and assigned_user_id = techs[r] and deleted_at is null
          and status = 'scheduled'
          and (scheduled_start at time zone tz)::date = day
      loop
        update public.job
        set scheduled_start = (day + slots[least(first_slot + c.o, 5)]) at time zone tz,
            scheduled_end = (day + slots[least(first_slot + c.o, 5)] + interval '90 minutes')
                            at time zone tz,
            route_order = first_slot + c.o
        where id = c.id;
      end loop;
    end loop;
  end loop;
end
$$;
