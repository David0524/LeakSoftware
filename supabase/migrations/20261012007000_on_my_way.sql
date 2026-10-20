-- On My Way, kept on the job (owner, 2026-10-20, Today's card, docs/plans/today-hero.md
-- decision 2): when the tech said they were on the way, and when they said they'd arrive. Until
-- now only the tech's phone knew, so the website and the office couldn't show "On the way,
-- arriving 9:42". Written by whoever sends On My Way (the website, or a phone through sync).

alter table public.job
  add column on_my_way_at timestamptz,
  add column arrive_at timestamptz;

grant insert (on_my_way_at, arrive_at), update (on_my_way_at, arrive_at)
  on public.job to authenticated;
update app.sync_table
set insert_columns = insert_columns || '{on_my_way_at,arrive_at}',
    update_columns = update_columns || '{on_my_way_at,arrive_at}'
where table_name = 'job';
