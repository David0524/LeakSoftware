-- Storage buckets are isolated by the company id at the start of every object path.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company') as ca, (b ->> 'company') as cb, (a ->> 'job') as ja, (b ->> 'job') as jb,
  (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a from fx;
grant select on ids to authenticated;

-- Tech of company A
select tests.authenticate_as((select tech_a from ids));

select is((select count(*) from storage.objects where bucket_id = 'media' and name like (select ca from ids) || '/%'),
  1::bigint, 'media: tech reads own company files');
select is((select count(*) from storage.objects where name like (select cb from ids) || '/%'),
  0::bigint, 'storage: tech cannot see other company files in any bucket');
select lives_ok(
  format('insert into storage.objects (bucket_id, name) values (''media'', %L)',
    (select ca || '/' || ja || '/new.jpg' from ids)),
  'media: tech uploads to own company folder');
select throws_ok(
  format('insert into storage.objects (bucket_id, name) values (''media'', %L)',
    (select cb || '/' || jb || '/evil.jpg' from ids)),
  '42501', null, 'media: tech cannot upload into other company folder');
select throws_ok(
  'insert into storage.objects (bucket_id, name) values (''media'', ''not-a-company/x.jpg'')',
  '42501', null, 'media: path must start with a company id');
select is(
  tests.rows_affected(format(
    'update storage.objects set name = name || ''.x'' where bucket_id = ''media'' and name like %L',
    (select ca || '/%' from ids))),
  0::bigint, 'media: originals cannot be changed');
select throws_ok(
  format('insert into storage.objects (bucket_id, name) values (''company-assets'', %L)',
    (select ca || '/logo2.png' from ids)),
  '42501', null, 'company-assets: tech cannot upload the logo');
select is((select count(*) from storage.objects where bucket_id = 'company-assets'),
  1::bigint, 'company-assets: tech reads own company logo');
select throws_ok(
  format('insert into storage.objects (bucket_id, name) values (''documents'', %L)',
    (select ca || '/' || ja || '/fake.pdf' from ids)),
  '42501', null, 'documents: only the server writes report PDFs');
select is((select count(*) from storage.objects where bucket_id = 'documents'),
  1::bigint, 'documents: tech reads own company PDFs');
reset role;

-- Owner of company A
select tests.authenticate_as((select owner_a from ids));
select lives_ok(
  format('insert into storage.objects (bucket_id, name) values (''company-assets'', %L)',
    (select ca || '/logo2.png' from ids)),
  'company-assets: owner uploads the logo');
select throws_ok(
  format('insert into storage.objects (bucket_id, name) values (''company-assets'', %L)',
    (select cb || '/logo2.png' from ids)),
  '42501', null, 'company-assets: owner cannot upload to other company');
reset role;

select * from finish();
rollback;
