-- Reports (M7): draft, send, customer link, and files shown on a customer link.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a,
  (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on ids to authenticated, anon;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon;

-- The make_company job has a pending-free checklist (Return 1 inspected), one finding, one test.
select tests.authenticate_as((select tech_a from ids));

select throws_ok($$ select prepare_report((select job_a from ids), 'insurance') $$,
  '22023', null, 'there is no insurance report');

insert into st select 'prep', prepare_report((select job_a from ids), 'homeowner')::text;
select ok((select (v::jsonb ->> 'report_id') is not null from st where k = 'prep'),
  'prepare_report returns the open draft');
select is((select jsonb_array_length(v::jsonb -> 'snapshot' -> 'components') from st where k = 'prep'),
  1, 'the snapshot lists the job''s components');
select is((select v::jsonb -> 'snapshot' -> 'findings' -> 0 ->> 'title' from st where k = 'prep'),
  'Return 1 line break', 'the snapshot includes findings with their severity');
select is((select (v::jsonb -> 'snapshot' -> 'findings' -> 0 ->> 'must_mention')::boolean from st where k = 'prep'),
  true, 'major findings are marked must-mention');
select is(prepare_report((select job_a from ids), 'homeowner') ->> 'report_id',
  (select v::jsonb ->> 'report_id' from st where k = 'prep'), 'preparing again reuses the draft');

-- Another company cannot touch it.
reset role;
select tests.authenticate_as((select tech_b from ids));
select throws_ok($$ select prepare_report((select job_a from ids), 'homeowner') $$,
  '42501', null, 'another company cannot prepare a report on this job');
select throws_ok(format($$ select send_report(%L) $$, (select v::jsonb ->> 'report_id' from st where k = 'prep')),
  '42501', null, 'another company cannot send it');
reset role;
select tests.authenticate_as((select tech_a from ids));

-- Nothing to send until there is text.
select throws_ok(format($$ select send_report(%L) $$, (select v::jsonb ->> 'report_id' from st where k = 'prep')),
  '23514', null, 'a report without text cannot be sent');
select lives_ok(format($$ select save_report_draft(%L, '{"sections":[]}', '[{"key":"summary","title":"Summary","text":"We found a leak."}]', 'model-x', 'p1', '[]') $$,
  (select v::jsonb ->> 'report_id' from st where k = 'prep')), 'save_report_draft records the draft and text');
select is((select model from report where id = (select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep')),
  'model-x', 'the model is recorded');

-- A to-do checklist item blocks sending.
reset role;
insert into job_component (company_id, job_id, component_type_id, label)
select (select ca from ids), (select job_a from ids),
       (select id from component_type where company_id = (select ca from ids) and key = 'skimmer'), 'Skimmer 1';
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select send_report(%L) $$, (select v::jsonb ->> 'report_id' from st where k = 'prep')),
  '23514', null, 'a report cannot be sent while checklist items are to do');
reset role;
insert into checklist_item_result (company_id, job_id, job_component_id, status, exclusion_reason)
select (select ca from ids), (select job_a from ids), id, 'excluded', 'Covered by deck'
from job_component where job_id = (select job_a from ids) and label = 'Skimmer 1';
select tests.authenticate_as((select tech_a from ids));

insert into st select 'sent1', send_report((select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep'))::text;
select ok((select length(v::jsonb ->> 'token') = 32 from st where k = 'sent1'), 'sending returns a customer link token');
select is((select status from report where id = (select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep')),
  'sent', 'the report is sent');
select is((select jsonb_array_length(data_snapshot -> 'components') from report
           where id = (select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep')),
  2, 'the snapshot is refreshed when sent');
select is((select status from job where id = (select job_a from ids)), 'report_sent',
  'the job moves to report sent');
select throws_ok(format($$ select send_report(%L) $$, (select v::jsonb ->> 'report_id' from st where k = 'prep')),
  '23514', null, 'a sent report cannot be sent again');
select throws_ok(format($$ select save_report_draft(%L, '{}', '[]', 'm', 'p', '[]') $$,
  (select v::jsonb ->> 'report_id' from st where k = 'prep')), '23514', null, 'a sent report''s draft cannot change');

-- A second version supersedes the first.
insert into st select 'prep2', prepare_report((select job_a from ids), 'homeowner')::text;
select is((select (v::jsonb ->> 'version')::int from st where k = 'prep2'), 2, 'the next draft is version 2');
select save_report_draft((select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep2'),
  '{}', '[{"key":"summary","title":"Summary","text":"Updated."}]', 'm', 'p', '[]');
insert into st select 'sent2', send_report((select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep2'))::text;
select is((select status from report where id = (select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep')),
  'superseded', 'the first version is superseded');

select ok(log_message((select job_a from ids), 'email', 'c@example.com', 'report', 'sent', 'msg_1') is not null,
  'members log deliveries with the provider id');

-- The customer link, signed out.
reset role;
insert into storage.objects (bucket_id, name)
select 'media', storage_path from media where job_id = (select job_a from ids) and storage_path is not null;
update media set storage_path = (select ca from ids) || '/' || (select job_a from ids) || '/shown.jpg',
  upload_state = 'uploaded' where job_id = (select job_a from ids);
insert into storage.objects (bucket_id, name) values
  ('media', (select ca from ids) || '/' || (select job_a from ids) || '/shown.jpg'),
  ('media', (select ca from ids) || '/' || (select job_a from ids) || '/not-shown.jpg');
-- Freeze a fresh version that includes the uploaded photo.
select tests.authenticate_as((select tech_a from ids));
insert into st select 'prep3', prepare_report((select job_a from ids), 'homeowner')::text;
select save_report_draft((select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep3'),
  '{}', '[{"key":"summary","title":"Summary","text":"Third."}]', 'm', 'p', '[]');
insert into st select 'sent3', send_report((select (v::jsonb ->> 'report_id')::uuid from st where k = 'prep3'))::text;
reset role;

set local role anon;
select is((select report_for_token((select v::jsonb ->> 'token' from st where k = 'sent3')) -> 'final_sections' -> 0 ->> 'text'),
  'Third.', 'the customer link shows the sent text');
select is((select report_for_token((select v::jsonb ->> 'token' from st where k = 'sent1')) ->> 'newer_token'),
  (select v::jsonb ->> 'token' from st where k = 'sent3'), 'an old link points to the newest version');
select is(report_for_token('nope'), null, 'an unknown link shows nothing');
select is((select count(*) from storage.objects where bucket_id = 'media'
           and name = (select ca from ids) || '/' || (select job_a from ids) || '/shown.jpg'),
  1::bigint, 'a photo on a shared report is readable through the link');
select is((select count(*) from storage.objects where bucket_id = 'media'
           and name = (select ca from ids) || '/' || (select job_a from ids) || '/not-shown.jpg'),
  0::bigint, 'other files are not');
select throws_ok($$ select * from report $$, '42501', null, 'signed out, reports themselves stay closed');
reset role;

update share_link set revoked_at = now() where token = (select v::jsonb ->> 'token' from st where k = 'sent3');
set local role anon;
select is(report_for_token((select v::jsonb ->> 'token' from st where k = 'sent3')), null,
  'a revoked link shows nothing');
reset role;

select * from finish();
rollback;
