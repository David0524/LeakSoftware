-- Inspection configuration defaults.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;

select is(
  (select field_schema -> 'options' from test_type
   where company_id = (select (a ->> 'company')::uuid from fx) and key = 'pressure'),
  '{"pass_max_drop_psi": 0, "min_duration_min": 15}'::jsonb,
  'pressure test type carries its pass threshold');
select is(
  (select field_schema -> 'options' ->> 'fail_over_in_per_day' from test_type
   where company_id = (select (a ->> 'company')::uuid from fx) and key = 'bucket'),
  '0.25', 'bucket test type carries its fail threshold');
select is(
  (select count(*) from app.config_default d, jsonb_array_elements(d.rows) r
   where d.key = 'test_type' and r ? 'key'),
  4::bigint, 'all four default test types kept');
select ok(
  (select bool_and(field_schema ? 'options') from test_type
   where company_id = (select id from company where name = 'Demo Leak Co.') and key in ('pressure', 'bucket')),
  'existing companies received the thresholds');

select * from finish();
rollback;
