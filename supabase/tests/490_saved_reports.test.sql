-- Saved reports: a shop's own wording, read by the whole team, written by owners and admins.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as company_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'owner')::uuid as owner_a from fx;
grant select on ids to authenticated, anon, service_role;

select is((select device_sync from app.sync_table where table_name = 'saved_report'), true,
  'saved reports sync to phones');

select tests.authenticate_as((select tech_a from ids));
select is((select count(*) from saved_report), 1::bigint, 'techs read the shop''s saved reports');
select throws_ok(format($$ insert into saved_report (company_id, name, sections)
  values (%L, 'Mine', '{}') $$, (select company_a from ids)), '42501', null,
  'but don''t add them');
select is(tests.rows_affected($$ update saved_report set name = 'Renamed' $$), 0::bigint,
  'or change them');
reset role;

select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ insert into saved_report (company_id, name, sections)
  values (%L, 'Drain repair', '{"summary": "We replaced the main drain cover.", "next_steps": "Refill the pool."}') $$,
  (select company_a from ids)), 'owners add one');
select is(tests.rows_affected($$ update saved_report set deleted_at = now() where name = 'Drain repair' $$),
  1::bigint, 'and remove it');
reset role;

select throws_ok(format($$ insert into saved_report (company_id, name, sections)
  values (%L, '  ', '{}') $$, (select company_a from ids)), '23514', null, 'it needs a name');
select throws_ok(format($$ insert into saved_report (company_id, name, sections)
  values (%L, 'List', '["x"]') $$, (select company_a from ids)), '23514', null,
  'and its text is by section');

select * from finish();
rollback;
