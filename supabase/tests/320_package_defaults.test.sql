-- Defaults per package (owner, 2026-10-16): a shop starts with its own package's checklist,
-- tests, and price book; taking on another package later adds that one's, once.
begin;
set search_path = public, extensions;
select no_plan();

select tests.authenticate_as(tests.create_user('pool-founder@test.local'));
create temp table pool_shop on commit drop as
  select create_company('Blue Lagoon Pools', 'America/Phoenix', 'pool') as id;
grant select on pool_shop to authenticated;
select is((select settings ->> 'services' from company where id = (select id from pool_shop)), 'pool',
  'pool: the shop is set to pool care');
select is((select count(*) from component_type where company_id = (select id from pool_shop)
            and job_type = 'maintenance'), 10::bigint, 'pool: the visit checklist (3 on a schedule)');
select is((select count(*) from component_type where company_id = (select id from pool_shop)
            and job_type = 'detection'), 0::bigint, 'pool: no inspection checklist');
select is((select count(*) from test_type where company_id = (select id from pool_shop)), 0::bigint,
  'pool: no leak tests');
select is((select count(*) from severity_level where company_id = (select id from pool_shop)), 0::bigint,
  'pool: no finding severities');
select results_eq(
  format($$ select category, count(*) from price_book_item where company_id = %L group by category order by category $$,
         (select id from pool_shop)),
  $$ values ('Chemicals'::text, 14::bigint), ('Repair', 5), ('Service', 6) $$,
  'pool: a pool service price book (services, chemicals, repairs)');
select is((select count(*) from price_book_item where company_id = (select id from pool_shop)
            and name like 'Leak detection%'), 0::bigint, 'pool: no detection fees');
select is((select count(*) from report_template where company_id = (select id from pool_shop)), 2::bigint,
  'pool: report templates, for if it adds leak detection');

-- The owner adds leak detection: its setup arrives, the pool setup isn't doubled.
update company set settings = settings || '{"services": "both"}' where id = (select id from pool_shop);
select lives_ok(format($$ select add_package_defaults(%L, 'both') $$, (select id from pool_shop)),
  'both: owners add a package''s setup');
select is((select count(*) from component_type where company_id = (select id from pool_shop)
            and job_type = 'detection'), 27::bigint, 'both: the inspection checklist arrives');
select is((select count(*) from test_type where company_id = (select id from pool_shop)), 4::bigint,
  'both: and the leak tests');
select is((select count(*) from price_book_item where company_id = (select id from pool_shop)), 36::bigint,
  'both: both price books, each once');
select lives_ok(format($$ select add_package_defaults(%L, 'both') $$, (select id from pool_shop)),
  'running it again is harmless');
select is((select count(*) from price_book_item where company_id = (select id from pool_shop)), 36::bigint,
  'and adds nothing twice');
reset role;

-- A leak detection shop starts with the leak setup only.
select tests.authenticate_as(tests.create_user('leak-founder@test.local'));
create temp table leak_shop on commit drop as
  select create_company('Clearwater Leak Pros', null, 'leak') as id;
grant select on leak_shop to authenticated;
select is((select count(*) from component_type where company_id = (select id from leak_shop)
            and job_type = 'maintenance'), 0::bigint, 'leak: no visit checklist');
select is((select count(*) from price_book_item where company_id = (select id from leak_shop)), 11::bigint,
  'leak: the leak detection price book only');
select throws_ok($$ select create_company('X', null, 'spa') $$, '22023', null,
  'unknown services are refused');
reset role;

-- Techs and other shops can't add a package's setup.
select tests.authenticate_as(tests.create_user('stranger@test.local'));
select throws_ok(format($$ select add_package_defaults(%L, 'pool') $$, (select id from leak_shop)),
  '42501', null, 'only the shop''s owners can');
reset role;

select * from finish();
rollback;
