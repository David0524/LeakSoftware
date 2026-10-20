-- Pool Inspection (owner, 2026-10-20; docs/plans/pool-inspection.md): a job type for leak shops
-- whose checklist is the Leaktronics form, word for word, as config. Answers are options, lists
-- or text; an option's flag sets the outcome; the report snapshot carries the answers; the job's
-- price is billed as "Pool inspection".
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated;
create temp table st (k text, v uuid);
grant select, insert on st to authenticated;

-- The questions, as config.
select is((select count(*)::int from component_type
  where company_id = (select ca from ids) and job_type = 'inspection'), 133,
  'leak shops get the inspection''s 133 questions');
select results_eq($$ select section, count(*)::int from component_type
  where company_id = (select ca from ids) and job_type = 'inspection'
  group by section order by min(sort_order) $$,
  $$ values ('insp_equipment'::text, 49), ('insp_self_cleaning', 1), ('insp_heaters', 16),
            ('insp_electrical', 17), ('insp_fencing', 10), ('insp_covers', 1),
            ('insp_visual', 10), ('insp_plumbing', 29) $$,
  'in the form''s eight tabs');
select results_eq($$ select group_label, answer, options from component_type
  where company_id = (select ca from ids) and name = 'Does the system show visible leaking?' $$,
  $$ values ('Filtration System'::text, 'choice'::text,
             '[{"label": "Yes", "flag": "attention"}, {"label": "No", "flag": "ok"}]'::jsonb) $$,
  'each with its group and which answer needs attention');
select is((select notice from component_type
  where company_id = (select ca from ids) and name = 'The heater is for'),
  'FOR ANY UNKNOWN GAS ISSUES - ALWAYS REFER TO A LICENSED GAS COMPANY',
  'banners word for word');
select ok((select options -> 1 -> 'fold' = 'true'::jsonb from component_type
  where company_id = (select ca from ids) and name = 'Is a perimeter fence present?'),
  'No on a gate folds its group');
select is((select count(*)::int from component_type
  where company_id = (select ca from ids) and job_type = 'inspection'
    and name in ('Leaks noted', 'Summary notes', 'Is the inspection for an insurance claim?')), 0,
  'leaks noted and summary notes are the report''s text; no insurance question');
select is((select price_cents from price_book_item
  where company_id = (select ca from ids) and name = 'Pool inspection'), 49500,
  'a Pool inspection price book item');
select is((select count(*)::int from jsonb_array_elements(
             (select settings -> 'intake_questions' from company where id = (select ca from ids))) q
           where q -> 'job_types' = '["inspection"]'), 4,
  'From the Customer asks the Phone Questionnaire on inspections');
select ok((select insert_columns @> '{group_label,options,notice}' from app.sync_table
           where table_name = 'component_type')
          and (select update_columns @> '{value}' from app.sync_table
               where table_name = 'checklist_item_result'),
  'the new columns sync');

-- An inspection job, answered by the tech.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ insert into st select 'job', create_job(%1$L, null, %2$L, null, %3$L,
  '{"type": "inspection", "status": "in_progress", "fee_cents": 49500,
    "intake": {"features": ["Swimming Pool", "Spa"]}}',
  (select jsonb_agg(jsonb_build_object('component_type_id', id, 'instance_number', 1,
                                       'label', name, 'sort_order', sort_order * 100 + 1))
   from component_type where company_id = %1$L and job_type = 'inspection')) $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)),
  'New Job makes a pool inspection with its checklist');
select is((select type from job where id = (select v from st where k = 'job')), 'inspection',
  'of type inspection');
select is((select count(*)::int from checklist_item_result
  where job_id = (select v from st where k = 'job')), 133, 'every question to answer');
reset role;

select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected(format($$ update checklist_item_result
  set status = 'inspected', outcome = 'attention', value = '"Yes"', notes = 'Drip at the union'
  where job_component_id = (select jc.id from job_component jc
    join component_type t on t.id = jc.component_type_id
    where jc.job_id = %L and t.name = 'Does the system show visible leaking?') $$,
  (select v from st where k = 'job'))), 1::bigint, 'a tech answers a question');
select is(tests.rows_affected(format($$ update checklist_item_result
  set status = 'inspected', outcome = 'ok', value = '["Pool main drain", "Pool skimmer"]'
  where job_component_id = (select jc.id from job_component jc
    join component_type t on t.id = jc.component_type_id
    where jc.job_id = %L and t.name = 'Ran suction lines to check for air on') $$,
  (select v from st where k = 'job'))), 1::bigint, 'and picks several on a list');
reset role;

select results_eq($$ select c ->> 'group_label', c -> 'value', c ->> 'outcome', c ->> 'notes'
  from jsonb_array_elements(app.report_snapshot((select v from st where k = 'job')) -> 'components') c
  where c ->> 'type_name' = 'Does the system show visible leaking?' $$,
  $$ values ('Filtration System'::text, '"Yes"'::jsonb, 'attention'::text, 'Drip at the union'::text) $$,
  'the report''s snapshot has the answer, its group and notes');
select is((app.report_snapshot((select v from st where k = 'job')) -> 'job' ->> 'type'), 'inspection',
  'and knows it''s an inspection');

select tests.authenticate_as((select owner_a from ids));
insert into st select 'inv', create_invoice((select v from st where k = 'job'));
select results_eq($$ select description, unit_price_cents::int from invoice_line_item
  where invoice_id = (select v from st where k = 'inv') and deleted_at is null $$,
  $$ values ('Pool inspection'::text, 49500) $$, 'its price is billed as a pool inspection');
reset role;

-- The report can go before every question is answered: it lists the answered ones. A leak
-- detection job still waits for its whole checklist.
insert into report (company_id, job_id, template_key, final_sections)
values ((select ca from ids), (select v from st where k = 'job'), 'homeowner',
        '[{"key": "summary", "title": "Summary", "text": "We inspected the pool."}]');
select tests.authenticate_as((select owner_a from ids));
select is((report_preview((select id from report where job_id = (select v from st where k = 'job')))
           ->> 'pending')::int, 0, 'nothing holds up signing an inspection');
select lives_ok(format($$ select send_report(%L, 'Buyer not present') $$,
  (select id from report where job_id = (select v from st where k = 'job'))),
  'and it is sent with questions left open');
reset role;

select throws_ok($$ insert into component_type (company_id, key, name, job_type, answer, section,
  methods) values ((select ca from ids), 'bad_one', 'Bad', 'inspection', 'essay', 'insp_covers', '{}') $$,
  '23514', null, 'unknown answer kinds are refused');

select * from finish();
rollback;
