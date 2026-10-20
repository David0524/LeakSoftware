-- Saved reports (owner, 2026-10-20: "Be able to save report templates. Not like AI prompts, but
-- a copy/paste essentially that the tech uses each time").
--
-- A shop's own wording for a report, word for word: a name and the text for any of the report's
-- sections (summary, findings, next_steps, tests; packages/core NARRATIVE_SECTIONS), as a
-- `{key: text}` object. On a report, Use Saved Report fills those sections with it, unchanged.
-- The whole team reads them, offline on a phone too; owners and admins write them, like the
-- report templates (app.is_manager).

create table public.saved_report (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  sections jsonb not null default '{}'::jsonb check (
    jsonb_typeof(sections) = 'object' and length(sections::text) <= 20000
  ),
  sort_order integer not null default 0
);
select app.make_synced('public.saved_report');

-- Access: as the registry generates it (20261012000600_access.sql): members read, owners and
-- admins write.
insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('saved_report', 'member', 'manager', '{name,sections,sort_order}',
  '{name,sections,sort_order,deleted_at}', true, 145);

grant select on public.saved_report to authenticated;
create policy saved_report_select on public.saved_report for select to authenticated
  using (app.is_member(company_id));
grant insert (id, company_id, name, sections, sort_order) on public.saved_report to authenticated;
create policy saved_report_insert on public.saved_report for insert to authenticated
  with check (app.is_manager(company_id));
grant update (name, sections, sort_order, deleted_at) on public.saved_report to authenticated;
create policy saved_report_update on public.saved_report for update to authenticated
  using (app.is_manager(company_id)) with check (app.is_manager(company_id));

-- Read-only (canceled) shops can't change them, like every other synced table.
create trigger guard_writable before insert or update or delete on public.saved_report
  for each row execute function app.guard_writable();

select app.speed_up_policies();
