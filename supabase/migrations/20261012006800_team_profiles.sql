-- Team profiles (owner, 2026-10-20: "owner/admin can add a technician profile for each
-- tech/employee. It'll just have their basic info like name, phone, email, address, emergency
-- contact, and any notes.")
--
-- One profile per person who works for the shop: a team member (user_id, their membership in
-- this shop), or someone without the app (no user_id). Address, emergency contact and notes are
-- private, so only owners and admins read and write them (app.is_manager), on the website and
-- on their phones.

create table public.team_profile (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  user_id uuid,
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text check (phone is null or length(phone) <= 40),
  email text check (email is null or length(email) <= 254),
  address text check (address is null or length(address) <= 400),
  emergency_name text check (emergency_name is null or length(emergency_name) <= 120),
  emergency_phone text check (emergency_phone is null or length(emergency_phone) <= 40),
  notes text check (notes is null or length(notes) <= 4000),
  foreign key (company_id, user_id) references public.membership (company_id, user_id)
);
select app.make_synced('public.team_profile');
-- One profile per team member.
create unique index team_profile_member_key on public.team_profile (company_id, user_id)
  where user_id is not null and deleted_at is null;

-- Access: as the registry generates it (20261012000600_access.sql): owners and admins only.
insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('team_profile', 'manager', 'manager',
  '{user_id,name,phone,email,address,emergency_name,emergency_phone,notes}',
  '{name,phone,email,address,emergency_name,emergency_phone,notes,deleted_at}', true, 146);

grant select on public.team_profile to authenticated;
create policy team_profile_select on public.team_profile for select to authenticated
  using (app.is_manager(company_id));
grant insert (id, company_id, user_id, name, phone, email, address, emergency_name,
              emergency_phone, notes)
  on public.team_profile to authenticated;
create policy team_profile_insert on public.team_profile for insert to authenticated
  with check (app.is_manager(company_id));
grant update (name, phone, email, address, emergency_name, emergency_phone, notes, deleted_at)
  on public.team_profile to authenticated;
create policy team_profile_update on public.team_profile for update to authenticated
  using (app.is_manager(company_id)) with check (app.is_manager(company_id));

-- Read-only (canceled) shops can't change them, like every other synced table.
create trigger guard_writable before insert or update or delete on public.team_profile
  for each row execute function app.guard_writable();

select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- Centered pools (owner, 2026-10-20: "Pool shapes are not centered in the diagram")
-- ---------------------------------------------------------------------------

-- Pools drawn 10 units left of the middle until now; nothing placed on them yet (no spa spot,
-- landmarks or drawing, no finding pinned or markup drawn on any of their jobs) moves to the
-- middle now. The others move when their shape is next saved, with what's placed on them
-- (packages/core centerLayout). Sent reports keep the layout they were sent with.
update public.property p
set diagram_layout = coalesce(p.diagram_layout, '{}'::jsonb) || '{"centered": true}'::jsonb
where p.deleted_at is null
  and not coalesce((p.diagram_layout ->> 'centered')::boolean, false)
  and not (coalesce(p.diagram_layout, '{}'::jsonb) ?| array['spa', 'landmarks', 'drawing'])
  and not exists (select 1 from public.job j
                  join public.finding f on f.job_id = j.id and f.deleted_at is null
                  where j.property_id = p.id and f.pin_x is not null)
  and not exists (select 1 from public.job j
                  where j.property_id = p.id and j.diagram_markup is not null
                    and j.diagram_markup <> 'null'::jsonb);
