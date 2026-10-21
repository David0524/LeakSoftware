-- Reading bounds (owner, 2026-10-20: "Pressure readings: Please fix"). A test's number fields
-- get the lowest and highest believable reading as config (field_schema.fields[].min / max), and
-- every form refuses a reading outside them (validateTestData in packages/core, ported to the
-- Swift app), so a typo like 1e23 PSI can't be saved. First drafts, to confirm with the design
-- partner:
--   pressure: start and end 0 to 150 PSI (lines are tested around 20 to 40), duration 0 to 1440
--             min (one day)
--   bucket:   pool and bucket levels 0 to 24 in (a ruler's reach), duration 0 to 168 h (a week)
-- Dye and listening tests have no number fields.

-- A test type's field_schema with the bounds added: only to number fields that have neither
-- bound yet, so a shop's own bounds are kept.
create or replace function app.with_reading_bounds(type_key text, schema jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(schema -> 'fields') = 'array' then jsonb_set(schema, '{fields}', (
    select coalesce(jsonb_agg(
      case when b.field_key is not null and f ->> 'type' = 'number'
             and not (f ? 'min') and not (f ? 'max')
        then f || jsonb_build_object('min', b.min, 'max', b.max)
        else f end
      order by ord), '[]'::jsonb)
    from jsonb_array_elements(schema -> 'fields') with ordinality as e(f, ord)
    left join (values
      ('pressure', 'start_psi', 0, 150),
      ('pressure', 'end_psi', 0, 150),
      ('pressure', 'duration_min', 0, 1440),
      ('bucket', 'pool_start_in', 0, 24),
      ('bucket', 'pool_end_in', 0, 24),
      ('bucket', 'bucket_start_in', 0, 24),
      ('bucket', 'bucket_end_in', 0, 24),
      ('bucket', 'duration_hours', 0, 168)
    ) as b(test_type_key, field_key, min, max)
      on b.test_type_key = type_key and b.field_key = f ->> 'key'))
  else schema end
$$;

-- New shops: the defaults copied by app.seed_package_defaults carry the bounds.
update app.config_default d
set rows = (
  select jsonb_agg(jsonb_set(r, '{field_schema}', app.with_reading_bounds(r ->> 'key', r -> 'field_schema'))
                   order by ord)
  from jsonb_array_elements(d.rows) with ordinality as e(r, ord)
)
where d.key = 'test_type';

-- Existing shops: their seeded test types, matched by key and field, without touching a field
-- that already has a bound. The schema's version stays: recorded results still fit it.
create or replace function app.add_test_reading_bounds() returns integer
language plpgsql set search_path = '' as $$
declare
  changed integer;
begin
  update public.test_type t
  set field_schema = app.with_reading_bounds(t.key, t.field_schema)
  where t.key in ('pressure', 'bucket')
    and t.field_schema is distinct from app.with_reading_bounds(t.key, t.field_schema);
  get diagnostics changed = row_count;
  return changed;
end
$$;

revoke all on function app.with_reading_bounds(text, jsonb) from public;
revoke all on function app.add_test_reading_bounds() from public;

select app.add_test_reading_bounds();
