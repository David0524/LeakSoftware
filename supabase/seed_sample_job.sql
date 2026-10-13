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
  if co is null then
    return;
  end if;
  if exists (select 1 from public.job where id = sample_job) then
    -- Seeded before verdicts existed (M8.5), the migration marked every checked item as not
    -- leaking. Give Return 3 and the light their real verdicts, once.
    update public.checklist_item_result r
    set outcome = case jc.label when 'Return 3' then 'leaking' else 'attention' end,
        location_text = case jc.label when 'Return 3'
                          then 'Under the deck, about 6 ft from the fitting' end
    from public.job_component jc
    where jc.id = r.job_component_id and jc.job_id = sample_job
      and jc.label in ('Return 3', 'Light 1') and r.status = 'inspected' and r.outcome = 'ok';
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

  -- Checklist: the M4 list, pinned by key and label so later changes to the default checklist
  -- (M8.5) leave this sample as it was. Types a company no longer has are skipped (companies
  -- created after M8.5 have no steps or equipment pad types). Return 3 leaks; the light needs
  -- attention; the main drain is not applicable.
  for c in
    select t.id, t.key, l.base, t.sort_order, g.n
    from (values ('skimmer', 'Skimmer', 2), ('return', 'Return', 4),
                 ('main_drain', 'Main drain', 1), ('light', 'Light', 1),
                 ('shell', 'Shell', 1), ('steps_benches', 'Steps and benches', 1),
                 ('spa', 'Spa', 1), ('equipment_pad', 'Equipment pad', 1))
         as l(key, base, count)
    join public.component_type t
      on t.company_id = co and t.key = l.key and t.deleted_at is null
    cross join lateral generate_series(1, l.count) as g(n)
    order by t.sort_order, g.n
  loop
    label := case when c.key in ('skimmer', 'return', 'main_drain', 'light')
                  then c.base || ' ' || c.n else c.base end;
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
        (company_id, job_id, job_component_id, status, method, outcome, location_text,
         inspected_at, inspected_by)
      values (co, sample_job, comp, 'inspected',
              case when c.key in ('skimmer', 'return') then 'Pressure test'
                   when c.key = 'light' then 'Dye test' else 'Visual' end,
              case when comp = r3 then 'leaking' when comp = light then 'attention'
                   else 'ok' end,
              case when comp = r3 then 'Under the deck, about 6 ft from the fitting' end,
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

-- M8.5 sample: a job entered the design partner's way. Two techs, his 27-item checklist in
-- sections, a detection fee, booking answers, one leaking skimmer seam repaired on site, and
-- an autofill that needs attention. Pinned to the default item keys so it is the same on
-- every database. Customer and address are made up.
do $$
declare
  partner_job uuid := '00000000-0000-4000-8000-00000000e002';
  cust uuid := '00000000-0000-4000-8000-00000000c005';
  prop uuid := '00000000-0000-4000-8000-00000000c006';
  owner_id uuid := '00000000-0000-4000-8000-00000000d001';
  tech_id uuid := '00000000-0000-4000-8000-00000000d002';
  co uuid;
  started timestamptz := date_trunc('day', now()) - interval '2 days' + interval '9 hours';
  c record;
  comp uuid;
  seam uuid;
begin
  select id into co from public.company where name = 'Demo Leak Co.' order by created_at limit 1;
  if co is null or exists (select 1 from public.job where id = partner_job) then
    return;
  end if;

  insert into public.customer (id, company_id, kind, name, email, phone, cc_emails)
  values (cust, co, 'homeowner', 'Riley Rivera', 'riley@example.com', '(480) 555-0188',
          '{rivera.family@example.com}')
  on conflict (id) do nothing;
  insert into public.property
    (id, company_id, customer_id, address_line1, city, state, postal_code,
     pool_type, has_pool, has_spa, diagram_shape)
  values
    (prop, co, cust, '41 Demo Lane', 'Mesa', 'AZ', '85201', 'gunite_plaster', true, true,
     'rectangle')
  on conflict (id) do nothing;

  insert into public.job
    (id, company_id, type, property_id, bill_to_customer_id, status, assigned_user_id,
     second_tech_id, scheduled_start, scheduled_end, started_at, summary_notes, fee_cents,
     intake, location_marked)
  values
    (partner_job, co, 'detection', prop, cust, 'in_progress', tech_id, owner_id,
     started, started + interval '3 hours', started,
     'Found the leak at the skimmer seam and sealed it with epoxy during the visit.',
     64900,
     '{"reason": ["Pool water level dropping"], "pool_size": "Normal (about 15x30 or 20x40)",
       "spa_size": "About 7 x 7 ft"}'::jsonb,
     true);

  for c in
    select t.id, t.key, t.name, t.answer, t.sort_order
    from app.config_default d
    cross join lateral jsonb_array_elements(d.rows) r
    join public.component_type t
      on t.company_id = co and t.key = r ->> 'key' and t.deleted_at is null
    where d.key = 'component_type'
    order by t.sort_order
  loop
    insert into public.job_component
      (company_id, job_id, component_type_id, instance_number, label, sort_order)
    values (co, partner_job, c.id, 1, c.name, c.sort_order * 1000 + 1)
    returning id into comp;
    if c.key = 'skimmer_seam' then seam := comp; end if;

    if c.key in ('vinyl_stretched', 'vinyl_tears') then
      -- Not a vinyl pool: not applicable, no reason needed.
      insert into public.checklist_item_result
        (company_id, job_id, job_component_id, status)
      values (co, partner_job, comp, 'excluded');
    else
      insert into public.checklist_item_result
        (company_id, job_id, job_component_id, status, method, outcome, location_text,
         inspected_at, inspected_by)
      values (co, partner_job, comp, 'inspected', null,
              case c.key when 'skimmer_seam' then 'leaking' when 'autofill' then 'attention'
                         else 'ok' end,
              case c.key when 'skimmer_seam' then 'Seam at the skimmer throat'
                         when 'autofill' then 'Valve weeps slightly' end,
              started + interval '1 hour', tech_id);
    end if;
  end loop;

  insert into public.finding
    (company_id, job_id, job_component_id, title, location_text, severity_key, status, notes)
  values
    (co, partner_job, seam, 'Skimmer seam leak', 'Seam at the skimmer throat', 'moderate',
     'repaired', 'Dye drew in at the seam. Sealed with underwater epoxy.');
end
$$;
