-- Texting registration: one under way per shop; owners and admins read it, techs and other
-- shops don't, and nobody signed in writes it.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;

select throws_ok(format($$ insert into texting_registration (company_id, kind, business)
  values (%L, 'own', '{}') $$, (select a ->> 'company' from fx)), '23505', null,
  'one registration per shop');
update texting_registration set stage = 'cancelled'
  where company_id = (select (a ->> 'company')::uuid from fx);
select lives_ok(format($$ insert into texting_registration (company_id, kind, business)
  values (%L, 'own', '{}') $$, (select a ->> 'company' from fx)),
  'a cancelled one makes way for a new one');
select throws_ok(format($$ insert into texting_registration (company_id, kind, business)
  values (%L, 'fax', '{}') $$, (select b ->> 'company' from fx)), '23514', null,
  'only toll-free, local, or own');

select tests.authenticate_as((select (a ->> 'owner')::uuid from fx));
select is((select count(*) from texting_registration), 2::bigint,
  'the owner reads the shop''s registrations, not another shop''s');
select throws_ok($$ update texting_registration set stage = 'ready' $$, '42501', null,
  'the owner can''t mark it ready');
reset role;

select tests.authenticate_as((select (a ->> 'tech')::uuid from fx));
select is((select count(*) from texting_registration), 0::bigint, 'techs read none');
reset role;

-- Never copied into the audit log (its EIN with it).
update texting_registration set business = '{"ein": "12-3456789"}'
  where company_id = (select (b ->> 'company')::uuid from fx);
select is((select count(*) from audit_log where table_name = 'texting_registration'), 0::bigint,
  'registrations stay out of the audit log');

select * from finish();
rollback;
