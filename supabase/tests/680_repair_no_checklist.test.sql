-- No checklist on repair jobs (owner, 2026-10-22: "Remove the checklist entirely for repair
-- jobs."): New Job never gives one checklist rows, and rows an older repair job has don't hold
-- up its report or show on it. Leak detection is as it was.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'customer')::uuid as cust_a,
  (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated, anon;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon;
insert into st select 'skimmer', id from component_type
  where company_id = (select ca from ids) and key = 'skimmer';

-- New Job › Repair with checklist items sent anyway (an older app): none are made.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ insert into st select 'repair', create_job(%1$L, null, %2$L, null, %3$L,
  '{"type": "repair", "status": "in_progress", "intake": {"repair_item": "Pump seal"}}',
  jsonb_build_array(jsonb_build_object('component_type_id', %4$L, 'instance_number', 1,
                                       'label', 'Skimmer', 'sort_order', 1))) $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids),
  (select v from st where k = 'skimmer')), 'a repair job is made');
select is((select count(*)::int from job_component
           where job_id = (select v::uuid from st where k = 'repair')), 0,
  'with no checklist items, whatever the client sent');
select is((select count(*)::int from checklist_item_result
           where job_id = (select v::uuid from st where k = 'repair')), 0,
  'and no checklist answers');

-- Leak detection still gets the items it was sent.
select lives_ok(format($$ insert into st select 'leak', create_job(%1$L, null, %2$L, null, %3$L,
  '{"type": "detection", "status": "in_progress"}',
  jsonb_build_array(jsonb_build_object('component_type_id', %4$L, 'instance_number', 1,
                                       'label', 'Skimmer', 'sort_order', 1))) $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids),
  (select v from st where k = 'skimmer')), 'a leak detection job is made');
select is((select count(*)::int from job_component
           where job_id = (select v::uuid from st where k = 'leak')), 1,
  'with its checklist items');
reset role;

-- An older repair job that already has a checklist item still to do: kept, but it doesn't hold
-- up the report, the review screen doesn't count it, and the report has no checklist.
insert into job_component (company_id, job_id, component_type_id, label)
values ((select ca from ids), (select v::uuid from st where k = 'repair'),
        (select v::uuid from st where k = 'skimmer'), 'Skimmer 1');
insert into checklist_item_result (company_id, job_id, job_component_id, status)
select (select ca from ids), job_id, id, 'pending' from job_component
where job_id = (select v::uuid from st where k = 'repair');

select tests.authenticate_as((select owner_a from ids));
insert into st select 'prep',
  prepare_report((select v::uuid from st where k = 'repair'), 'homeowner')::text;
select is((select jsonb_array_length(v::jsonb -> 'snapshot' -> 'components') from st where k = 'prep'),
  0, 'a repair job''s report snapshot has no checklist');
select is((select v::jsonb -> 'snapshot' -> 'work' from st where k = 'prep'),
  '[{"description": "Pump seal", "quantity": 1}]'::jsonb, 'and still lists its work');
select lives_ok(format($$ select save_report_draft(%L, '{"sections":[]}',
  '[{"key":"summary","title":"Summary","text":"We replaced the pump seal."}]', 'model-x', 'p1', '[]') $$,
  (select v::jsonb ->> 'report_id' from st where k = 'prep')), 'the repair report is written');
select is((report_preview((select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep'))
           ->> 'pending')::int, 0, 'the review screen counts nothing to do');
select lives_ok(format($$ select send_report(%L, 'Customer away') $$,
  (select v::jsonb ->> 'report_id' from st where k = 'prep')),
  'and the report is sent though the old checklist item was never answered');
reset role;
select is((select count(*)::int from job_component
           where job_id = (select v::uuid from st where k = 'repair') and deleted_at is null), 1,
  'the old checklist item is kept');

-- A leak detection job's to-do item still holds up its report.
select tests.authenticate_as((select owner_a from ids));
insert into st select 'prep2',
  prepare_report((select v::uuid from st where k = 'leak'), 'homeowner')::text;
select is((select jsonb_array_length(v::jsonb -> 'snapshot' -> 'components') from st where k = 'prep2'),
  1, 'a leak detection snapshot keeps its checklist');
select lives_ok(format($$ select save_report_draft(%L, '{"sections":[]}',
  '[{"key":"summary","title":"Summary","text":"We found a leak."}]', 'model-x', 'p1', '[]') $$,
  (select v::jsonb ->> 'report_id' from st where k = 'prep2')), 'its report is written');
select throws_ok(format($$ select send_report(%L, 'Customer away') $$,
  (select v::jsonb ->> 'report_id' from st where k = 'prep2')),
  '23514', null, 'and can''t be sent while its checklist has items to do');
reset role;

select * from finish();
rollback;
