-- New shops start with techs seeing only their own jobs (owner, 2026-10-20: techs reaching
-- jobs not assigned to them is "not intended"; "Default to Only Their Own"). Owners can still
-- choose Every Job in Settings › Team. Existing shops keep what they have: a shop that never
-- chose reads as Every Job (the coalesce in app.sees_all_jobs), so it is written down here.

-- Writing it down changes nobody's view, so phones aren't sent to pull everything again.
alter table public.company disable trigger visibility_setting_changed;
update public.company
set settings = settings || '{"techs_see_all_jobs": true}'::jsonb
where not (settings ? 'techs_see_all_jobs');
alter table public.company enable trigger visibility_setting_changed;

do $$
declare
  current_default jsonb;
begin
  execute 'select ' || pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.company'::regclass and a.attname = 'settings'
  into current_default;
  current_default := jsonb_set(current_default, '{techs_see_all_jobs}', 'false');
  execute format('alter table public.company alter column settings set default %L::jsonb',
                 current_default);
end
$$;
