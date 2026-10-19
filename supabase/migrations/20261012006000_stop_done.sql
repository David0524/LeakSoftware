-- Mark Complete on Today for every stop (owner, 2026-10-19: "All stops on the Today page need
-- a mark complete - at least for that day's route. For repairs and leaks we can still keep the
-- current pipeline. It's just that sometimes a tech will fill out the details later or need to
-- come back to a job before anything is done").
--
-- A maintenance visit completes (status done). A leak detection or repair job keeps its status
-- (its report, quote, and invoice still to come); its stop is marked done for the day instead:
-- job.stop_done_on, the shop's local date it was marked. A job moved to another day shows as
-- not done there, since the date no longer matches. Anyone on the job's team sets or clears it.

alter table public.job add column stop_done_on date;

update app.sync_table
set insert_columns = insert_columns || '{stop_done_on}',
    update_columns = update_columns || '{stop_done_on}'
where table_name = 'job';

grant insert (stop_done_on), update (stop_done_on) on public.job to authenticated;
