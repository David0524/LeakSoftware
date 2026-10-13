-- Signatures are replaced by newer ones of the same kind and can be removed (owner,
-- 2026-10-13): a re-signed version shows only the new signature.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a,
  (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on ids to authenticated;
create temp table st (k text primary key, v uuid);
grant all on st to authenticated;

-- Version 1, signed by "Customer a" (the fixture's signature).
select tests.authenticate_as((select tech_a from ids));
insert into st select 'v1', (prepare_report((select job_a from ids), 'homeowner') ->> 'report_id')::uuid;
select save_report_draft((select v from st where k = 'v1'), '{}',
  '[{"key":"summary","title":"Summary","text":"One."}]', 'm', 'p', '[]');
select send_report((select v from st where k = 'v1'));

-- Version 2, signed again: only the new signature shows.
insert into signature (company_id, job_id, purpose, signer_name, signed_at)
values ((select ca from ids), (select job_a from ids), 'inspection_ack', 'Signed Again', now() + interval '1 minute');
insert into st select 'v2', (prepare_report((select job_a from ids), 'homeowner') ->> 'report_id')::uuid;
select save_report_draft((select v from st where k = 'v2'), '{}',
  '[{"key":"summary","title":"Summary","text":"Two."}]', 'm', 'p', '[]');
select send_report((select v from st where k = 'v2'));
select is((select jsonb_agg(x ->> 'signer_name') from report, jsonb_array_elements(data_snapshot -> 'signatures') x
           where id = (select v from st where k = 'v2')),
  '["Signed Again"]'::jsonb, 'a new signature of the same kind replaces the old one');
select is((select jsonb_agg(x ->> 'signer_name') from report, jsonb_array_elements(data_snapshot -> 'signatures') x
           where id = (select v from st where k = 'v1')),
  '["Customer a"]'::jsonb, 'the earlier version keeps its own');

-- Removing a signature: soft delete by a member; it leaves later versions.
select lives_ok($$ update signature set deleted_at = now() where signer_name = 'Signed Again' $$,
  'members remove a signature');
select is((select deleted_at is not null from signature where signer_name = 'Signed Again'), true,
  'it is marked removed');
select throws_ok($$ update signature set signer_name = 'Someone Else' where signer_name = 'Customer a' $$,
  '42501', null, 'a signature''s name still cannot be changed');
insert into st select 'v3', (prepare_report((select job_a from ids), 'homeowner') ->> 'report_id')::uuid;
select is((select report_preview(v) -> 'snapshot' -> 'signatures' -> 0 ->> 'signer_name' from st where k = 'v3'),
  'Customer a', 'with the newer one removed, the earlier signature shows again');
select is((select jsonb_agg(x ->> 'signer_name') from report, jsonb_array_elements(data_snapshot -> 'signatures') x
           where id = (select v from st where k = 'v2')),
  '["Signed Again"]'::jsonb, 'a finished version keeps the removed signature');
reset role;

select tests.authenticate_as((select tech_b from ids));
update signature set deleted_at = now() where signer_name = 'Customer a';
reset role;
select is((select deleted_at from signature where signer_name = 'Customer a'), null,
  'another company cannot remove it');

select * from finish();
rollback;
