-- Review, then sign (owner request, 2026-10-13): finishing a report gives it the signatures
-- taken since the last version, or the reason nobody signed; the review screen previews it.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a, (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on ids to authenticated;
create temp table st (k text primary key, v uuid);
grant all on st to authenticated;

select tests.authenticate_as((select tech_a from ids));
insert into st select 'v1', (prepare_report((select job_a from ids), 'homeowner') ->> 'report_id')::uuid;
select save_report_draft((select v from st where k = 'v1'), '{}',
  '[{"key":"summary","title":"Summary","text":"We found a leak."}]', 'm', 'p', '[]');

select is((select (report_preview(v) ->> 'pending')::int from st where k = 'v1'), 0,
  'the preview says nothing is left to do');
select is((select report_preview(v) -> 'snapshot' -> 'signatures' -> 0 ->> 'signer_name' from st where k = 'v1'),
  'Customer a', 'the preview shows the signature taken on this visit');
select is((select report_preview(v) -> 'final_sections' -> 0 ->> 'text' from st where k = 'v1'),
  'We found a leak.', 'and the draft text');

-- Finished after the customer signed: the signature belongs to version 1, no reason shown.
select lives_ok($$ select send_report((select v from st where k = 'v1'), 'Customer not present') $$,
  'finishing with a reason');
select is((select r.version from signature s join report r on r.id = s.report_id
           where s.job_id = (select job_a from ids)), (select version from report where id = (select v from st where k = 'v1')),
  'the signature belongs to the finished version');
select is((select data_snapshot -> 'sign_off' from report where id = (select v from st where k = 'v1')),
  null, 'a signed version shows no reason');
select is((select (data_snapshot -> 'signatures' -> 0 ->> 'report_version')::int from report
           where id = (select v from st where k = 'v1')),
  (select version from report where id = (select v from st where k = 'v1')), 'the snapshot says which version was signed');

-- Version 2, nobody here to sign: the reason is on it, and the earlier signature still shows.
insert into st select 'v2', (prepare_report((select job_a from ids), 'homeowner') ->> 'report_id')::uuid;
select save_report_draft((select v from st where k = 'v2'), '{}',
  '[{"key":"summary","title":"Summary","text":"Updated."}]', 'm', 'p', '[]');
select send_report((select v from st where k = 'v2'), '  Customer not present ');
select is((select data_snapshot -> 'sign_off' ->> 'unsigned_reason' from report where id = (select v from st where k = 'v2')),
  'Customer not present', 'an unsigned version says why');
select is((select (data_snapshot -> 'signatures' -> 0 ->> 'report_version')::int from report
           where id = (select v from st where k = 'v2')),
  (select version from report where id = (select v from st where k = 'v1')), 'and shows the earlier version''s signature as such');
select is((select report_preview(v) -> 'snapshot' from st where k = 'v2'),
  (select data_snapshot from report where id = (select v from st where k = 'v2')),
  'a finished report previews as it was sent');
reset role;

select tests.authenticate_as((select tech_b from ids));
select is((select report_preview(v) from st where k = 'v1'), null,
  'another company cannot preview it');
reset role;

select * from finish();
rollback;
