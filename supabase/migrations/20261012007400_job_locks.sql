-- Locks on a job (owner, 2026-10-20, docs/plans/route-maps.md: "There needs to be locks for jobs
-- whether that's day, time, or both"). Planning (Plan Route, Plan Week, Suggest Days) respects
-- them:
--   lock_day:  the job stays on its day; its order and time that day may change.
--   lock_time: it keeps its clock time; it may move to another day at that time.
--   both:      it stays where it is. "The customer was told this time" (arrival_fixed) is both.
-- arrival_fixed stays, kept equal to "both", so builds that only know it still work: setting it
-- sets both locks, and setting the locks sets it.

alter table public.job
  add column lock_day boolean not null default false,
  add column lock_time boolean not null default false;

update public.job set lock_day = true, lock_time = true where arrival_fixed;

create function app.job_locks() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.arrival_fixed is distinct from old.arrival_fixed
     and new.lock_day is not distinct from old.lock_day
     and new.lock_time is not distinct from old.lock_time then
    -- Only the old flag changed (an older build): it means both locks.
    new.lock_day := new.arrival_fixed;
    new.lock_time := new.arrival_fixed;
  elsif tg_op = 'INSERT' and new.arrival_fixed and not (new.lock_day or new.lock_time) then
    new.lock_day := true;
    new.lock_time := true;
  end if;
  new.arrival_fixed := new.lock_day and new.lock_time;
  return new;
end;
$$;

create trigger job_locks before insert or update of arrival_fixed, lock_day, lock_time
  on public.job for each row execute function app.job_locks();

grant insert (lock_day, lock_time), update (lock_day, lock_time) on public.job to authenticated;
update app.sync_table
set insert_columns = insert_columns || '{lock_day,lock_time}',
    update_columns = update_columns || '{lock_day,lock_time}'
where table_name = 'job';
