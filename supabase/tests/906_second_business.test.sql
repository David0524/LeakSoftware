-- A second business name and the tech on reports (2026-11-26). A shop doing both lines of work
-- may name a second business; each job's customer documents use the job's business. Reports
-- may end with the tech's photo; members set their own photo, owners and admins anyone's.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'admin')::uuid as admin_a, (a ->> 'job')::uuid as job_a, (a ->> 'quote')::uuid as quote_a,
  (a ->> 'invoice')::uuid as invoice_a, (a ->> 'report')::uuid as report_a,
  (a ->> 'property')::uuid as prop_a, (a ->> 'customer')::uuid as cust_a,
  (b ->> 'company')::uuid as cb, (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on fx, ids to authenticated, anon, service_role;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon, service_role;

-- make_company's job is leak detection.
select is(app.job_business((select job_a from ids)), 'main', 'without a second business, the main one');

-- The owner names the second business from a device (the column grants).
select tests.authenticate_as((select owner_a from ids));
update company set name = 'All In Pool Solutions', logo_path = id || '/logo-1.png',
  second_name = 'Southern Nevada Leak Detection', second_phone = '702-555-0100',
  second_logo_path = id || '/logo2-1.png', second_brand_primary = '#0A5C8A'
where id = (select ca from ids);
reset role;
select is((select second_for from company where id = (select ca from ids)), 'leak',
  'the second business is for leak detection unless set');

select tests.authenticate_as((select tech_a from ids));
update company set second_name = 'Nope' where id = (select ca from ids);
reset role;
select is((select second_name from company where id = (select ca from ids)),
  'Southern Nevada Leak Detection', 'a tech cannot change the second business');

select is(app.job_business((select job_a from ids)), 'second', 'a leak detection job uses it');

-- Other jobs: a pool visit, a repair from the leak job, a repair on its own.
insert into job (company_id, property_id, bill_to_customer_id, status, type)
select ca, prop_a, cust_a, 'unscheduled', 'maintenance' from ids;
insert into st select 'visit', id from job where company_id = (select ca from ids) and type = 'maintenance' limit 1;
insert into job (company_id, property_id, bill_to_customer_id, status, type, parent_job_id)
select ca, prop_a, cust_a, 'unscheduled', 'repair', job_a from ids;
insert into st select 'repair_from', id from job where parent_job_id = (select job_a from ids) and type = 'repair' limit 1;
insert into job (company_id, property_id, bill_to_customer_id, status, type)
select ca, prop_a, cust_a, 'unscheduled', 'repair' from ids;
insert into st select 'repair_alone', id from job
  where company_id = (select ca from ids) and type = 'repair' and parent_job_id is null limit 1;

select is(app.job_business((select v::uuid from st where k = 'visit')), 'main', 'a pool visit uses the main one');
select is(app.job_business((select v::uuid from st where k = 'repair_from')), 'second',
  'a repair follows the job it came from');
select is(app.job_business((select v::uuid from st where k = 'repair_alone')), 'main',
  'a repair on its own uses the main one');

-- Someone changes a job's business from a device (the job's own choice wins).
select tests.authenticate_as((select owner_a from ids));
update job set business = 'main' where id = (select v::uuid from st where k = 'repair_from');
reset role;
select is(app.job_business((select v::uuid from st where k = 'repair_from')), 'main',
  'the job''s own choice wins');
select throws_ok($$ update job set business = 'third' where id = (select job_a from ids) $$,
  '23514', null, 'only main or second');

-- Pool care as the second business's work.
update company set second_for = 'pool' where id = (select ca from ids);
select is(app.job_business((select job_a from ids)), 'main', 'for pool care: leak jobs use the main one');
select is(app.job_business((select v::uuid from st where k = 'visit')), 'second', 'and pool visits the second');
update company set second_for = 'leak' where id = (select ca from ids);

-- Only with both lines of work.
update company set settings = settings || '{"services": "pool"}' where id = (select ca from ids);
select is(app.job_business((select job_a from ids)), 'main', 'not Both: the second business is ignored');
update company set settings = settings || '{"services": "both"}' where id = (select ca from ids);

-- The report snapshot.
select is(app.report_snapshot((select job_a from ids)) -> 'company' ->> 'name',
  'Southern Nevada Leak Detection', 'the report names the job''s business');
select is(app.report_snapshot((select job_a from ids)) -> 'company' ->> 'logo_path',
  (select ca from ids) || '/logo2-1.png', 'with its logo');
select is(app.report_snapshot((select job_a from ids)) -> 'company' ->> 'phone', '702-555-0100',
  'and its phone');
select is(app.report_snapshot((select job_a from ids)) -> 'company' ->> 'legal_name', null,
  'not the main legal name');
select is(app.report_snapshot((select job_a from ids)) -> 'company' ->> 'brand_primary', '#0A5C8A',
  'and its color');
select is(app.report_snapshot((select v::uuid from st where k = 'visit')) -> 'company' ->> 'name',
  'All In Pool Solutions', 'a pool visit''s report names the main business');

-- The quote and invoice pages, the email details, link previews and checkout.
select tests.authenticate_as((select owner_a from ids));
insert into st select 'q', send_quote((select quote_a from ids)) ->> 'token';
insert into st select 'i', send_invoice((select invoice_a from ids)) ->> 'token';
select is(invoice_mail_details((select invoice_a from ids)) -> 'company' ->> 'name',
  'Southern Nevada Leak Detection', 'invoice emails come from the job''s business');
reset role;

set local role anon;
select is(quote_for_token((select v from st where k = 'q'), false) -> 'company' ->> 'name',
  'Southern Nevada Leak Detection', 'the quote page');
