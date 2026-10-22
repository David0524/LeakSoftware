-- No checklist on repair jobs (owner, 2026-10-22: "Remove the checklist entirely for repair
-- jobs."). The apps and the website hide a repair job's Checklist section, its count, Open
-- Checklist on Today and the shop's "Finish the checklist first" rule (packages/core
-- jobHasChecklist). Here, on the server:
--
-- - New Job never gives a repair job checklist rows, whatever a client sends (create_job).
-- - Checklist rows an older repair job already has are kept (no data is deleted), but they no
--   longer hold up sending its report or show as pending on the review screen, and a repair
--   report frozen from now on has no checklist (its snapshot's components are empty). Reports
--   already sent keep the snapshot they were frozen with.
--
-- As 20261022000700_job_repairs.sql (create_job), 20261012006700_pool_inspection.sql
-- (send_report_unchecked, report_preview_unchecked) otherwise.

-- ---------------------------------------------------------------------------
-- New Job
-- ---------------------------------------------------------------------------

create or replace function public.create_job(
  target_company uuid,
  new_customer jsonb,
  existing_customer uuid,
  new_property jsonb,
  existing_property uuid,
  job jsonb,
  components jsonb
) returns uuid
language plpgsql security invoker set search_path = public, app, pg_temp as $$
declare
  cp record;
  new_job uuid;
  c jsonb;
  comp uuid;
  r record;
begin
  select * into cp from app.customer_and_pool(target_company, new_customer, existing_customer,
                                              new_property, existing_property);
  insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                          assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                          summary_notes, fee_cents, intake)
  values (target_company,
          case when job ->> 'type' in ('maintenance', 'repair', 'inspection') then job ->> 'type'
               else 'detection' end,
          cp.prop, cp.cust, job ->> 'status',
          (job ->> 'assigned_user_id')::uuid, (job ->> 'second_tech_id')::uuid,
          (job ->> 'scheduled_start')::timestamptz, (job ->> 'scheduled_end')::timestamptz,
          job ->> 'summary_notes', (job ->> 'fee_cents')::integer, job -> 'intake')
  returning id into new_job;

  if job ->> 'type' = 'repair' and jsonb_typeof(job -> 'repairs') = 'array' then
    for r in select e.value as v, e.ordinality - 1 as n
             from jsonb_array_elements(job -> 'repairs') with ordinality e loop
      insert into public.job_repair (company_id, job_id, price_book_item_id, description,
                                     price_cents, sort_order)
      values (target_company, new_job, (r.v ->> 'price_book_item_id')::uuid,
              trim(r.v ->> 'description'), (r.v ->> 'price_cents')::integer, r.n);
    end loop;
  end if;

  -- A repair job has no checklist (owner, 2026-10-22), whatever a client sends.
  for c in select * from jsonb_array_elements(
             case when job ->> 'type' = 'repair' then '[]'::jsonb
                  else coalesce(components, '[]') end) loop
    insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                      label, sort_order)
    values (target_company, new_job, (c ->> 'component_type_id')::uuid,
            (c ->> 'instance_number')::integer, c ->> 'label', (c ->> 'sort_order')::integer)
    returning id into comp;
    insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
    values (target_company, new_job, comp, 'pending');
  end loop;
  return new_job;
end
$$;

-- ---------------------------------------------------------------------------
-- Sending the report, and the review screen's draft
-- ---------------------------------------------------------------------------

