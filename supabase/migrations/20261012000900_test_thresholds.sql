-- Calculator thresholds become test-type settings (field_schema.options), so a shop can
-- tune them without a code change. First drafts, to confirm with the design partner:
--   pressure: a line passes only if it holds with no drop over at least 15 minutes
--   bucket:   fails when unexplained loss exceeds 1/4 inch per 24 hours

update app.config_default d
set rows = (
  select jsonb_agg(
    case r ->> 'key'
      when 'pressure' then jsonb_set(r, '{field_schema,options}', '{"pass_max_drop_psi": 0, "min_duration_min": 15}')
      when 'bucket' then jsonb_set(r, '{field_schema,options}', '{"fail_over_in_per_day": 0.25}')
      else r
    end order by ord)
  from jsonb_array_elements(d.rows) with ordinality as e(r, ord)
)
where d.key = 'test_type';

-- Existing companies get the same defaults unless they already set their own.
update public.test_type
set field_schema = jsonb_set(field_schema, '{options}', '{"pass_max_drop_psi": 0, "min_duration_min": 15}')
where key = 'pressure' and not (field_schema ? 'options');

update public.test_type
set field_schema = jsonb_set(field_schema, '{options}', '{"fail_over_in_per_day": 0.25}')
where key = 'bucket' and not (field_schema ? 'options');
