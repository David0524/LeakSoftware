-- The partner (technical) report starts turned off (owner, 2026-10-14: most shops send
-- reports to homeowners; pool companies asking for a technical version is rare). A shop that
-- needs it turns it on in Settings › Report Templates ("Techs can send this report").

-- New shops.
update app.config_default
set rows = (
  select jsonb_agg(case when r ->> 'key' = 'partner' then r || '{"enabled": false}' else r end
                   order by ord)
  from jsonb_array_elements(rows) with ordinality as t(r, ord))
where key = 'report_template';

-- Existing shops that have never made a partner report (dev and demo only so far).
update public.report_template t
set enabled = false
where t.key = 'partner' and t.enabled and t.deleted_at is null
  and not exists (select 1 from public.report r
                  where r.company_id = t.company_id and r.template_key = 'partner');