create or replace function app.send_report_unchecked(target_report uuid, unsigned_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  rep public.report;
  link text;
  pending int;
  snap jsonb;
  reason text := nullif(trim(coalesce(unsigned_reason, '')), '');
begin
  select * into rep from public.report where id = target_report and deleted_at is null for update;
  if rep.id is null or not app.is_member(rep.company_id)
     or not app.job_visible(rep.company_id, rep.job_id) then
    raise exception 'Report not found' using errcode = 'insufficient_privilege';
  end if;
  if rep.status <> 'draft' then
    raise exception 'This report has already been sent' using errcode = 'check_violation';
  end if;
  if rep.final_sections is null or jsonb_typeof(rep.final_sections) <> 'array'
     or jsonb_array_length(rep.final_sections) = 0
     or not exists (select 1 from jsonb_array_elements(rep.final_sections) s
                    where length(trim(coalesce(s ->> 'text', ''))) > 0) then
    raise exception 'Write the report before sending it' using errcode = 'check_violation';
  end if;
  -- BUILD_PLAN 6.1: every checklist item is inspected or excluded with a reason. A pool
  -- inspection's report shows the questions answered, so its unanswered ones don't hold it up;
  -- a repair job has no checklist (owner, 2026-10-22), so rows it already has don't either.
  select count(*) into pending
  from public.job_component jc
  join public.job j on j.id = jc.job_id
  left join public.checklist_item_result r on r.job_component_id = jc.id and r.deleted_at is null
  where jc.job_id = rep.job_id and jc.deleted_at is null and j.type not in ('inspection', 'repair')
    and coalesce(r.status, 'pending') = 'pending';
  if pending > 0 then
    raise exception '% checklist item(s) are still to do. Inspect them or mark them not inspected with a reason.', pending
      using errcode = 'check_violation', hint = 'checklist_pending';
  end if;

  -- Signatures taken since the last version belong to this one.
  update public.signature set report_id = rep.id
  where job_id = rep.job_id and report_id is null and purpose <> 'quote_acceptance'
    and deleted_at is null;
  snap := app.report_snapshot(rep.job_id);
  if reason is not null and not exists (
    select 1 from public.signature
    where report_id = rep.id and deleted_at is null) then
    snap := snap || jsonb_build_object('sign_off', jsonb_build_object('unsigned_reason', reason));
  end if;

  update public.report set status = 'superseded'
  where job_id = rep.job_id and template_key = rep.template_key and status = 'sent'
    and deleted_at is null;
  update public.report set status = 'sent', sent_at = now(), data_snapshot = snap
  where id = rep.id;
  insert into public.share_link (company_id, job_id, report_id)
  values (rep.company_id, rep.job_id, rep.id)
  returning token into link;
  update public.job set status = 'report_sent'
  where id = rep.job_id and status = 'in_progress';
  return jsonb_build_object('token', link, 'report_id', rep.id, 'version', rep.version);
end
$$;

create or replace function app.report_preview_unchecked(target_report uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  rep public.report;
  pending int;
begin
  select * into rep from public.report where id = target_report and deleted_at is null;
  if rep.id is null or not app.is_member(rep.company_id) or not app.job_visible(rep.company_id, rep.job_id) then
    return null;
  end if;
  select count(*) into pending
  from public.job_component jc
  join public.job j on j.id = jc.job_id
  left join public.checklist_item_result r on r.job_component_id = jc.id and r.deleted_at is null
  where jc.job_id = rep.job_id and jc.deleted_at is null and j.type not in ('inspection', 'repair')
    and coalesce(r.status, 'pending') = 'pending';
  return jsonb_build_object(
    'report_id', rep.id, 'job_id', rep.job_id, 'template_key', rep.template_key,
    'version', rep.version, 'status', rep.status, 'sent_at', rep.sent_at,
    'final_sections', rep.final_sections,
    'snapshot', case when rep.status = 'draft' then app.report_snapshot(rep.job_id)
                     else rep.data_snapshot end,
    'pending', pending);
end
$$;

-- ---------------------------------------------------------------------------
-- The report's snapshot: a repair job's has no checklist
-- ---------------------------------------------------------------------------

alter function app.report_snapshot(uuid) rename to report_snapshot_before_no_checklist;
create or replace function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when s is null or s #>> '{job,type}' is distinct from 'repair' then s
              else s || jsonb_build_object('components', '[]'::jsonb) end
  from app.report_snapshot_before_no_checklist(target_job) s
$$;
revoke all on function app.report_snapshot(uuid), app.report_snapshot_before_no_checklist(uuid)
  from public;
