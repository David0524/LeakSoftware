-- Sample inspection on the demo company: the M4 sample job, used by the office view and its
-- Playwright tests. Idempotent: does nothing if the job already exists or the demo company
-- is missing. Runs after seed.sql locally and in CI, and on the hosted dev project through
-- `pnpm db:deploy -- --seed`.

do $$
declare
  sample_job uuid := '00000000-0000-4000-8000-00000000e001';
  cust uuid := '00000000-0000-4000-8000-00000000c003';
  prop uuid := '00000000-0000-4000-8000-00000000c004';
  tech_id uuid := '00000000-0000-4000-8000-00000000d002';
  co uuid;
  started timestamptz := date_trunc('day', now()) - interval '1 day' + interval '8 hours';
  c record;
  comp uuid;
  r3 uuid;
  light uuid;
  label text;
  n int;
begin
  select id into co from public.company where name = 'Demo Leak Co.' order by created_at limit 1;
  if co is null or exists (select 1 from public.job where id = sample_job) then
    return;
  end if;

  insert into public.customer (id, company_id, kind, name, email, phone)
  values (cust, co, 'homeowner', 'Sam Sample', 'sam@example.com', '(480) 555-0123')
  on conflict (id) do nothing;
  insert into public.property
    (id, company_id, customer_id, address_line1, city, state, postal_code,
     pool_type, has_pool, has_spa, diagram_shape, approx_gallons, access_notes)
  values
    (prop, co, cust, '9 Sample Way', 'Scottsdale', 'AZ', '85251',
     'gunite_plaster', true, true, 'kidney', 20000, 'Front gate unlocked.')
  on conflict (id) do nothing;

  insert into public.job
    (id, company_id, type, property_id, bill_to_customer_id, status, assigned_user_id,
     scheduled_start, scheduled_end, started_at, summary_notes)
  values
    (sample_job, co, 'detection', prop, cust, 'in_progress', tech_id,
     started, started + interval '3 hours', started,
     'Customer reports losing about an inch a day. Return 3 line fails pressure test.');

  -- Checklist: the default components plus a second skimmer and returns 3 and 4.
  for c in
    select t.id, t.key, t.name, t.sort_order, g.n
    from public.component_type t
    cross join lateral generate_series(
      1, case t.key when 'skimmer' then 2 when 'return' then 4
                    else greatest(t.default_count, 1) end) as g(n)
    where t.company_id = co and t.active and t.deleted_at is null
    order by t.sort_order, g.n
  loop
    label := case when c.key in ('skimmer', 'return', 'main_drain', 'light')
                  then c.name || ' ' || c.n else c.name end;
    insert into public.job_component
      (company_id, job_id, component_type_id, instance_number, label, sort_order)
    values (co, sample_job, c.id, c.n, label, c.sort_order * 1000 + c.n)
    returning id into comp;
    if c.key = 'return' and c.n = 3 then r3 := comp; end if;
    if c.key = 'light' and c.n = 1 then light := comp; end if;

    if c.key = 'main_drain' then
      insert into public.checklist_item_result
        (company_id, job_id, job_component_id, status, exclusion_reason, notes)
      values (co, sample_job, comp, 'excluded', 'No diver on site', 'Water too cloudy to see.');
    else
      insert into public.checklist_item_result
        (company_id, job_id, job_component_id, status, method, inspected_at, inspected_by)
      values (co, sample_job, comp, 'inspected',
              case when c.key in ('skimmer', 'return') then 'Pressure test'
                   when c.key = 'light' then 'Dye test' else 'Visual' end,
              started + interval '1 hour', tech_id);
    end if;
  end loop;

  -- Tests: pressure on each line (Return 3 fails), a bucket test, a dye test.
  n := 0;
  for c in
    select jc.id, jc.label from public.job_component jc
    join public.component_type t on t.id = jc.component_type_id
    where jc.job_id = sample_job and t.key in ('skimmer', 'return')
    order by jc.sort_order
  loop
    n := n + 1;
    insert into public.test_result
      (company_id, job_id, job_component_id, test_type_id, schema_version, data, computed,
       outcome, performed_at)
    select co, sample_job, c.id, tt.id, tt.schema_version,
           jsonb_build_object('line_name', c.label, 'start_psi', 20,
                              'end_psi', case when c.id = r3 then 12 else 20 end,
                              'duration_min', 15),
           jsonb_build_object('drop_psi', case when c.id = r3 then 8 else 0 end,
                              'drop_psi_per_min', case when c.id = r3 then 0.533 else 0 end),
           case when c.id = r3 then 'fail' else 'pass' end,
           started + interval '1 hour' + n * interval '10 minutes'
    from public.test_type tt where tt.company_id = co and tt.key = 'pressure';
  end loop;

  insert into public.test_result
    (company_id, job_id, test_type_id, schema_version, data, computed, outcome, performed_at)
  select co, sample_job, tt.id, tt.schema_version,
         '{"pool_start_in": 10, "pool_end_in": 9.25, "bucket_start_in": 10,
           "bucket_end_in": 9.94, "duration_hours": 24}'::jsonb,
         '{"pool_loss_in": 0.75, "bucket_loss_in": 0.06, "unexplained_loss_in": 0.69,
           "unexplained_in_per_day": 0.69}'::jsonb,
         'fail', started - interval '1 day'
  from public.test_type tt where tt.company_id = co and tt.key = 'bucket';

  insert into public.test_result
    (company_id, job_id, job_component_id, test_type_id, schema_version, data, outcome,
     performed_at, notes)
  select co, sample_job, r3, tt.id, tt.schema_version,
         '{"location": "Return 3 fitting", "observation": "Dye drawn in (leak)"}'::jsonb,
         'fail', started + interval '2 hours', 'Steady draw at the fitting.'
  from public.test_type tt where tt.company_id = co and tt.key = 'dye';

  insert into public.finding
    (company_id, job_id, job_component_id, title, location_text, severity_key, pin_x, pin_y,
     status, notes)
  values
    (co, sample_job, r3, 'Return 3 line break', 'Under the deck, about 6 ft from the fitting',
     'major', 0.42, 0.18, 'open', 'Lost 8 PSI in 15 minutes. Dye confirms at the fitting.'),
    (co, sample_job, light, 'Light niche seal worn', 'Pool light niche', 'minor', 0.81, 0.66,
     'monitor', 'No draw today; recheck at next visit.');
end
$$;
