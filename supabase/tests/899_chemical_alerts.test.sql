-- Out-of-range alerts: the sent-once record is server-only and one row per reading.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select (a ->> 'tech')::uuid as tech_a from fx;
grant select on ids to authenticated, anon, service_role;

create temp table reading as
  select id from chemical_reading where company_id = (select (a ->> 'company')::uuid from fx)
  limit 1;
grant select on reading to authenticated, anon, service_role;

insert into chemical_alert (reading_id, reading_key) values ((select id from reading), 'ph');
select throws_ok(format($$ insert into chemical_alert (reading_id, reading_key)
  values (%L, 'ph') $$, (select id from reading)), '23505', null,
  'a reading is alerted once');
select lives_ok(format($$ insert into chemical_alert (reading_id, reading_key)
  values (%L, 'fc') $$, (select id from reading)),
  'each reading of the entry has its own');
select throws_ok(format($$ insert into chemical_alert (reading_id, reading_key)
  values (%L, 'lsi') $$, (select id from reading)), '23514', null,
  'only the six readings');

select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select * from chemical_alert $$, '42501', null,
  'nobody signed in reads the record');
select throws_ok(format($$ insert into chemical_alert (reading_id, reading_key)
  values (%L, 'ta') $$, (select id from reading)), '42501', null,
  'or writes it');
reset role;

delete from chemical_reading where id = (select id from reading);
select is((select count(*) from chemical_alert), 0::bigint,
  'a removed entry takes its alerts with it');

select * from finish();
rollback;
