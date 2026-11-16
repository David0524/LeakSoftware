-- Pool equipment on the customer's page (owner, 2026-11-16: "chlorine or salt pool, spa or no
-- spa, pool gallons, gate code, does it have heater, solar heater"; Nick keeps paper notes on who
-- has a solar heater, because those need draining before a freeze). Pool type, gallons, spa and
-- access notes were already there; property.notes becomes "Pool notes", kept apart from access
-- notes as asked.
--
-- * sanitizer: chlorine, salt, bromine or other; empty is "Not sure".
-- * heater: none, gas, heat pump, electric or other; empty is "Not sure".
-- * has_solar_heater: a solar heater, apart from the heater (a pool can have both).
-- Client-writable like their neighbors, so techs set them offline from the app.

alter table public.property
  add column sanitizer text check (sanitizer in ('chlorine', 'salt', 'bromine', 'other')),
  add column heater text check (heater in ('none', 'gas', 'heat_pump', 'electric', 'other')),
  add column has_solar_heater boolean not null default false;

-- Access: as the registry generates it (20261012000600_access.sql).
update app.sync_table
set insert_columns = insert_columns || '{sanitizer,heater,has_solar_heater}',
    update_columns = update_columns || '{sanitizer,heater,has_solar_heater}'
where table_name = 'property';
grant insert (sanitizer, heater, has_solar_heater), update (sanitizer, heater, has_solar_heater)
  on public.property to authenticated;
