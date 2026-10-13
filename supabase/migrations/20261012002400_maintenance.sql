-- Maintenance (owner request, 2026-10-13: "This company does regular pool cleaning too...
-- regular maintenance visits (default 30 minutes), recurring on a weekly basis with some
-- settings there").
--
-- A maintenance plan belongs to a pool: who goes, from which date, every 1 to 4 weeks, an
-- optional set time (otherwise route planning picks it), how long, and the price per visit.
-- Its visits are ordinary jobs of type 'maintenance', made a few weeks ahead (Settings ›
-- Scheduling) when the plan is saved and every morning after, so they appear on routes,
-- Today, and phones like any other job. A visit gets a short service checklist and is
-- finished with the new status 'done'.

-- ---------------------------------------------------------------------------
-- Job type, and Done
-- ---------------------------------------------------------------------------

alter table public.job drop constraint job_type_check;
alter table public.job add constraint job_type_check
  check (type in ('detection', 'repair', 'maintenance'));

-- Mirrored in packages/core/src/job-status.ts (test/job-status.test.ts reads every
-- migration's rows).
insert into app.job_status_transition (from_status, to_status) values
  ('in_progress', 'done'),
  ('done', 'in_progress'),
  ('done', 'invoiced');

-- ---------------------------------------------------------------------------
-- Service checklist items
-- ---------------------------------------------------------------------------

-- job_type: which jobs get the item. answer 'done': Done, Needs Attention, or Skipped.
alter table public.component_type
  add column job_type text not null default 'detection'
    check (job_type in ('detection', 'maintenance'));
alter table public.component_type drop constraint component_type_answer_check;
alter table public.component_type add constraint component_type_answer_check
  check (answer in ('leak', 'yes_no', 'done'));
alter table public.component_type drop constraint component_type_section_check;
alter table public.component_type add constraint component_type_section_check
  check (section in ('visual', 'plumbing', 'bond_beam', 'other', 'service'));

update app.config_default
set rows = rows || $json$[
  {"key": "svc_skim", "name": "Skim surface", "section": "service", "answer": "done", "job_type": "maintenance", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Service"], "sort_order": 500},
  {"key": "svc_brush", "name": "Brush walls, steps, and tile", "section": "service", "answer": "done", "job_type": "maintenance", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Service"], "sort_order": 510},
  {"key": "svc_vacuum", "name": "Vacuum", "section": "service", "answer": "done", "job_type": "maintenance", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Service"], "sort_order": 520},
  {"key": "svc_baskets", "name": "Empty skimmer and pump baskets", "section": "service", "answer": "done", "job_type": "maintenance", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Service"], "sort_order": 530},
  {"key": "svc_filter", "name": "Check filter pressure", "section": "service", "answer": "done", "job_type": "maintenance", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Service"], "sort_order": 540},
  {"key": "svc_water", "name": "Test and balance water", "section": "service", "answer": "done", "job_type": "maintenance", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Service"], "sort_order": 550},
  {"key": "svc_equipment", "name": "Equipment: leaks, noise, or drips", "section": "service", "answer": "done", "job_type": "maintenance", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Service"], "sort_order": 560}
]$json$::jsonb
where key = 'component_type';

create or replace function app.seed_component_types(target_company uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  create temp table if not exists pg_temp.default_types on commit drop as
  select r.* from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, section text, answer text,
         job_type text, pool_type text, allows_multiple boolean, default_count integer,
         applies_to text, methods text[], sort_order integer)
  where d.key = 'component_type';
  update public.component_type t
  set name = r.name, section = r.section, answer = r.answer,
      job_type = coalesce(r.job_type, 'detection'), applies_to_pool_type = r.pool_type,
      allows_multiple = r.allows_multiple, default_count = r.default_count,
      applies_to = r.applies_to, methods = r.methods, sort_order = r.sort_order
  from pg_temp.default_types r
  where t.company_id = target_company and t.key = r.key and t.deleted_at is null;
  insert into public.component_type
    (company_id, key, name, section, answer, job_type, applies_to_pool_type, allows_multiple,
     default_count, applies_to, methods, sort_order)
  select target_company, r.key, r.name, r.section, r.answer, coalesce(r.job_type, 'detection'),
         r.pool_type, r.allows_multiple, r.default_count, r.applies_to, r.methods, r.sort_order
  from pg_temp.default_types r
  where not exists (select 1 from public.component_type t
                    where t.company_id = target_company and t.key = r.key and t.deleted_at is null);
  drop table pg_temp.default_types;
end
$$;

-- Only the new items: existing shops keep their own edits to the leak checklist.
insert into public.component_type
  (company_id, key, name, section, answer, job_type, allows_multiple, default_count, applies_to,
   methods, sort_order)
select co.id, r.key, r.name, r.section, r.answer, r.job_type, r.allows_multiple,
       r.default_count, r.applies_to, r.methods, r.sort_order
from public.company co
cross join app.config_default d
cross join lateral jsonb_to_recordset(d.rows) as r(key text, name text, section text,
  answer text, job_type text, allows_multiple boolean, default_count integer, applies_to text,
  methods text[], sort_order integer)
where d.key = 'component_type' and r.job_type = 'maintenance'
  and not exists (select 1 from public.component_type t
                  where t.company_id = co.id and t.key = r.key and t.deleted_at is null);

grant insert (job_type) on public.component_type to authenticated;
grant update (job_type) on public.component_type to authenticated;
update app.sync_table
set insert_columns = insert_columns || '{job_type}', update_columns = update_columns || '{job_type}'
where table_name = 'component_type';

-- ---------------------------------------------------------------------------
-- Maintenance plans
-- ---------------------------------------------------------------------------

create table public.service_plan (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  customer_id uuid not null,
  property_id uuid not null,
  -- The tech who goes; none: the visits wait in Needs a Time.
  assigned_user_id uuid,
  -- The first visit; later ones every interval_weeks on the same weekday.
  starts_on date not null,
  interval_weeks smallint not null default 1 check (interval_weeks between 1 and 4),
  -- A time the customer expects; none: route planning picks it.
  visit_time time,
  duration_minutes integer not null default 30 check (duration_minutes between 10 and 240),
  price_cents integer check (price_cents >= 0),
  ends_on date,
  paused boolean not null default false,
  notes text,
  check (ends_on is null or ends_on >= starts_on),
  foreign key (customer_id, company_id) references public.customer (id, company_id),
  foreign key (property_id, company_id) references public.property (id, company_id),
  foreign key (company_id, assigned_user_id) references public.membership (company_id, user_id)
);
select app.make_synced('public.service_plan');
create index service_plan_property_idx on public.service_plan (property_id);

alter table public.job
  add column service_plan_id uuid,
  -- The plan's date for this visit (a visit moved to another day keeps it, so it is not
  -- made twice).
  add column plan_date date,
  add foreign key (service_plan_id, company_id) references public.service_plan (id, company_id);
create unique index job_plan_date_once on public.job (service_plan_id, plan_date)
  where service_plan_id is not null and deleted_at is null;

-- Access: everyone reads (a tech limited to their own jobs reads their own plans), owners
-- write. Same registry and generated rules as 20261012000600_access.sql.
insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('service_plan', 'member', 'owner',
  '{customer_id,property_id,assigned_user_id,starts_on,interval_weeks,visit_time,duration_minutes,price_cents,ends_on,paused,notes}',
  '{assigned_user_id,starts_on,interval_weeks,visit_time,duration_minutes,price_cents,ends_on,paused,notes,deleted_at}',
  true, 305);

grant select on public.service_plan to authenticated;
create policy service_plan_select on public.service_plan for select to authenticated
  using (app.is_member(company_id));
grant insert (id, company_id, customer_id, property_id, assigned_user_id, starts_on,
  interval_weeks, visit_time, duration_minutes, price_cents, ends_on, paused, notes)
  on public.service_plan to authenticated;
create policy service_plan_insert on public.service_plan for insert to authenticated
  with check (app.is_owner(company_id));
grant update (assigned_user_id, starts_on, interval_weeks, visit_time, duration_minutes,
  price_cents, ends_on, paused, notes, deleted_at) on public.service_plan to authenticated;
create policy service_plan_update on public.service_plan for update to authenticated
  using (app.is_owner(company_id)) with check (app.is_owner(company_id));
create policy service_plan_job_visible on public.service_plan as restrictive for all
  to authenticated
  using (app.job_row_visible(company_id, assigned_user_id, null))
  with check (app.job_row_visible(company_id, assigned_user_id, null));

-- Defaults for every shop (Settings › Scheduling); routingSettings fills them in for shops
-- made later.
update public.company
set settings = jsonb_set(settings, '{maintenance}',
                         '{"visit_minutes": 30, "weeks_ahead": 4}'::jsonb)
where not settings ? 'maintenance';

-- ---------------------------------------------------------------------------
-- Making the visits
-- ---------------------------------------------------------------------------

-- Make a plan's visits from today through the shop's weeks ahead. With reset, its upcoming
-- visits that haven't started are removed first (the plan changed, paused, or ended).
-- A visit without a set time goes after the tech's last job that day; Plan Route orders it.
create or replace function app.plan_visits(target_plan uuid, reset boolean) returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  p public.service_plan;
  tz text;
  s jsonb;
  today date;
  through date;
  d date;
  step integer;
  starts time;
  last_end timestamptz;
  start_at timestamptz;
  spa boolean;
  ptype text;
  j uuid;
  made integer := 0;
begin
  select * into p from public.service_plan where id = target_plan;
  if p.id is null then
    return 0;
  end if;
  select co.timezone, co.settings into tz, s from public.company co where co.id = p.company_id;
  today := (now() at time zone tz)::date;
  through := today + 7 * greatest(1, least(12,
    coalesce((s #>> '{maintenance,weeks_ahead}')::integer, 4)));
  if reset then
    update public.job set deleted_at = now()
    where service_plan_id = p.id and deleted_at is null and status = 'scheduled'
      and plan_date >= today;
  end if;
  if p.deleted_at is not null or p.paused then
    return 0;
  end if;

  select has_spa, pool_type into spa, ptype from public.property where id = p.property_id;
  step := 7 * p.interval_weeks;
  d := p.starts_on;
  if d < today then
    d := d + step * ceil((today - d)::numeric / step)::integer;
  end if;
  while d <= through and (p.ends_on is null or d <= p.ends_on) loop
    if not exists (select 1 from public.job
                   where service_plan_id = p.id and plan_date = d and deleted_at is null) then
      if p.visit_time is not null then
        start_at := (d + p.visit_time) at time zone tz;
      else
        -- After the tech's last job that day (15 minutes to get there), or first thing.
        starts := coalesce((s #>> '{routing,day_start}')::time, time '08:00');
        select max(j2.scheduled_end) into last_end from public.job j2
        where j2.company_id = p.company_id and j2.deleted_at is null and j2.status <> 'canceled'
          and p.assigned_user_id is not null and j2.assigned_user_id = p.assigned_user_id
          and (j2.scheduled_start at time zone tz)::date = d;
        start_at := greatest(coalesce(last_end + interval '15 minutes', (d + starts) at time zone tz),
                             (d + starts) at time zone tz);
      end if;
      insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                              assigned_user_id, scheduled_start, scheduled_end, fee_cents,
                              arrival_fixed, service_plan_id, plan_date, summary_notes)
      values (p.company_id, 'maintenance', p.property_id, p.customer_id, 'scheduled',
              p.assigned_user_id, start_at,
              start_at + make_interval(mins => p.duration_minutes), p.price_cents,
              p.visit_time is not null, p.id, d, p.notes)
      returning id into j;
      insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                        label, sort_order)
      select p.company_id, j, ty.id, 1, ty.name, ty.sort_order * 100 + 1
      from public.component_type ty
      where ty.company_id = p.company_id and ty.job_type = 'maintenance' and ty.active
        and ty.deleted_at is null
        and (ty.applies_to <> 'spa' or spa)
        and (ty.applies_to_pool_type is null or ty.applies_to_pool_type = ptype);
      insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
      select p.company_id, j, jc.id, 'pending' from public.job_component jc where jc.job_id = j;
      made := made + 1;
    end if;
    d := d + step;
  end loop;
  return made;
end
$$;

create or replace function app.service_plan_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.plan_visits(new.id, true);
  return new;
end
$$;

create trigger service_plan_changed after insert or update on public.service_plan
  for each row execute function app.service_plan_changed();

-- Every morning (the daily cron): keep each plan's visits made through the weeks ahead.
create or replace function public.extend_service_plans() returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  p record;
  made integer := 0;
begin
  for p in select id from public.service_plan where deleted_at is null and not paused loop
    begin
      made := made + app.plan_visits(p.id, false);
    exception when others then
      -- One shop's trouble (for example read-only) never stops the others.
      raise warning 'service plan %: %', p.id, sqlerrm;
    end;
  end loop;
  return made;
end
$$;

revoke all on function app.plan_visits(uuid, boolean), public.extend_service_plans() from public;
revoke all on function public.extend_service_plans() from anon, authenticated;
grant execute on function public.extend_service_plans() to service_role;
