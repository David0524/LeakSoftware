-- How much a phone's first download holds (owner, 2026-10-20: "Downloading your company takes
-- a long time. Give a more interesting loading bar."): the rows a pull from the start would
-- send, per table, so the app can show real progress ("312 of 1,240 jobs"). Counted with the
-- caller's own row security, and for job work only the jobs that go to phones, as sync_pull
-- sends them. An estimate: rows may change while the download runs.

create or replace function public.sync_pull_count()
returns jsonb
language plpgsql stable security invoker set search_path = public, app, pg_temp as $$
declare
  on_phones uuid[];
  t record;
  n bigint;
  counts jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync' using errcode = 'insufficient_privilege';
  end if;
  on_phones := app.phone_job_ids();
  for t in select table_name, job_ref from app.sync_table where device_sync order by sort_order
  loop
    execute format('select count(*) from public.%I t%s', t.table_name,
      case when t.job_ref is null then ''
           else format(' where (%s) is null or (%s) = any ($1)', t.job_ref, t.job_ref) end)
      into n using on_phones;
    if n > 0 then counts := counts || jsonb_build_object(t.table_name, n); end if;
  end loop;
  return counts;
end
$$;

revoke all on function public.sync_pull_count() from public, anon;
grant execute on function public.sync_pull_count() to authenticated;
