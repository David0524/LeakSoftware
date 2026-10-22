-- Older repair jobs' checklists are deleted (owner, 2026-10-22, of the rows kept by
-- 20261022000800_repair_no_checklist.sql: "delete"). Soft deletes, so phones drop them on
-- their next sync: every checklist answer on a repair job, and its checklist items, except an
-- item a live finding, test or photo still points to (it names that finding's part). Reports
-- already sent keep the snapshot they were frozen with.

update public.checklist_item_result r set deleted_at = now()
  from public.job j
 where j.id = r.job_id and j.company_id = r.company_id and j.type = 'repair'
   and r.deleted_at is null;

update public.job_component c set deleted_at = now()
  from public.job j
 where j.id = c.job_id and j.company_id = c.company_id and j.type = 'repair'
   and c.deleted_at is null
   and not exists (select 1 from public.finding f
                    where f.job_component_id = c.id and f.deleted_at is null)
   and not exists (select 1 from public.test_result t
                    where t.job_component_id = c.id and t.deleted_at is null)
   and not exists (select 1 from public.media m
                    where m.job_component_id = c.id and m.deleted_at is null);
