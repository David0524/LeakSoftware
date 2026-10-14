-- Who sees which jobs, part 2: with techs_see_all_jobs off, a tech who may not see a job
-- can't prepare, send, or change its reports, quotes, or invoices through the server
-- functions, nor read its photos and PDFs. Its own tech still can.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
create temp table other as select tests.create_user('a-tech2@test.local') as tech2;
insert into membership (company_id, user_id, role)
  select (a ->> 'company')::uuid, (select tech2 from other), 'tech' from fx;
grant select on fx, other to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a,
  (a ->> 'report')::uuid as rep_a, (a ->> 'quote')::uuid as quote_a,
  (a ->> 'invoice')::uuid as inv_a, (select tech2 from other) as tech2
  from fx;
grant select on ids to authenticated;

update company set settings = settings || '{"techs_see_all_jobs": false}'
where id = (select ca from ids);

-- The originals are no longer reachable from the API.
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname like '%\_unchecked'),
  'unchecked functions are not in the public schema');
select ok(not has_function_privilege('authenticated', 'app.send_quote_unchecked(uuid)', 'execute'),
  'and members cannot call them directly');

-- Another tech: refused everywhere.
select tests.authenticate_as((select tech2 from ids));
select throws_ok(format($$ select prepare_report(%L, 'homeowner') $$, (select job_a from ids)),
  '42501', 'Job not found', 'a hidden job''s report cannot be prepared');
select throws_ok(format($$ select report_preview(%L) $$, (select rep_a from ids)),
  '42501', 'Job not found', 'nor previewed');
select throws_ok(format($$ select send_report(%L) $$, (select rep_a from ids)),
  '42501', 'Job not found', 'nor sent');
select throws_ok(format($$ select log_message(%L, 'email', 'x@example.com', 'report', 'sent') $$, (select job_a from ids)),
  '42501', 'Job not found', 'no messages logged on it');
select throws_ok(format($$ select send_quote(%L) $$, (select quote_a from ids)),
  '42501', 'Job not found', 'its quote cannot be sent');
select throws_ok(format($$ select create_invoice(%L) $$, (select job_a from ids)),
  '42501', 'Job not found', 'no invoice can be made for it');
select throws_ok(format($$ select send_invoice(%L) $$, (select inv_a from ids)),
  '42501', 'Job not found', 'its invoice cannot be sent');
select throws_ok(format($$ select void_invoice(%L) $$, (select inv_a from ids)),
  '42501', 'Job not found', 'nor voided');
select throws_ok(format($$ select record_invoice_payment(%L, 100) $$, (select inv_a from ids)),
  '42501', 'Job not found', 'nor paid by hand');
select is((select count(*) from storage.objects
           where bucket_id in ('media', 'documents')
             and name like (select ca from ids) || '/' || (select job_a from ids) || '/%'),
  0::bigint, 'its photos and PDFs are hidden');
select is((select count(*) from storage.objects where bucket_id = 'company-assets'), 1::bigint,
  'the shop''s logo is still readable');
reset role;

-- The job's own tech: allowed.
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ select prepare_report(%L, 'homeowner') $$, (select job_a from ids)),
  'the job''s tech can still prepare its report');
select lives_ok(format($$ select report_preview(%L) $$, (select rep_a from ids)),
  'and preview it');
select is((select count(*) from storage.objects
           where bucket_id in ('media', 'documents')
             and name like (select ca from ids) || '/' || (select job_a from ids) || '/%'),
  2::bigint, 'and reads its photos and PDFs');
reset role;

-- When the shop lets techs see everything again, so can the other tech.
update company set settings = settings || '{"techs_see_all_jobs": true}'
where id = (select ca from ids);
select tests.authenticate_as((select tech2 from ids));
select lives_ok(format($$ select report_preview(%L) $$, (select rep_a from ids)),
  'with every job visible, any tech can preview it');
reset role;

select * from finish();
rollback;
