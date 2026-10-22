-- A repair job's report is about the repair work (owner, 2026-10-22: "For the repair reports,
-- the autofilled text should relate to the repair work that is being done - not necessarily
-- leaks"). The snapshot gains `work` on repair jobs: the lines of the accepted quote that made
-- the job (latest accepted, as app.create_invoice_unchecked bills it), else the price book item
-- the job was booked for (job.intake.repair_item, When They Call), as
-- [{description, quantity}]. Prices stay off the report. Other jobs' snapshots don't change, and
-- sent reports keep the snapshot they were frozen with.

alter function app.report_snapshot(uuid) rename to report_snapshot_before_repair;
create or replace function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when s is null or j.type is distinct from 'repair' then s
    else s || jsonb_build_object('work', coalesce(
      (select jsonb_agg(jsonb_build_object('description', trim(l.description),
                                           'quantity', l.quantity)
                        order by l.sort_order, l.id)
       from public.quote_line_item l
       where l.deleted_at is null and length(trim(l.description)) > 0
         and l.quote_id = (
           select q.id from public.quote q
           where q.repair_job_id = j.id and q.status = 'accepted' and q.deleted_at is null
           order by q.accepted_at desc nulls last, q.id desc limit 1)),
      case when jsonb_typeof(j.intake -> 'repair_item') = 'string'
                and length(trim(j.intake ->> 'repair_item')) > 0
           then jsonb_build_array(jsonb_build_object(
                  'description', trim(j.intake ->> 'repair_item'), 'quantity', 1)) end,
      '[]'::jsonb)) end
  from app.report_snapshot_before_repair(target_job) s
  left join public.job j on j.id = target_job and j.deleted_at is null
$$;
revoke all on function app.report_snapshot(uuid), app.report_snapshot_before_repair(uuid)
  from public;
