-- Pool diagrams (owner, 2026-10-19): "More customization to pool shape. Be able to place the
-- spa wherever." and "Add markup tools to the pool diagrams. Ties in with the new pool shape."
--
-- * Three more shapes: Roman, Grecian, and Figure 8 (packages/core/src/inspection.ts).
-- * property.diagram_layout: the shape mirrored left to right, and the spa's place, size, and
--   shape ({"mirror": true, "spa": {"x": 0.9, "y": 0.2, "size": "large", "shape": "square"}},
--   x and y 0..1 of the diagram). Empty: as before.
-- * job.diagram_markup: pen, arrows, circles, and labels drawn on the job's diagram, the same
--   format as media.markup ({"version": 1, "shapes": [...]}, 0..1 of the diagram). Per job:
--   each visit marks what it found.
-- Both are client-writable like their neighbors, and reports carry them in their snapshot.

alter table public.property drop constraint property_diagram_shape_check;
alter table public.property add constraint property_diagram_shape_check
  check (diagram_shape in ('rectangle', 'oval', 'kidney', 'l_shape', 'freeform', 'roman',
                           'grecian', 'figure_eight'));

alter table public.property add column diagram_layout jsonb
  check (diagram_layout is null or jsonb_typeof(diagram_layout) = 'object');
alter table public.job add column diagram_markup jsonb
  check (diagram_markup is null or jsonb_typeof(diagram_markup) = 'object');

-- Access: as the registry generates it (20261012000600_access.sql).
update app.sync_table
set insert_columns = insert_columns || '{diagram_layout}',
    update_columns = update_columns || '{diagram_layout}'
where table_name = 'property';
grant insert (diagram_layout), update (diagram_layout) on public.property to authenticated;

update app.sync_table
set insert_columns = insert_columns || '{diagram_markup}',
    update_columns = update_columns || '{diagram_markup}'
where table_name = 'job';
grant insert (diagram_markup), update (diagram_markup) on public.job to authenticated;

-- Reports: the snapshot as before (20261012002700_signature_replace.sql), with the pool's
-- layout and the job's diagram markup.
alter function app.report_snapshot(uuid) rename to report_snapshot_m10;
create or replace function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when s is null then null else s
    || jsonb_build_object(
         'property', coalesce(s -> 'property', '{}'::jsonb)
           || jsonb_build_object('diagram_layout', (
                select p.diagram_layout from public.job j
                join public.property p on p.id = j.property_id where j.id = target_job)),
         'job', coalesce(s -> 'job', '{}'::jsonb)
           || jsonb_build_object('diagram_markup', (
                select j.diagram_markup from public.job j where j.id = target_job)))
  end
  from app.report_snapshot_m10(target_job) s
$$;
revoke all on function app.report_snapshot(uuid), app.report_snapshot_m10(uuid) from public;
