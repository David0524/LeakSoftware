-- Skip a Visit (owner request, 2026-11-16; docs/design/2026-11-16-skip-visit.md).
--
-- A maintenance visit that can't be done (locked gate, dog in the yard, customer asked to skip)
-- is skipped, not left sitting as a missed stop:
--
--   * job status 'skipped', for maintenance visits only. From Unscheduled, Scheduled or In
--     progress; back to Scheduled (Undo, or the office picks a new day), Unscheduled, In
--     progress, or Canceled. Mirrored in packages/core/src/job-status.ts. A skipped visit is
--     not 'done': monthly billing bills only done, invoiced and paid visits, so it is never
--     billed, and stop_done_at (the owner's "Last done") isn't stamped for it.
--   * why: job.skip_reason (a skip_reason row's label, copied so it survives edits), skip_note,
--     and who and when: skipped_by / skipped_at. The photo is an ordinary photo on the visit.
--   * the office handles it: Reschedule (moving a skipped visit to a day makes it Scheduled
--     again) or Dismiss (skip_handled_at / skip_handled_by: it stays skipped, marked handled).
--     Only owners and admins dismiss.
--   * skip_reason: the shop's list of reasons, seeded per company like exclusion reasons and
--     edited in Settings › Skip Reasons. 'Not Done' is a system reason (the auto-skip's), kept
--     out of the picker and the settings list.
--   * Skip Unfinished Visits at Day's End: company.settings.skip_unfinished_visits (default
--     off). The daily run (service role) calls auto_skip_visits(): Scheduled visits from the
--     last three days, not started, become skipped with the reason 'Not Done'.
--   * job.skip_notified_at (server only): the owners and admins are pushed once per skip; the
--     daily run catches up skips whose push didn't go out (skips_to_notify).

-- ---------------------------------------------------------------------------
-- Status machine
-- ---------------------------------------------------------------------------

-- Mirrored in packages/core/src/job-status.ts (test/job-status.test.ts reads every
-- migration's rows).
insert into app.job_status_transition (from_status, to_status) values
  ('unscheduled', 'skipped'),
  ('scheduled', 'skipped'),
  ('in_progress', 'skipped'),
  ('skipped', 'scheduled'),
  ('skipped', 'unscheduled'),
  ('skipped', 'in_progress'),
  ('skipped', 'canceled');

alter table public.job
  add column skip_reason text check (skip_reason is null or length(skip_reason) <= 100),
  add column skip_note text check (skip_note is null or length(skip_note) <= 1000),
  add column skipped_at timestamptz,
  add column skipped_by uuid,
  add column skip_handled_at timestamptz,
  add column skip_handled_by uuid,
  add column skip_notified_at timestamptz,
  add foreign key (company_id, skipped_by) references public.membership (company_id, user_id),
  add foreign key (company_id, skip_handled_by) references public.membership (company_id, user_id),
  add constraint job_skipped_is_maintenance check (status <> 'skipped' or type = 'maintenance'),
  add constraint job_skipped_has_reason
    check (status <> 'skipped' or length(trim(coalesce(skip_reason, ''))) > 0);

create index job_skipped_idx on public.job (company_id, skipped_at) where status = 'skipped';

update app.sync_table
set update_columns = update_columns || '{skip_reason,skip_note,skipped_at,skip_handled_at}'
where table_name = 'job';
grant update (skip_reason, skip_note, skipped_at, skip_handled_at) on public.job to authenticated;

-- A skipped stop is off the tech's list, but it was not done: no "Last done" time for it.
create or replace function app.stop_finished(job_status text, done_on date) returns boolean
language sql immutable as $$
  select done_on is not null
    or job_status not in ('unscheduled', 'scheduled', 'in_progress', 'skipped')
$$;

/**
 * The server's part of a skip: who and when (a phone's own time is kept, it may have been
 * offline), clearing it all when the visit is back on, a skipped visit given a day becoming
 * Scheduled again, and Dismiss for owners and admins only.
 */
create or replace function app.stamp_skip() returns trigger
language plpgsql set search_path = public, app, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.status = 'skipped' and new.status = 'skipped'
     and new.scheduled_start is not null
     and new.scheduled_start is distinct from old.scheduled_start then
    -- Rescheduled: the office (or a tech) gave the visit a new day.
    new.status := 'scheduled';
  end if;

  if new.status = 'skipped' then
    if tg_op = 'INSERT' or old.status <> 'skipped' then
      new.skipped_at := coalesce(new.skipped_at, now());
      -- Who: the signed-in person; the server's own runs (the day-end skip) say nobody.
      new.skipped_by := case when current_user in ('authenticated', 'anon') then auth.uid()
                             else new.skipped_by end;
      new.skip_handled_at := null;
      new.skip_handled_by := null;
      new.skip_notified_at := null;
    else
      -- Whoever skipped it, and when, are kept as they were.
      new.skipped_at := old.skipped_at;
      new.skipped_by := old.skipped_by;
      -- Told is the server's to set: a phone can't change it.
      if current_user in ('authenticated', 'anon') then
        new.skip_notified_at := old.skip_notified_at;
      end if;
      if new.skip_handled_at is distinct from old.skip_handled_at then
        if current_user in ('authenticated', 'anon') and not app.is_manager(new.company_id) then
          raise exception 'Only owners and admins can dismiss a skipped visit'
            using errcode = 'insufficient_privilege';
        end if;
        new.skip_handled_by := case when new.skip_handled_at is null then null
                                    else case when current_user in ('authenticated', 'anon')
                                              then auth.uid() else old.skip_handled_by end end;
      else
        new.skip_handled_by := old.skip_handled_by;
      end if;
    end if;
  else
    new.skip_reason := null;
    new.skip_note := null;
    new.skipped_at := null;
    new.skipped_by := null;
    new.skip_handled_at := null;
    new.skip_handled_by := null;
    new.skip_notified_at := null;
  end if;
  return new;
end
$$;

-- Named to run before check_job_status (triggers fire in name order).
create trigger a_stamp_skip before insert or update on public.job
  for each row execute function app.stamp_skip();

-- ---------------------------------------------------------------------------
-- Skip reasons (config rows, per company)
-- ---------------------------------------------------------------------------

create table public.skip_reason (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 100),
  sort_order integer not null default 0,
  active boolean not null default true,
  -- The server's own ('Not Done', for the day-end auto-skip): never offered to pick, never edited.
  system boolean not null default false
);
select app.make_synced('public.skip_reason');

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('skip_reason', 'member', 'manager',
  '{label,sort_order,active}', '{label,sort_order,active,deleted_at}', true, 135);
update app.sync_table set first_download_rank = 1 where table_name = 'skip_reason';

grant select on public.skip_reason to authenticated;
create policy skip_reason_select on public.skip_reason for select to authenticated
  using (app.is_member(company_id));
grant insert (id, company_id, label, sort_order, active) on public.skip_reason to authenticated;
create policy skip_reason_insert on public.skip_reason for insert to authenticated
  with check (app.is_manager(company_id));
grant update (label, sort_order, active, deleted_at) on public.skip_reason to authenticated;
create policy skip_reason_update on public.skip_reason for update to authenticated
  using (app.is_manager(company_id) and not system)
  with check (app.is_manager(company_id) and not system);

create trigger guard_writable before insert or update or delete on public.skip_reason
  for each row execute function app.guard_writable();

select app.speed_up_policies();

insert into app.config_default (key, rows) values ('skip_reason', $json$[
  {"label": "Locked Gate", "sort_order": 10, "system": false},
  {"label": "Dog in Yard", "sort_order": 20, "system": false},
  {"label": "Customer Asked to Skip", "sort_order": 30, "system": false},
  {"label": "Weather", "sort_order": 40, "system": false},
  {"label": "Pool Covered or Closed", "sort_order": 50, "system": false},
  {"label": "No Access", "sort_order": 60, "system": false},
  {"label": "Other", "sort_order": 70, "system": false},
  {"label": "Not Done", "sort_order": 900, "system": true}
]$json$::jsonb);

create or replace function app.seed_skip_reasons(target_company uuid) returns void
language sql security definer set search_path = public, app, pg_temp as $$
  insert into public.skip_reason (company_id, label, sort_order, system)
  select target_company, r.label, r.sort_order, r.system
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(label text, sort_order integer, system boolean)
  where d.key = 'skip_reason'
    and not exists (select 1 from public.skip_reason t
                    where t.company_id = target_company and t.label = r.label
                      and t.deleted_at is null)
$$;

-- Every shop, new ones as they are made and the ones already here.
create or replace function app.seed_skip_reasons_on_company() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.seed_skip_reasons(new.id);
  return new;
end
$$;
create trigger seed_skip_reasons after insert on public.company
  for each row execute function app.seed_skip_reasons_on_company();

select app.seed_skip_reasons(id) from public.company;

revoke all on function app.seed_skip_reasons(uuid), app.seed_skip_reasons_on_company() from public;

-- ---------------------------------------------------------------------------
-- The daily run (service role)
-- ---------------------------------------------------------------------------

/**
 * Skip Unfinished Visits at Day's End: in shops that turned it on, Scheduled maintenance
 * visits from the last three days (the shop's calendar days before today) that were never
 * started become skipped, reason 'Not Done', by nobody. Returns what it skipped.
 */
create or replace function public.auto_skip_visits(at timestamptz default now())
returns table (job_id uuid, company_id uuid)
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  return query
  with due as (
    select j.id
    from public.job j
    join public.company c on c.id = j.company_id
    where j.type = 'maintenance' and j.status = 'scheduled' and j.deleted_at is null
      and coalesce((c.settings ->> 'skip_unfinished_visits')::boolean, false)
      and j.scheduled_start is not null
      and (j.scheduled_start at time zone c.timezone)::date
          between (at at time zone c.timezone)::date - 3 and (at at time zone c.timezone)::date - 1
    for update of j skip locked
  )
  update public.job j
  set status = 'skipped', skip_reason = 'Not Done'
  from due where j.id = due.id
  returning j.id, j.company_id;
end
$$;

/**
 * Skips whose owners and admins haven't been told (the daily catch-up, or one job right after
 * its skip). Each is marked told as it's handed out. skipped_by is null for the day-end run.
 */
create or replace function public.skips_to_notify(only_job uuid default null)
returns table (job_id uuid, company_id uuid, customer text, skip_reason text, skipped_by uuid)
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  return query
  with due as (
    select j.id
    from public.job j
    where j.status = 'skipped' and j.skip_notified_at is null and j.deleted_at is null
      and j.skipped_at > now() - interval '3 days'
      and (only_job is null or j.id = only_job)
    for update of j skip locked
  ),
  marked as (
    update public.job j set skip_notified_at = now()
    from due where j.id = due.id
    returning j.id, j.company_id, j.bill_to_customer_id, j.skip_reason, j.skipped_by
  )
  select m.id, m.company_id, cu.name, m.skip_reason, m.skipped_by
  from marked m left join public.customer cu on cu.id = m.bill_to_customer_id;
end
$$;

revoke all on function public.auto_skip_visits(timestamptz), public.skips_to_notify(uuid)
  from public, anon, authenticated;
grant execute on function public.auto_skip_visits(timestamptz), public.skips_to_notify(uuid)
  to service_role;
