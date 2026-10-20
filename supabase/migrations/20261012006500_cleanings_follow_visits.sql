-- A plan's cleanings follow its visits (owner, 2026-10-20: "It should also auto add to
-- checklists"). Each cleaning sits on the checklist of the first visit on or after its due date
-- (app.place_cleanings, 20261012004700). That was redone when a cleaning changed or a visit was
-- finished; now also when a visit is canceled, sent back to Needs a Time, deleted, or moved, so
-- the cleaning moves to the next visit instead of staying on one that won't happen.

-- Placing now also takes a cleaning off a visit that was canceled or sent back to Needs a
-- Time (before, only off other scheduled visits). A visit in progress or done keeps its own.
create or replace function app.place_cleanings(target_plan uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c public.plan_cleaning;
  tz text;
  today date;
  target uuid;
  jc uuid;
begin
  select co.timezone into tz
  from public.service_plan p join public.company co on co.id = p.company_id
  where p.id = target_plan;
  if tz is null then
    return;
  end if;
  today := (now() at time zone tz)::date;

  for c in select * from public.plan_cleaning where service_plan_id = target_plan loop
    target := null;
    if c.deleted_at is null and not exists (
      select 1 from public.job_component x join public.job j on j.id = x.job_id
      where x.plan_cleaning_id = c.id and x.deleted_at is null and j.deleted_at is null
        and j.status = 'in_progress') then
      select j.id into target from public.job j
      where j.service_plan_id = target_plan and j.deleted_at is null and j.status = 'scheduled'
        and j.plan_date >= greatest(c.next_due, today - 6)
      order by j.plan_date
      limit 1;
    end if;

    with gone as (
      update public.job_component x set deleted_at = now()
      from public.job j
      where x.plan_cleaning_id = c.id and x.deleted_at is null and j.id = x.job_id
        and j.status not in ('in_progress', 'done') and x.job_id is distinct from target
      returning x.id)
    update public.checklist_item_result r set deleted_at = now()
    where r.job_component_id in (select id from gone) and r.deleted_at is null;

    if target is not null and not exists (
      select 1 from public.job_component x
      where x.job_id = target and x.plan_cleaning_id = c.id and x.deleted_at is null) then
      insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                        label, sort_order, plan_cleaning_id)
      select c.company_id, target, ty.id, 1, ty.name, ty.sort_order * 100 + 1, c.id
      from public.component_type ty where ty.id = c.component_type_id
      returning id into jc;
      insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
      values (c.company_id, target, jc, 'pending');
    end if;
  end loop;
end
$$;

create or replace function app.plan_visit_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.place_cleanings(new.service_plan_id);
  return null;
end
$$;
revoke all on function app.plan_visit_changed() from public;

create trigger plan_visit_changed after update of status, deleted_at, scheduled_start
  on public.job
  for each row
  when (new.service_plan_id is not null and new.status <> 'done'
        and (old.status is distinct from new.status
             or old.deleted_at is distinct from new.deleted_at
             or old.scheduled_start is distinct from new.scheduled_start))
  execute function app.plan_visit_changed();
