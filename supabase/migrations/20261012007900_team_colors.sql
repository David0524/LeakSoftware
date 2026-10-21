-- Team colors, when someone was turned off, and plan visits moved on their own (owner,
-- 2026-10-20, docs/design/2026-10-20-team-week.md sections 2, 3 and 5).
--
--   membership.color        a tech color (brand/tokens.json › color.tech; packages/core
--                           TECH_COLORS). Owners and admins change it. A new member gets the
--                           first color no active member uses (core nextTechColor); existing
--                           members get colors by join order, distinct within a shop.
--   membership.disabled_at  when status became 'disabled' (cleared when 'active'), for
--                           Team's order (core teamOrder). Set by the server.
--   job.plan_moved          a plan visit moved by Just This Visit: remaking the plan's visits
--                           (a plan change, app.service_plan_changed) leaves it alone, and no
--                           new visit is made for its plan date.

-- ---------------------------------------------------------------------------
-- Tech colors
-- ---------------------------------------------------------------------------

-- The palette, in order (packages/core TECH_COLORS).
create function app.tech_colors() returns text[]
language sql immutable as $$
  select '{blue,green,orange,purple,pink,teal,red,olive,brown,slate}'::text[]
$$;

alter table public.membership
  add column color text check (color = any (app.tech_colors())),
  add column disabled_at timestamptz;

-- The next color for a shop (core nextTechColor): the first palette color not used, else the
-- least used, earliest in the palette. Counts active members, or with `everyone`, every member
-- that has a color (the backfill, so a shop's colors are distinct).
create function app.next_tech_color(target_company uuid, everyone boolean default false)
returns text
language sql security definer set search_path = public, app, pg_temp as $$
  select k from unnest(app.tech_colors()) with ordinality as p(k, n)
  order by (select count(*) from public.membership m
            where m.company_id = target_company and m.color = p.k and m.deleted_at is null
              and (everyone or m.status = 'active')), n
  limit 1
$$;
revoke all on function app.next_tech_color(uuid, boolean) from public;

-- Existing members by join order, one shop at a time.
do $$
declare
  m record;
begin
  for m in select id, company_id from public.membership order by company_id, created_at, id loop
    update public.membership set color = app.next_tech_color(m.company_id, true) where id = m.id;
  end loop;
end
$$;
alter table public.membership alter column color set not null;

-- Best guess for people already off: when their membership last changed.
update public.membership set disabled_at = updated_at where status = 'disabled';

create function app.membership_color_and_off() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.color is null then
    new.color := app.next_tech_color(new.company_id);
  end if;
  if new.status = 'disabled' then
    if tg_op = 'INSERT' or old.status is distinct from 'disabled' then
      new.disabled_at := now();
    elsif new.disabled_at is null then
      new.disabled_at := old.disabled_at;
    end if;
  else
    new.disabled_at := null;
  end if;
  return new;
end
$$;
revoke all on function app.membership_color_and_off() from public;

create trigger membership_color_and_off before insert or update on public.membership
  for each row execute function app.membership_color_and_off();

-- ---------------------------------------------------------------------------
-- Plan visits moved on their own
-- ---------------------------------------------------------------------------

alter table public.job add column plan_moved boolean not null default false;

-- ---------------------------------------------------------------------------
-- Access for the new columns, from the registry (as 20261012000600_access.sql and
-- 20261012002200_routing.sql): devices write membership.color (managers, the table's write
-- role) and job.plan_moved (like the job's other schedule columns).
-- ---------------------------------------------------------------------------

do $$
declare
  add_cols jsonb := $json${
    "membership": {"insert": [], "update": ["color"]},
    "job": {"insert": ["plan_moved"], "update": ["plan_moved"]}
  }$json$;
  t text;
  ins text[];
  upd text[];
begin
  for t in select jsonb_object_keys(add_cols) loop
    ins := array(select jsonb_array_elements_text(add_cols -> t -> 'insert'));
    upd := array(select jsonb_array_elements_text(add_cols -> t -> 'update'));
    update app.sync_table
    set insert_columns = case when insert_columns is null then null else insert_columns || ins end,
        update_columns = case when update_columns is null then null else update_columns || upd end
    where table_name = t;
    if cardinality(ins) > 0 and (select insert_columns is not null from app.sync_table where table_name = t) then
      execute format('grant insert (%s) on public.%I to authenticated', array_to_string(ins, ', '), t);
    end if;
    if cardinality(upd) > 0 then
      execute format('grant update (%s) on public.%I to authenticated', array_to_string(upd, ', '), t);
    end if;
  end loop;
end
$$;

-- No new policies (the tables' write roles are unchanged); kept per the foundation's rule.
select app.speed_up_policies();

-- Plan visits as before (20261012004800_plan_schedule_and_monthly_price.sql), except that a
-- plan change no longer removes a visit moved on its own. Its plan date still counts as made,
-- so the plan doesn't add another visit that day.
create or replace function app.plan_visits(target_plan uuid, reset boolean) returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  p public.service_plan;
  tz text;
  s jsonb;
  today date;
  through date;
  d date;
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
    -- A visit moved on its own (Just This Visit) stays where it was put.
    update public.job set deleted_at = now()
    where service_plan_id = p.id and deleted_at is null and status = 'scheduled'
      and plan_date >= today and not plan_moved;
  end if;
  if p.deleted_at is not null or p.paused then
    perform app.place_cleanings(p.id);
    return 0;
  end if;

  select has_spa, pool_type into spa, ptype from public.property where id = p.property_id;
  for d in select * from app.plan_dates(p, today, through) loop
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
              start_at + make_interval(mins => p.duration_minutes), null,
              p.visit_time is not null, p.id, d, p.notes)
      returning id into j;
      insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                        label, sort_order)
      select p.company_id, j, ty.id, 1, ty.name, ty.sort_order * 100 + 1
      from public.component_type ty
      where ty.company_id = p.company_id and ty.job_type = 'maintenance' and ty.active
        and not ty.on_schedule and ty.deleted_at is null
        and (ty.applies_to <> 'spa' or spa)
        and (ty.applies_to_pool_type is null or ty.applies_to_pool_type = ptype);
      insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
      select p.company_id, j, jc.id, 'pending' from public.job_component jc where jc.job_id = j;
      made := made + 1;
    end if;
  end loop;
  perform app.place_cleanings(p.id);
  return made;
end
$$;

revoke all on function app.plan_visits(uuid, boolean) from public;
