-- Service issues (docs/design/2026-11-16-service-issues.md): a tech on a visit spots a problem
-- (a leaking pump, a cracked skimmer, a possible leak, a failing heater) and reports it with a
-- few words and photos, so it becomes repair or leak detection work instead of being forgotten.
-- The office sees open issues under Jobs › Issues and on the customer's page, and resolves one
-- (with a note) or turns it into a job: Make Quote (a repair job for the pool, to quote) or Make
-- Leak Detection Job. The new job carries the description and the photos.
--
--   * service_issue: one row per issue, written on the phone (row + outbox), offline too.
--     Members report; only owners and admins change its status (app.service_issue_guard).
--   * media.service_issue_id: an issue's photos and videos are ordinary job media on the visit
--     it was reported on, linked to the issue (the upload queue and storage paths don't change).
--     Making a job copies the rows onto the new job (same file, never re-uploaded), still linked
--     to the issue; a copy made before the original finished uploading turns uploaded with it.
--   * Storage: a copy's file sits under the visit's folder. A tech who sees only their own jobs
--     can read it when the copy is on a job they see (app.object_job_visible).
--   * notified_at: the server's, set when the owners and admins were told (/api/issues/notify).

create table public.service_issue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  customer_id uuid not null,
  property_id uuid not null,
  -- The visit (or any job) it was reported on; null when reported from elsewhere.
  job_id uuid,
  description text not null check (length(trim(description)) between 1 and 2000),
  -- The work the tech suggests (job types): a repair or leak detection; null when not sure.
  suggested_type text check (suggested_type in ('repair', 'detection')),
  status text not null default 'open' check (status in ('open', 'resolved', 'converted')),
  resolution_note text check (resolution_note is null or length(resolution_note) <= 1000),
  resolved_by uuid,
  resolved_at timestamptz,
  -- The job it became (Make Quote, Make Leak Detection Job).
  converted_job_id uuid,
  reported_by uuid default auth.uid(),
  reported_at timestamptz not null default now(),
  notified_at timestamptz,
  check (status <> 'converted' or converted_job_id is not null),
  foreign key (customer_id, company_id) references public.customer (id, company_id),
  foreign key (property_id, company_id) references public.property (id, company_id),
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (converted_job_id, company_id) references public.job (id, company_id),
  foreign key (company_id, reported_by) references public.membership (company_id, user_id),
  foreign key (company_id, resolved_by) references public.membership (company_id, user_id)
);
select app.make_synced('public.service_issue');
create index service_issue_open_idx on public.service_issue (company_id, reported_at desc)
  where status = 'open' and deleted_at is null;
create index service_issue_customer_idx on public.service_issue (customer_id);
create index service_issue_job_idx on public.service_issue (job_id) where job_id is not null;

-- ---------------------------------------------------------------------------
-- Access: as the registry generates it (20261012000600_access.sql): members read and write.
-- A tech who sees only their own jobs sees the issues they reported and those on their jobs.
-- Phones keep an issue with its visit (20261012003400_phone_history_window.sql); one with no
-- visit always syncs. Status, resolution and conversion are client-writable (the office's
-- phones resolve offline too), but only owners and admins may change them.
-- ---------------------------------------------------------------------------

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order,
   job_ref)
values ('service_issue', 'member', 'member',
  '{customer_id,property_id,job_id,description,suggested_type,reported_at,reported_by}',
  '{description,suggested_type,status,resolution_note,resolved_by,resolved_at,converted_job_id,deleted_at}',
  true, 312, 't.job_id');

grant select on public.service_issue to authenticated;
create policy service_issue_select on public.service_issue for select to authenticated
  using (app.is_member(company_id));
grant insert (id, company_id, customer_id, property_id, job_id, description, suggested_type,
  reported_at, reported_by) on public.service_issue to authenticated;
create policy service_issue_insert on public.service_issue for insert to authenticated
  with check (app.is_member(company_id));
grant update (description, suggested_type, status, resolution_note, resolved_by, resolved_at,
  converted_job_id, deleted_at) on public.service_issue to authenticated;
create policy service_issue_update on public.service_issue for update to authenticated
  using (app.is_member(company_id)) with check (app.is_member(company_id));
-- Written in the once-per-query form (20261012003200_fast_row_security.sql).
create policy service_issue_visible on public.service_issue as restrictive for all
  to authenticated
  using (company_id = any ((select app.all_jobs_companies())::uuid[])
         or reported_by = (select auth.uid())
         or (job_id is not null and app.job_visible(company_id, job_id)))
  with check (company_id = any ((select app.all_jobs_companies())::uuid[])
              or reported_by = (select auth.uid())
              or (job_id is not null and app.job_visible(company_id, job_id)));

-- Read-only (canceled) shops can't report issues, like every other synced table.
create trigger guard_writable before insert or update or delete on public.service_issue
  for each row execute function app.guard_writable();

select app.speed_up_policies();

/**
 * Only owners and admins resolve, reopen or convert an issue; a member's report is always
 * open and reported by them. Members only: the server and seeds are trusted.
 */
