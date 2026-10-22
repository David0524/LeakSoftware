-- When a stop was finished (owner, 2026-10-22: "The owner sees techs' progress live"; docs/design/
-- 2026-10-22-owner-live-today.md). The owner's Today lists each tech's day with the last stop
-- done and its time, "Last done: Jones at 10:42 AM".
--
-- job.stop_done_at: the moment the stop stopped being one to do, whichever way it was done:
-- Today's Mark Complete on a leak or repair job (stop_done_on set), a maintenance visit
-- completed, or a job moved on in its pipeline (report sent, invoiced, ...). It is the same
-- line between "to do" and "done" that core stopDone draws: a stop is finished when
-- stop_done_on is set or its status is no longer unscheduled, scheduled or in progress.
--
-- A phone may send its own time with the change (it may have been offline when the tech
-- tapped); otherwise the server stamps now(). Undoing it (Mark Not Complete, Reopen Visit)
-- clears it. Synced like the job's other columns, and written by anyone who can write the job.

alter table public.job add column stop_done_at timestamptz;

update app.sync_table
set insert_columns = insert_columns || '{stop_done_at}',
    update_columns = update_columns || '{stop_done_at}'
where table_name = 'job';

grant insert (stop_done_at), update (stop_done_at) on public.job to authenticated;

create or replace function app.stop_finished(job_status text, done_on date) returns boolean
language sql immutable as $$
  select done_on is not null or job_status not in ('unscheduled', 'scheduled', 'in_progress')
$$;

create or replace function app.stamp_stop_done() returns trigger
language plpgsql set search_path = public, app, pg_temp as $$
begin
  if not app.stop_finished(new.status, new.stop_done_on) then
    new.stop_done_at := null;
  elsif tg_op = 'UPDATE' and not app.stop_finished(old.status, old.stop_done_on)
        and (new.stop_done_at is null or new.stop_done_at is not distinct from old.stop_done_at) then
    -- Just finished, and the phone didn't send its own time: now.
    new.stop_done_at := now();
  end if;
  -- A job made already finished (an import of past work) keeps whatever it was given.
  return new;
end
$$;

create trigger stamp_stop_done before insert or update of status, stop_done_on, stop_done_at
  on public.job for each row execute function app.stamp_stop_done();
