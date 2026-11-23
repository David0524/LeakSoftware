-- End the day at the shop or at home, apart from where it starts (owner, 2026-11-23: "He wants
-- to make it so you can individually change the start and finish location. This way he can do
-- start location at the shop, and finish location at home"; docs/design/2026-10-21-start-from-home.md,
-- "End location").
--
-- member_start.end_at: where this person's routes end, 'shop' or 'home', next to start_from. A
-- home end uses the same home address and coordinates as a home start. Existing rows end where
-- they start, so nobody's routes change.

alter table public.member_start
  add column end_at text not null default 'shop' check (end_at in ('shop', 'home'));
update public.member_start set end_at = start_from where end_at is distinct from start_from;

-- The person writes it from their phone like the rest of the row: registered as client-writable
-- and granted from the registry, as 20261012008000_start_from_home.sql does.
update app.sync_table
set insert_columns = insert_columns || '{end_at}',
    update_columns = update_columns || '{end_at}'
where table_name = 'member_start';

do $$
declare
  t app.sync_table;
begin
  select * into strict t from app.sync_table where table_name = 'member_start';
  execute format('grant insert (%s) on public.%I to authenticated',
    array_to_string(t.insert_columns, ', '), t.table_name);
  execute format('grant update (%s) on public.%I to authenticated',
    array_to_string(t.update_columns, ', '), t.table_name);
end
$$;