select is(quote_for_token((select v from st where k = 'q'), false) -> 'company' ->> 'logo_path',
  (select ca from ids) || '/logo2-1.png', 'with the second logo');
select is(invoice_for_token((select v from st where k = 'i'), false) -> 'company' ->> 'name',
  'Southern Nevada Leak Detection', 'the invoice page');
select ok(invoice_for_token((select v from st where k = 'i'), false) ? 'payments',
  'the invoice page keeps its payments');
select is(link_preview_for_token((select v from st where k = 'q')) ->> 'shop',
  'Southern Nevada Leak Detection', 'the quote''s link preview');
reset role;

insert into storage.objects (bucket_id, name) values
  ('company-assets', (select ca from ids) || '/logo2-1.png'),
  ('company-assets', (select ca from ids) || '/logo-1.png');
set local role anon;
select is((select array_agg(name order by name) from storage.objects
           where bucket_id = 'company-assets' and name like '%logo%'),
  array[(select ca from ids) || '/logo-1.png', (select ca from ids) || '/logo2-1.png'],
  'a live quote link opens both logos, signed out');
reset role;

set local role service_role;
select is(quote_checkout_details((select v from st where k = 'q')) ->> 'company_name',
  'Southern Nevada Leak Detection', 'the deposit checkout line');
select is(invoice_checkout_details((select v from st where k = 'i')) ->> 'company_name',
  'Southern Nevada Leak Detection', 'the invoice checkout line');
reset role;

-- Turning the second business off (blank name) puts everything back on the main one.
update company set second_name = ' ' where id = (select ca from ids);
select is(app.report_snapshot((select job_a from ids)) -> 'company' ->> 'name', 'All In Pool Solutions',
  'a blank name turns the second business off');
update company set second_name = 'Southern Nevada Leak Detection' where id = (select ca from ids);

-- ---------------------------------------------------------------------------
-- The tech on reports
-- ---------------------------------------------------------------------------

select is(app.report_snapshot((select job_a from ids)) -> 'tech_card', 'null'::jsonb,
  'off by default: no tech card');

-- A tech sets their own photo, not someone else's; owners and admins set anyone's.
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ select set_member_photo(%L, %L) $$,
  (select id from membership where user_id = (select tech_a from ids) and company_id = (select ca from ids)),
  (select ca from ids) || '/team/' || (select tech_a from ids) || '-1.jpg'),
  'a tech sets their own photo');
select throws_ok(format($$ select set_member_photo(%L, %L) $$,
  (select id from membership where user_id = (select owner_a from ids) and company_id = (select ca from ids)),
  (select ca from ids) || '/team/x-1.jpg'), '42501', null, 'not someone else''s');
select throws_ok(format($$ select set_member_photo(%L, %L) $$,
  (select id from membership where user_id = (select tech_a from ids) and company_id = (select ca from ids)),
  (select ca from ids) || '/logo-9.png'), '22023', null, 'only a photo under team/');
select throws_ok(format($$ select set_member_photo(%L, %L) $$,
  (select id from membership where user_id = (select tech_a from ids) and company_id = (select ca from ids)),
  (select cb from ids) || '/team/' || (select tech_a from ids) || '-1.jpg'), '22023', null,
  'not a photo in another shop');
select lives_ok($$ insert into storage.objects (bucket_id, name)
  values ('company-assets', (select ca from ids) || '/team/' || (select tech_a from ids) || '-1.jpg') $$,
  'a tech uploads their own photo');
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('company-assets', (select ca from ids) || '/team/' || (select owner_a from ids) || '-1.jpg') $$,
  '42501', null, 'but not under someone else''s name');
reset role;

select tests.authenticate_as((select admin_a from ids));
select lives_ok(format($$ select set_member_photo(%L, null) $$,
  (select id from membership where user_id = (select owner_a from ids) and company_id = (select ca from ids))),
  'an admin changes anyone''s photo');
select lives_ok($$ insert into storage.objects (bucket_id, name)
  values ('company-assets', (select ca from ids) || '/team/' || (select owner_a from ids) || '-2.jpg') $$,
  'and uploads it');
reset role;

select tests.authenticate_as((select tech_b from ids));
select throws_ok(format($$ select set_member_photo(%L, null) $$,
  (select id from membership where user_id = (select tech_a from ids) and company_id = (select ca from ids))),
  '42501', null, 'another shop''s tech changes nothing');
reset role;

-- The owner turns it on: the report snapshot keeps the tech's name, photo and color.
update company set settings = settings || '{"tech_on_reports": true}' where id = (select ca from ids);
select is(app.report_snapshot((select job_a from ids)) -> 'tech_card' -> 'techs' -> 0 ->> 'photo_path',
  (select ca from ids) || '/team/' || (select tech_a from ids) || '-1.jpg', 'the report keeps the tech''s photo');
select is(app.report_snapshot((select job_a from ids)) -> 'tech_card' -> 'techs' -> 0 ->> 'name',
  'a-tech', 'and name');
select is(jsonb_array_length(app.report_snapshot((select job_a from ids)) -> 'tech_card' -> 'techs'), 1,
  'one tech');

-- A sent report's tech photo opens signed out through its link.
update report set status = 'sent', sent_at = now(),
  data_snapshot = app.report_snapshot((select job_a from ids))
where id = (select report_a from ids);
set local role anon;
select is((select count(*) from storage.objects
           where name = (select ca from ids) || '/team/' || (select tech_a from ids) || '-1.jpg'),
  1::bigint, 'a live report link opens its tech''s photo');
select is((select count(*) from storage.objects
           where name = (select ca from ids) || '/team/' || (select owner_a from ids) || '-2.jpg'),
  0::bigint, 'and no one else''s');
reset role;

select * from finish();
rollback;
