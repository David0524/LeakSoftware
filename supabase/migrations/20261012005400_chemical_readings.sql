-- Chemical readings log (owner, 2026-10-19: "Add 'submit' on chemical page. This would be a
-- new feature that keeps a weekly note of a pool's chemical readings. You will submit your
-- left side entries.").
--
-- One row per submit from the Chemical screen: the pool's gallons and the readings the tech
-- typed (the left side), with the products they dose with. Belongs to a pool; a visit that
-- opened the screen is noted too. Pools are visible to the whole team, so readings are too.
-- Anyone on the team adds them, offline on a phone as well; a mistake is corrected or
-- removed (soft delete) by anyone on the team.

create table public.chemical_reading (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  property_id uuid not null,
  -- The visit it was taken on, when the screen was opened from one.
  job_id uuid,
  recorded_at timestamptz not null default now(),
  recorded_by uuid default auth.uid(),
  gallons integer check (gallons > 0),
  -- Readings: blank when not tested. Same names as packages/core/src/chemistry.ts.
  fc numeric(5, 2) check (fc between 0 and 100),
  ph numeric(4, 2) check (ph between 0 and 14),
  ta numeric(6, 1) check (ta between 0 and 1000),
  ch numeric(6, 1) check (ch between 0 and 5000),
  cya numeric(6, 1) check (cya between 0 and 1000),
  salt numeric(7, 1) check (salt between 0 and 20000),
  chlorine_product text,
  acid_product text,
  notes text,
  check (num_nonnulls(fc, ph, ta, ch, cya, salt) > 0),
  foreign key (property_id, company_id) references public.property (id, company_id),
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (company_id, recorded_by) references public.membership (company_id, user_id)
);
select app.make_synced('public.chemical_reading');
create index chemical_reading_property_idx on public.chemical_reading (property_id, recorded_at desc);

-- Access: as the registry generates it (20261012000600_access.sql): members read and write.
insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('chemical_reading', 'member', 'member',
  '{property_id,job_id,recorded_at,gallons,fc,ph,ta,ch,cya,salt,chlorine_product,acid_product,notes}',
  '{gallons,fc,ph,ta,ch,cya,salt,chlorine_product,acid_product,notes,deleted_at}', true, 307);

grant select on public.chemical_reading to authenticated;
create policy chemical_reading_select on public.chemical_reading for select to authenticated
  using (app.is_member(company_id));
grant insert (id, company_id, property_id, job_id, recorded_at, gallons, fc, ph, ta, ch, cya,
  salt, chlorine_product, acid_product, notes) on public.chemical_reading to authenticated;
create policy chemical_reading_insert on public.chemical_reading for insert to authenticated
  with check (app.is_member(company_id));
grant update (gallons, fc, ph, ta, ch, cya, salt, chlorine_product, acid_product, notes,
  deleted_at) on public.chemical_reading to authenticated;
create policy chemical_reading_update on public.chemical_reading for update to authenticated
  using (app.is_member(company_id)) with check (app.is_member(company_id));

-- Read-only (canceled) shops can't add readings, like every other synced table.
create trigger guard_writable before insert or update or delete on public.chemical_reading
  for each row execute function app.guard_writable();

select app.speed_up_policies();
