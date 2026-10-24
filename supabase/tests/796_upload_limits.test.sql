-- Upload size and type limits per bucket, and no new files from a locked shop (security review
-- M2, 2026-10-24). The storage server enforces the limits; this checks the buckets carry them
-- and that the row rules refuse a locked shop.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, service_role;
create temp view ids as select
  (a ->> 'company') as ca, (a ->> 'job') as ja, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'tech')::uuid as tech_a from fx;
grant select on ids to authenticated, service_role;

select is((select array_agg(id || '=' || (file_size_limit / 1024 / 1024) || 'MB' order by id)
  from storage.buckets where id in ('media', 'texts', 'company-assets', 'documents')),
  '{company-assets=2MB,documents=50MB,media=50MB,texts=10MB}',
  'every bucket has a size limit by what it holds');
select is((select count(*)::int from storage.buckets where file_size_limit is null
  or allowed_mime_types is null), 0, 'no bucket takes any size or any type');
select ok((select allowed_mime_types @> array['image/jpeg', 'image/svg+xml', 'video/mp4',
  'video/quicktime', 'audio/mp4'] and not allowed_mime_types && array['application/pdf', 'text/html']
  from storage.buckets where id = 'media'),
  'media: photos, signatures, videos and voice notes; not PDFs or web pages');
select is((select allowed_mime_types from storage.buckets where id = 'company-assets'),
  array['image/png', 'image/jpeg', 'image/svg+xml'], 'logos: PNG, JPEG or SVG, as the apps check');
select is((select allowed_mime_types from storage.buckets where id = 'documents'),
  array['application/pdf'], 'documents: PDFs only');
select ok((select allowed_mime_types @> array['image/*', 'application/pdf']
  from storage.buckets where id = 'texts'), 'texts: any picture customers send, and PDFs');

-- A paying shop uploads as before.
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format('insert into storage.objects (bucket_id, name) values (''media'', %L)',
  (select ca || '/' || ja || '/paid.jpg' from ids)), 'an open shop uploads photos');
reset role;

-- Locked (canceled): nothing new goes up, by any member, in any bucket.
insert into subscription (company_id, status) values ((select ca::uuid from ids), 'canceled')
on conflict (company_id) do update set status = 'canceled';
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format('insert into storage.objects (bucket_id, name) values (''media'', %L)',
  (select ca || '/' || ja || '/locked.jpg' from ids)), '42501', null,
  'a locked shop''s tech can''t upload photos');
select throws_ok(format('insert into storage.objects (bucket_id, name) values (''texts'', %L)',
  (select ca || '/out/locked.jpg' from ids)), '42501', null,
  'nor pictures for texts');
reset role;
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format('insert into storage.objects (bucket_id, name) values (''company-assets'', %L)',
  (select ca || '/logo-locked.png' from ids)), '42501', null,
  'a locked shop''s owner can''t upload a logo');
select is(tests.rows_affected(format(
  'update storage.objects set name = name where bucket_id = ''company-assets'' and name like %L',
  (select ca || '/%' from ids))), 0::bigint, 'nor change one');
select is((select count(*)::int from storage.objects where name like (select ca || '/%' from ids)) > 0,
  true, 'what''s there can still be read');
reset role;

-- Paid again: uploads work, so what the phones kept goes up.
update subscription set status = 'active', stripe_subscription_id = 'sub_paid'
where company_id = (select ca::uuid from ids);
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format('insert into storage.objects (bucket_id, name) values (''media'', %L)',
  (select ca || '/' || ja || '/locked.jpg' from ids)), 'once paid, the kept photo uploads');
reset role;

-- The server's own uploads aren't held (inbound texts' pictures, PDFs).
update subscription set status = 'canceled' where company_id = (select ca::uuid from ids);
set local role service_role;
select lives_ok(format('insert into storage.objects (bucket_id, name) values (''texts'', %L)',
  (select ca || '/conv/in.jpg' from ids)), 'the server still stores a customer''s picture');
reset role;

select * from finish();
rollback;