create or replace function app.service_issue_guard() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.reported_by := auth.uid();
    return new;
  end if;
  if (new.status, new.resolution_note, new.resolved_by, new.resolved_at, new.converted_job_id)
     is distinct from
     (old.status, old.resolution_note, old.resolved_by, old.resolved_at, old.converted_job_id)
     and not app.is_manager(new.company_id) then
    raise exception 'Only owners and admins can resolve or convert an issue'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
create trigger service_issue_guard before insert or update on public.service_issue
  for each row execute function app.service_issue_guard();

-- ---------------------------------------------------------------------------
-- An issue's photos and videos are job media linked to it
-- ---------------------------------------------------------------------------

alter table public.media add column service_issue_id uuid,
  add foreign key (service_issue_id, company_id) references public.service_issue (id, company_id);
create index media_service_issue_idx on public.media (service_issue_id)
  where service_issue_id is not null;
create index media_storage_path_idx on public.media (storage_path) where storage_path is not null;

-- Access: as the registry generates it (20261012000600_access.sql). Set when the row is made.
update app.sync_table
set insert_columns = insert_columns || '{service_issue_id}'
where table_name = 'media';
grant insert (service_issue_id) on public.media to authenticated;

-- 20261012004400_security_audit_fixes.sql, item 7, plus: a picture's issue is on the same job
-- (the visit it was reported on), or the picture is a copy on the job the issue became.
create or replace function app.same_job_refs() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  bad boolean := false;
begin
  -- Members only; the server and seeds are trusted.
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if tg_table_name = 'signature' then
    bad := (new.quote_id is not null and not exists (
              select 1 from public.quote where id = new.quote_id and job_id = new.job_id))
        or (new.report_id is not null and not exists (
              select 1 from public.report where id = new.report_id and job_id = new.job_id));
  elsif tg_table_name = 'media' then
    bad := (new.finding_id is not null and not exists (
              select 1 from public.finding where id = new.finding_id and job_id = new.job_id))
        or (new.test_result_id is not null and not exists (
              select 1 from public.test_result where id = new.test_result_id and job_id = new.job_id))
        or (new.job_component_id is not null and not exists (
              select 1 from public.job_component where id = new.job_component_id and job_id = new.job_id))
        or (new.service_issue_id is not null and not exists (
              select 1 from public.service_issue
              where id = new.service_issue_id
                and (job_id = new.job_id or converted_job_id = new.job_id)));
  elsif tg_table_name = 'quote_line_item' then
    bad := new.finding_id is not null and not exists (
             select 1 from public.finding f join public.quote q on q.job_id = f.job_id
             where f.id = new.finding_id and q.id = new.quote_id);
  end if;
  if bad then
    raise exception 'That belongs to a different job' using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;

drop trigger if exists same_job_refs on public.media;
create trigger same_job_refs
  before insert or update of job_id, finding_id, test_result_id, job_component_id, service_issue_id
  on public.media for each row execute function app.same_job_refs();

/**
 * A copy of an issue's picture (same file) is uploaded once the original is: made after, it
 * starts uploaded; made before, the original's upload marks it. Written with the server's
 * clock, not the clocks of the row a phone pushed (as app.job_repair_fee).
 */
create or replace function app.media_copy_uploaded() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  clocks text;
begin
  if tg_op = 'INSERT' then
    if new.service_issue_id is not null and new.upload_state = 'pending'
       and new.storage_path is not null
       and exists (select 1 from public.media m
                   where m.storage_path = new.storage_path and m.company_id = new.company_id
                     and m.upload_state = 'uploaded') then
      new.upload_state := 'uploaded';
    end if;
    return new;
  end if;
  -- After the original's update.
  clocks := current_setting('leakbook.field_hlc', true);
  perform set_config('leakbook.field_hlc', '', true);
  update public.media set upload_state = 'uploaded'
  where storage_path = new.storage_path and company_id = new.company_id and id <> new.id
    and upload_state = 'pending';
  perform set_config('leakbook.field_hlc', coalesce(clocks, ''), true);
  return null;
end
$$;
create trigger media_copy_uploaded before insert on public.media
  for each row execute function app.media_copy_uploaded();
create trigger media_copies_uploaded after update of upload_state on public.media
  for each row when (new.upload_state = 'uploaded' and old.upload_state = 'pending'
                     and new.service_issue_id is not null and new.storage_path is not null)
  execute function app.media_copy_uploaded();

-- Stored files under a job (20261012002800_visibility_functions.sql), plus: an issue's picture
-- kept under the visit's folder, copied onto the job the issue became, is readable by whoever
-- sees that job. Only a file under the issue's own visit qualifies, so a copy can't reach into
-- another job's folder.
create or replace function app.object_job_visible(object_name text) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case
    when app.try_uuid((storage.foldername(object_name))[2]) is null then true
    when app.job_visible(app.object_company(object_name),
                         app.try_uuid((storage.foldername(object_name))[2])) then true
    else exists (
      select 1 from public.media m
      join public.service_issue i on i.id = m.service_issue_id and i.company_id = m.company_id
      where m.storage_path = object_name
        and m.company_id = app.object_company(object_name)
        and m.deleted_at is null
        and i.job_id = app.try_uuid((storage.foldername(object_name))[2])
        and m.job_id = i.converted_job_id
        and app.job_visible(m.company_id, m.job_id))
  end
$$;
