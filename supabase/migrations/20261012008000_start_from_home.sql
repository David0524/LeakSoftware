-- Start the day from home or from the shop (owner, 2026-10-21: "Techs/owners need to be able to
-- set if they start their day from home or from the shop"; docs/design/2026-10-21-start-from-home.md).
--
-- member_start: one row per team member who has chosen where their day starts. No row (or
-- start_from 'shop') means the shop. A home start counts only once its address is found on the
-- map (home_latitude/home_longitude for home_geocoded_address; packages/core startFor).
--
-- Why a table of its own and not columns on membership: every member reads every membership row
-- of their shop (the team list syncs to every phone, read role 'member'), and the sync layer
-- pulls whole rows, so a home address there would reach every tech's phone. Here the person
-- reads and writes their own row, owners and admins everyone's, and nobody else sees it.
--
-- Writes go through the sync layer like every other synced row (row + outbox), so there's no
-- set_my_start() function: the row policies below allow the person's own row. The registry says
-- 'manager' (what tenant isolation checks for teammates); the policies add "or your own row".
--
-- Coordinates are found like a pool's (apps/web/src/server/route-days.ts locatePropertyWith):
-- the app writes home_address and clears the coordinates in the same write; the website then
-- looks the address up as that person (free lookups first) and writes home_latitude,
-- home_longitude and home_geocoded_address, or only home_geocoded_address when it isn't found,
-- so the same address isn't tried again.

create table public.member_start (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  user_id uuid not null,
  start_from text not null default 'shop' check (start_from in ('shop', 'home')),
  home_address text check (home_address is null or length(home_address) <= 400),
  home_latitude double precision check (home_latitude between -90 and 90),
  home_longitude double precision check (home_longitude between -180 and 180),
  home_geocoded_address text
    check (home_geocoded_address is null or length(home_geocoded_address) <= 400),
  check ((home_latitude is null) = (home_longitude is null)),
  foreign key (company_id, user_id) references public.membership (company_id, user_id)
);
select app.make_synced('public.member_start');
-- One start per team member.
create unique index member_start_member_key on public.member_start (company_id, user_id)
  where deleted_at is null;

-- A changed address drops the old coordinates (unless the same write sets new ones), so a day
-- never starts at a house someone moved out of.
create function app.member_start_address_changed() returns trigger
language plpgsql as $$
begin
  if new.home_address is distinct from old.home_address
     and new.home_latitude is not distinct from old.home_latitude
     and new.home_longitude is not distinct from old.home_longitude then
    new.home_latitude := null;
    new.home_longitude := null;
    new.home_geocoded_address := null;
  end if;
  return new;
end
$$;
revoke all on function app.member_start_address_changed() from public;
create trigger member_start_address_changed before update on public.member_start
  for each row execute function app.member_start_address_changed();

-- Read-only (canceled) shops can't change it, like every other synced table.
create trigger guard_writable before insert or update or delete on public.member_start
  for each row execute function app.guard_writable();

-- ---------------------------------------------------------------------------
-- Access, from the registry (as 20261012000600_access.sql), plus the person's own row.
-- ---------------------------------------------------------------------------

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('member_start', 'manager', 'manager',
  '{user_id,start_from,home_address,home_latitude,home_longitude,home_geocoded_address}',
  '{start_from,home_address,home_latitude,home_longitude,home_geocoded_address,deleted_at}',
  true, 147);

do $$
declare
  t app.sync_table;
  own text := '(user_id = (select auth.uid()) and app.is_member(company_id))';
  read_check text;
  write_check text;
begin
  select * into strict t from app.sync_table where table_name = 'member_start';
  read_check := format('app.is_%s(company_id) or %s', t.read_role, own);
  write_check := format('app.is_%s(company_id) or %s', t.write_role, own);
  execute format('grant select on public.%I to authenticated', t.table_name);
  execute format('create policy %I on public.%I for select to authenticated using (%s)',
    t.table_name || '_select', t.table_name, read_check);
  execute format('grant insert (id, company_id, %s) on public.%I to authenticated',
    array_to_string(t.insert_columns, ', '), t.table_name);
  execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
    t.table_name || '_insert', t.table_name, write_check);
  execute format('grant update (%s) on public.%I to authenticated',
    array_to_string(t.update_columns, ', '), t.table_name);
  execute format(
    'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
    t.table_name || '_update', t.table_name, write_check, write_check);
end
$$;

select app.speed_up_policies();
