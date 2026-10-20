-- Search on the website (docs/plans/search-and-activity.md section 1): search_candidates finds
-- what a person may open, through their own row security, matching word starts, accents
-- folded, phone digits, and number prefixes. packages/core ranks and groups what it returns.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp table ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a, (b ->> 'company')::uuid as cb,
  tests.create_user('search-tech2@test.local') as tech2,
  gen_random_uuid() as sam, gen_random_uuid() as jose, gen_random_uuid() as gone,
  gen_random_uuid() as sam_pool, gen_random_uuid() as sam_job
  from fx;
grant select on ids to authenticated;

insert into membership (company_id, user_id, role) select ca, tech2, 'tech' from ids;
insert into customer (id, company_id, name, phone, email)
  select sam, ca, 'Sam Ochoa', '(602) 555-0142', 'sam@example.com' from ids;
insert into customer (id, company_id, name) select jose, ca, 'José Núñez' from ids;
insert into customer (id, company_id, name, deleted_at) select gone, ca, 'Sam Gone', now() from ids;
insert into customer (company_id, name) select cb, 'Sam Ochoa Other Shop' from ids;
insert into property (id, company_id, customer_id, address_line1, city)
  select sam_pool, ca, sam, '1038 Palm Lane', 'Mesa' from ids;
-- The second tech's job for Sam.
insert into job (id, company_id, property_id, bill_to_customer_id, status, assigned_user_id, number)
  select sam_job, ca, sam_pool, sam, 'scheduled', tech2, 1038 from ids;
insert into quote (company_id, job_id, total_cents, number) select ca, sam_job, 97500, 1012 from ids;
insert into invoice (company_id, job_id, total_cents, number) select ca, sam_job, 37500, 1028 from ids;
update job set number = 10380 where id = (select job_a from ids);

create function pg_temp.found(result jsonb, kind text) returns text[]
language sql as $$
  select coalesce(array_agg(coalesce(x ->> 'name', x ->> 'address_line1', x ->> 'number') order by ord), '{}')
  from jsonb_array_elements(result -> kind) with ordinality as t(x, ord)
$$;

select tests.authenticate_as((select owner_a from ids));
select is(pg_temp.found(search_candidates((select ca from ids), '{och}'), 'customers'), '{"Sam Ochoa"}',
  'a word''s start finds a customer');
select is(pg_temp.found(search_candidates((select ca from ids), '{hoa}'), 'customers'), '{}',
  'the middle of a word does not');
select is(pg_temp.found(search_candidates((select ca from ids), '{ochoa,sam}'), 'customers'), '{"Sam Ochoa"}',
  'words in any order; deleted customers and other shops'' never');
select is(pg_temp.found(search_candidates((select ca from ids), '{jose,nun}'), 'customers'), '{"José Núñez"}',
  'accents don''t matter');
select is(pg_temp.found(search_candidates((select ca from ids), '{5550142}', '5550142'), 'customers'), '{"Sam Ochoa"}',
  'phone digits, however it was written');
select is(pg_temp.found(search_candidates((select ca from ids), '{example}'), 'customers'), '{"Customer a","Sam Ochoa"}',
  'and email');
select is(pg_temp.found(search_candidates((select ca from ids), '{palm}'), 'pools'), '{"1038 Palm Lane"}',
  'a pool by its street');
select is(pg_temp.found(search_candidates((select ca from ids), '{mesa}'), 'pools'), '{"1038 Palm Lane"}',
  'or its city');
select is(pg_temp.found(search_candidates((select ca from ids), '{1038}'), 'jobs'), '{1038,10380}',
  'a job number: the exact one first, then those it starts');
select is(pg_temp.found(search_candidates((select ca from ids), '{103}'), 'quotes'), '{}',
  'numbers are prefixes, not anywhere in them');
select is(pg_temp.found(search_candidates((select ca from ids), '{101}'), 'quotes'), '{1012}',
  'a quote number');
select is(pg_temp.found(search_candidates((select ca from ids), '{1028}'), 'invoices'), '{1028}',
  'an invoice number');
select is(pg_temp.found(search_candidates((select ca from ids), '{ochoa}'), 'jobs'), '{1038}',
  'a job by its customer');
select is(pg_temp.found(search_candidates((select ca from ids), '{ochoa}'), 'invoices'), '{1028}',
  'an invoice by its customer');
select is((search_candidates((select ca from ids), '{ochoa}') -> 'jobs' -> 0 ->> 'customer_name'),
  'Sam Ochoa', 'with the customer''s name');
select is(search_candidates((select ca from ids), '{"o''; drop"}') -> 'customers', '[]'::jsonb,
  'anything but letters and digits is ignored');
reset role;

-- Only Their Own: the first tech finds every customer and pool, but not the second tech's job,
-- quote, or invoice.
select tests.authenticate_as((select tech_a from ids));
select is(pg_temp.found(search_candidates((select ca from ids), '{ochoa}'), 'customers'), '{"Sam Ochoa"}',
  'a limited tech finds customers, as the rest of the app shows them');
select is(pg_temp.found(search_candidates((select ca from ids), '{palm}'), 'pools'), '{"1038 Palm Lane"}',
  'and pools');
select is(pg_temp.found(search_candidates((select ca from ids), '{1038}'), 'jobs'), '{10380}',
  'but only their own jobs');
select is(pg_temp.found(search_candidates((select ca from ids), '{ochoa}'), 'quotes'), '{}',
  'and those jobs'' quotes');
select is(pg_temp.found(search_candidates((select ca from ids), '{1028}'), 'invoices'), '{}',
  'and invoices');
select throws_ok(format($$ select search_candidates(%L, '{sam}') $$, (select cb from ids)), '42501', null,
  'another shop is refused');
reset role;

select tests.authenticate_as((select tech2 from ids));
select is(pg_temp.found(search_candidates((select ca from ids), '{1038}'), 'jobs'), '{1038}',
  'the second tech finds their job');
select is(pg_temp.found(search_candidates((select ca from ids), '{ochoa}'), 'quotes'), '{1012}',
  'and its quote');
reset role;

select is(has_function_privilege('anon', 'public.search_candidates(uuid, text[], text)', 'execute'), false,
  'signed-out visitors can''t search');

select * from finish();
rollback;
