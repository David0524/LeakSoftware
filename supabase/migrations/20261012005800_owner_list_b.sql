-- The owner's second list, 2026-10-19 (docs/plans/owner-list-2026-10-19b.md).

-- ---------------------------------------------------------------------------
-- Cleanings reach phones (owner: "Sync"), and a filter's last replacement can be set
-- ---------------------------------------------------------------------------

-- Phones read a plan's cleanings like the website does, for countdowns and the Today pills.
-- Owners can say when a filter was last replaced, so its age shows from the start.
update app.sync_table
set device_sync = true,
    insert_columns = insert_columns || '{last_done_on}',
    update_columns = update_columns || '{last_done_on}'
where table_name = 'plan_cleaning';

grant insert (last_done_on) on public.plan_cleaning to authenticated;
grant update (last_done_on) on public.plan_cleaning to authenticated;

-- ---------------------------------------------------------------------------
-- Replace filter: a third item on a schedule, separate from Clean filter
-- ---------------------------------------------------------------------------

-- Owner: "add a 3rd replace filter tracker. Separate from clean filter. Then you put a new
-- filter in, we track filter age." The age is from the plan cleaning's last_done_on.
update app.config_default
set rows = rows || $json$[
  {"key": "svc_filter_replace", "name": "Replace filter", "section": "service", "answer": "done", "job_type": "maintenance", "on_schedule": true, "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Service"], "sort_order": 547}
]$json$::jsonb
where key = 'component_type'
  and not exists (select 1 from jsonb_array_elements(rows) r where r ->> 'key' = 'svc_filter_replace');

-- Pool shops get it now (only where missing).
insert into public.component_type
  (company_id, key, name, section, answer, job_type, on_schedule, allows_multiple,
   default_count, applies_to, methods, sort_order)
select co.id, 'svc_filter_replace', 'Replace filter', 'service', 'done', 'maintenance', true,
       false, 1, 'both', '{Service}', 547
from public.company co
where exists (select 1 from public.component_type t
              where t.company_id = co.id and t.job_type = 'maintenance' and t.deleted_at is null)
  and not exists (select 1 from public.component_type t
                  where t.company_id = co.id and t.key = 'svc_filter_replace'
                    and t.deleted_at is null);

-- ---------------------------------------------------------------------------
-- From the Customer: gallons instead of "Size of the pool"
-- ---------------------------------------------------------------------------

-- New Job asks for the pool's gallons (saved on the pool) instead.
update public.company
set settings = jsonb_set(settings, '{intake_questions}', (
  select coalesce(jsonb_agg(q order by ord), '[]'::jsonb)
  from jsonb_array_elements(settings -> 'intake_questions') with ordinality as e(q, ord)
  where q ->> 'key' <> 'pool_size'))
where jsonb_typeof(settings -> 'intake_questions') = 'array'
  and exists (select 1 from jsonb_array_elements(settings -> 'intake_questions') q
              where q ->> 'key' = 'pool_size');

-- New shops too: the column default without the question (as 20261012004600 edits it).
do $$
declare
  current_default jsonb;
begin
  execute 'select ' || pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.company'::regclass and a.attname = 'settings'
  into current_default;
  current_default := jsonb_set(current_default, '{intake_questions}', (
    select coalesce(jsonb_agg(q order by ord), '[]'::jsonb)
    from jsonb_array_elements(current_default -> 'intake_questions') with ordinality as e(q, ord)
    where q ->> 'key' <> 'pool_size'));
  execute format('alter table public.company alter column settings set default %L::jsonb',
                 current_default);
end
$$;

-- ---------------------------------------------------------------------------
-- A pool drawn by hand
-- ---------------------------------------------------------------------------

-- Clear empties the diagram for drawing from nothing: no preset outline.
alter table public.property drop constraint property_diagram_shape_check;
alter table public.property add constraint property_diagram_shape_check
  check (diagram_shape in ('rectangle', 'oval', 'kidney', 'l_shape', 'freeform', 'roman',
                           'grecian', 'figure_eight', 'custom'));
