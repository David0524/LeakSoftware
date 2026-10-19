-- Owner's second list of 2026-10-19: cleanings reach phones and a filter's last replacement
-- can be set (owners only), the Replace filter item, no pool size question, and a pool drawn
-- by hand.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated, anon, service_role;

-- Cleanings sync to phones
select ok((select device_sync from app.sync_table where table_name = 'plan_cleaning'),
  'plan_cleaning syncs to phones');
select ok((select 'last_done_on' = any (update_columns) from app.sync_table
           where table_name = 'plan_cleaning'), 'last_done_on is client-writable');

select tests.authenticate_as((select owner_a from ids));
select is(tests.rows_affected(format($$ update plan_cleaning set last_done_on = current_date - 240
  where company_id = %L $$, (select ca from ids))), 1::bigint,
  'an owner sets when the filter was last replaced');
reset role;
select tests.authenticate_as((select tech_a from ids));
select is((select count(*) from plan_cleaning where company_id = (select ca from ids)), 1::bigint,
  'a tech reads the plan''s cleanings');
select is(tests.rows_affected(format($$ update plan_cleaning set last_done_on = current_date
  where company_id = %L $$, (select ca from ids))), 0::bigint,
  'a tech can''t change a plan''s cleanings');
reset role;

-- Replace filter
select ok(exists (select 1 from app.config_default d, jsonb_array_elements(d.rows) r
                  where d.key = 'component_type' and r ->> 'key' = 'svc_filter_replace'
                    and (r ->> 'on_schedule')::boolean),
  'new pool shops get Replace filter, on a schedule');
select is((select count(*) from app.config_default d, jsonb_array_elements(d.rows) r
           where d.key = 'component_type' and r ->> 'key' = 'svc_filter_replace'), 1::bigint,
  'once');

-- No pool size question
select ok(not exists (select 1 from public.company c,
                      jsonb_array_elements(c.settings -> 'intake_questions') q
                      where q ->> 'key' = 'pool_size'),
  'no shop asks the pool size question');
insert into public.company (name, timezone) values ('Fresh Shop', 'America/Phoenix');
select ok((select not exists (select 1 from jsonb_array_elements(settings -> 'intake_questions') q
                              where q ->> 'key' = 'pool_size')
                  and jsonb_array_length(settings -> 'intake_questions') = 2
                  and (settings -> 'deposit' ->> 'value_bps') = '0'
           from public.company where name = 'Fresh Shop'),
  'a new shop starts without it, keeping the other defaults');

-- A pool drawn by hand
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update property set diagram_shape = 'custom',
  diagram_layout = '{"drawing": [{"type": "line", "x1": 0.1, "y1": 0.1, "x2": 0.9, "y2": 0.1}],
                     "landmarks": [{"kind": "tree", "x": 0.05, "y": 0.9}]}'
  where id = %L $$, (select prop_a from ids)), 'a pool can be drawn from nothing');
select throws_ok(format($$ update property set diagram_shape = 'hexagon' where id = %L $$,
  (select prop_a from ids)), '23514', null, 'an unknown shape is refused');
reset role;

-- Complete Job straight from Scheduled
select ok(exists (select 1 from app.job_status_transition
                  where from_status = 'scheduled' and to_status = 'done'),
  'a scheduled visit can be completed');

select * from finish();
rollback;
