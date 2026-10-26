-- Owner, 2026-10-26: "In the bond beam section can we add an additional item called 'tile and
-- grout'." and "At the bottom of the checklist, add an item... make it possible for the user to
-- type in a new item. There sometimes is weird things at a pool that we may need to type in."

-- ---------------------------------------------------------------------------
-- Tile and grout, in the bond beam section (after Pool and Spa)
-- ---------------------------------------------------------------------------

update app.config_default
set rows = rows || $json$[
  {"key": "tile_grout", "name": "Tile and grout", "section": "bond_beam", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Dye test", "Visual"], "sort_order": 315}
]$json$::jsonb
where key = 'component_type'
  and not exists (select 1 from jsonb_array_elements(rows) r where r ->> 'key' = 'tile_grout');

-- Shops that have the bond beam section get it now, only where they don't already have an item
-- by that name (their own edits stay as they are). New jobs take it; started jobs don't.
create or replace function app.add_tile_grout_item(target_company uuid) returns void
language sql security definer set search_path = public, app, pg_temp as $$
  insert into public.component_type
    (company_id, key, name, section, answer, job_type, allows_multiple, default_count,
     applies_to, methods, sort_order)
  select target_company, 'tile_grout', 'Tile and grout', 'bond_beam', 'leak', 'detection', false, 1,
         'both', '{"Dye test","Visual"}', 315
  where exists (select 1 from public.component_type t
                where t.company_id = target_company and t.section = 'bond_beam'
                  and t.deleted_at is null)
    and not exists (select 1 from public.component_type t
                    where t.company_id = target_company and t.deleted_at is null
                      and (t.key = 'tile_grout' or lower(t.name) = 'tile and grout'));
$$;
revoke all on function app.add_tile_grout_item(uuid) from public;

select app.add_tile_grout_item(id) from public.company;

-- ---------------------------------------------------------------------------
-- Items typed in on a job
-- ---------------------------------------------------------------------------

-- A job_component needs a component_type (the report, both phones and the website read its
-- section and answers), and already carries its own name (`label`, written by the client). So a
-- typed-in item is a job_component whose label is what the tech typed and whose type is one
-- hidden, per-shop stand-in: custom_leak (leak detection: Other section, Leaking / Not leaking /
-- Needs attention) or custom_visit (maintenance visit: the service list, Done / Needs Attention
-- / Skipped). The stand-ins are inactive, so no new job copies them and no "add an item" list
-- offers them; they sort last. They are never shown as shop settings. The item belongs to the
-- job alone, syncs as job_component + checklist_item_result rows like any other, and a report
-- reads it from the same snapshot. No new column or policy is needed: label and
-- component_type_id are already client-writable.
create or replace function app.add_custom_item_types(target_company uuid, pkg text)
returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if pkg = 'leak' then
    insert into public.component_type
      (company_id, key, name, section, answer, job_type, allows_multiple, default_count,
       applies_to, methods, sort_order, active)
    select target_company, 'custom_leak', 'Added on the job', 'other', 'leak', 'detection', true, 0,
           'both', '{Visual}', 9000, false
    where not exists (select 1 from public.component_type t
                      where t.company_id = target_company and t.key = 'custom_leak'
                        and t.deleted_at is null);
  elsif pkg = 'pool' then
    insert into public.component_type
      (company_id, key, name, section, answer, job_type, allows_multiple, default_count,
       applies_to, methods, sort_order, active)
    select target_company, 'custom_visit', 'Added on the job', 'service', 'done', 'maintenance',
           true, 0, 'both', '{Service}', 9100, false
    where not exists (select 1 from public.component_type t
                      where t.company_id = target_company and t.key = 'custom_visit'
                        and t.deleted_at is null);
  end if;
end
$$;
revoke all on function app.add_custom_item_types(uuid, text) from public;

alter function app.seed_package_defaults(uuid, text) rename to seed_package_defaults_before_custom_items;
create or replace function app.seed_package_defaults(target_company uuid, pkg text) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.seed_package_defaults_before_custom_items(target_company, pkg);
  perform app.add_custom_item_types(target_company, pkg);
end
$$;
revoke all on function app.seed_package_defaults(uuid, text),
  app.seed_package_defaults_before_custom_items(uuid, text) from public;

-- Shops already doing leak detection or pool care.
select app.add_custom_item_types(co.id, 'leak')
from public.company co
where exists (select 1 from public.component_type t
              where t.company_id = co.id and t.job_type = 'detection' and t.deleted_at is null);
select app.add_custom_item_types(co.id, 'pool')
from public.company co
where exists (select 1 from public.component_type t
              where t.company_id = co.id and t.job_type = 'maintenance' and t.deleted_at is null);
