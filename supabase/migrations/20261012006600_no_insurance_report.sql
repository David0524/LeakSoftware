-- The insurance report is gone (owner, 2026-10-20: "Remove the insurance stuff"). It was a
-- placeholder ("Coming soon") that never sent a report. New shops don't get it, and existing
-- shops' rows are removed (soft delete, so phones drop it too). No report was ever made from it:
-- prepare_report refused it.

update app.config_default
set rows = (
  select jsonb_agg(r order by ord)
  from jsonb_array_elements(rows) with ordinality as t(r, ord)
  where r ->> 'key' <> 'insurance')
where key = 'report_template';

update public.report_template
set deleted_at = now()
where key = 'insurance' and deleted_at is null;
