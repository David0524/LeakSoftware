-- Reading bounds (owner, 2026-10-20): new shops' test types carry each number field's lowest
-- and highest believable reading, and existing shops get them without losing their own.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
create temp view ids as select (a ->> 'company')::uuid as ca, (b ->> 'company')::uuid as cb from fx;

create function pg_temp.field(company uuid, type_key text, field_key text) returns jsonb
language sql as $$
  select f from test_type t, jsonb_array_elements(t.field_schema -> 'fields') f
  where t.company_id = company and t.key = type_key and f ->> 'key' = field_key
$$;

-- New shops.
select is(pg_temp.field((select ca from ids), 'pressure', 'start_psi') -> 'min', '0'::jsonb,
  'a new shop''s start pressure has a minimum');
select is(pg_temp.field((select ca from ids), 'pressure', 'start_psi') -> 'max', '150'::jsonb,
  'and a maximum of 150 PSI');
select is(pg_temp.field((select ca from ids), 'pressure', 'duration_min') -> 'max', '1440'::jsonb,
  'duration up to a day');
select is(pg_temp.field((select ca from ids), 'bucket', 'pool_end_in') -> 'max', '24'::jsonb,
  'bucket levels up to 24 in');
select is(pg_temp.field((select ca from ids), 'bucket', 'duration_hours') -> 'max', '168'::jsonb,
  'bucket duration up to a week');
select is(pg_temp.field((select ca from ids), 'pressure', 'line_name') ? 'max', false,
  'text fields get no bounds');
select is((select count(*)::int from test_type t, jsonb_array_elements(t.field_schema -> 'fields') f
  where t.company_id = (select ca from ids) and f ->> 'type' = 'number'
    and not (f ? 'min' and f ? 'max')), 0, 'every default number field has bounds');
select is((select field_schema -> 'options' from test_type
  where company_id = (select ca from ids) and key = 'pressure'),
  '{"pass_max_drop_psi": 0, "min_duration_min": 15}'::jsonb, 'calculator settings are kept');

-- Existing shops: shop b as it was before the bounds, with one bound of its own and a custom
-- test type that happens to share a field key.
update test_type t set field_schema = jsonb_set(t.field_schema, '{fields}', (
  select jsonb_agg(f - 'min' - 'max' order by ord)
  from jsonb_array_elements(t.field_schema -> 'fields') with ordinality as e(f, ord)))
where company_id = (select cb from ids);
update test_type t set field_schema = jsonb_set(t.field_schema, '{fields}', (
  select jsonb_agg(case when f ->> 'key' = 'end_psi' then f || '{"max": 60}' else f end order by ord)
  from jsonb_array_elements(t.field_schema -> 'fields') with ordinality as e(f, ord)))
where company_id = (select cb from ids) and key = 'pressure';
insert into test_type (company_id, key, name, field_schema, result_options, sort_order)
values ((select cb from ids), 'thermal', 'Thermal', '{"fields": [{"key": "start_psi", "label": "Start pressure", "type": "number"}]}',
  '{pass,fail}', 50);

select ok(app.add_test_reading_bounds() > 0, 'the backfill updates existing shops');
select is(pg_temp.field((select cb from ids), 'pressure', 'start_psi'),
  '{"key": "start_psi", "label": "Start pressure", "type": "number", "unit": "PSI", "required": true, "min": 0, "max": 150}'::jsonb,
  'an existing shop''s start pressure gets the bounds');
select is(pg_temp.field((select cb from ids), 'pressure', 'end_psi') - 'label' - 'key' - 'type' - 'unit' - 'required',
  '{"max": 60}'::jsonb, 'a bound the shop set is kept as is');
select is(pg_temp.field((select cb from ids), 'bucket', 'bucket_start_in') -> 'max', '24'::jsonb,
  'bucket fields too');
select is(pg_temp.field((select cb from ids), 'thermal', 'start_psi') ? 'min', false,
  'a shop''s own test type is left alone');
select is(app.add_test_reading_bounds(), 0, 'running it again changes nothing');
select is(pg_temp.field((select ca from ids), 'pressure', 'start_psi') -> 'max', '150'::jsonb,
  'other shops are unchanged');

select * from finish();
rollback;
