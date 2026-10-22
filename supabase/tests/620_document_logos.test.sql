-- The shop's logo on the customer's quote and invoice (2026-10-22): signed out, a live quote or
-- invoice link opens the shop's current logo, and nothing else of the shop's assets.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'quote')::uuid as quote_a,
  (a ->> 'invoice')::uuid as invoice_a, (b ->> 'company')::uuid as cb
  from fx;
grant select on ids to authenticated, anon;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon;

update company set logo_path = id || '/logo.png' where id in ((select ca from ids), (select cb from ids));
insert into storage.objects (bucket_id, name) values ('company-assets', (select ca from ids) || '/old-logo.png');
-- make_company's own report link is to a draft, so it opens nothing.

set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'company-assets'), 0::bigint,
  'with no live link, signed out reads no logo');
reset role;

select tests.authenticate_as((select owner_a from ids));
insert into st select 'q', send_quote((select quote_a from ids)) ->> 'token';
reset role;

set local role anon;
select is((select array_agg(name) from storage.objects where bucket_id = 'company-assets'),
  array[(select ca from ids) || '/logo.png'],
  'a live quote link opens the shop''s current logo, not its old one or another shop''s');
reset role;

update share_link set revoked_at = now() where token = (select v from st where k = 'q');
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'company-assets'), 0::bigint,
  'a revoked quote link opens nothing');
reset role;

select tests.authenticate_as((select owner_a from ids));
insert into st select 'i', send_invoice((select invoice_a from ids)) ->> 'token';
reset role;

set local role anon;
select is((select array_agg(name) from storage.objects where bucket_id = 'company-assets'),
  array[(select ca from ids) || '/logo.png'], 'a live invoice link opens the shop''s logo');
select throws_ok($$ select * from company $$, '42501', null, 'signed out, the company row stays closed');
reset role;

select * from finish();
rollback;
