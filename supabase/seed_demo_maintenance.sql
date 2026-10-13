-- Regular pool cleaning for demonstrations (owner request, 2026-10-13): up to eight demo
-- customers in each tech's area get a maintenance plan with that tech,
-- spread over the weekdays, mostly weekly, 30 minutes, $95 to $145 a visit. Saving a plan
-- makes its visits for the next four weeks (app.plan_visits), after each tech's other work
-- that day. Runs after seed_demo_routes.sql.
--
-- Idempotent: does nothing once the demo shop has a plan, or without the demo customers.

do $$
declare
  co uuid;
  tz text;
  techs uuid[] := array['00000000-0000-4000-8000-00000000d002',
                        '00000000-0000-4000-8000-00000000d003',
                        '00000000-0000-4000-8000-00000000d004',
                        '00000000-0000-4000-8000-00000000d005']::uuid[];
  monday date;
  p record;
  n int := 0;
begin
  select id, timezone into co, tz from public.company where name = 'Demo Leak Co.'
  order by created_at limit 1;
  if co is null
     or not exists (select 1 from public.customer where id = '00000000-0000-4000-8000-0000000c1001')
     or exists (select 1 from public.service_plan where company_id = co) then
    return;
  end if;
  monday := date_trunc('week', (now() at time zone tz)::date)::date;

  -- Up to eight pools in each tech's area (Tony central, Luis west, Jake southeast, Priya
  -- northeast), the same rule as the schedule seeds.
  for p in
    select pr.id as property_id, pr.customer_id,
           row_number() over (partition by a.area order by pr.customer_id) as k, a.area
    from public.property pr
    cross join lateral (select case when pr.longitude < -112.15 then 2
                                    when pr.longitude < -111.98 then 1
                                    when pr.latitude > 33.42 then 4 else 3 end as area) a
    where pr.company_id = co and pr.latitude is not null
      and pr.customer_id::text ~ '^00000000-0000-4000-8000-0000000c[12]'
  loop
    continue when p.k > 8;
    n := n + 1;
    insert into public.service_plan (company_id, customer_id, property_id, assigned_user_id,
                                     starts_on, interval_weeks, duration_minutes, price_cents,
                                     notes)
    values (co, p.customer_id, p.property_id, techs[p.area],
            monday + ((n + p.area) % 5),
            case when n % 4 = 0 then 2 else 1 end,
            30,
            (array[9500, 12000, 14500])[1 + n % 3],
            (array['Gate code 4417.', 'Dog in the yard; latch the gate.',
                   'Salt pool. Check the cell.', null])[1 + n % 4]);
  end loop;
end
$$;
