-- sync_pull_count (2026-10-20): what a phone's first download holds, per table.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a,
  (b ->> 'company')::uuid as cb from fx;
grant select on ids to authenticated;

select tests.authenticate_as((select tech_a from ids));
create temp table c as select sync_pull_count() as n;
select ok((select (n ->> 'customer')::bigint >= 1 from c), 'counts the shop''s customers');
select is((select (n ->> 'customer')::bigint from c),
  (select count(*) from customer), 'the same customers the tech can read');
select ok((select bool_and(jsonb_typeof(v) = 'number' and v::text::bigint > 0)
           from c, jsonb_each(n) e(k, v)), 'only tables with rows, as numbers');
select ok((select bool_and(k in (select table_name from app.sync_table where device_sync))
           from c, jsonb_each(n) e(k, v)), 'only tables phones download');
reset role;

select set_config('request.jwt.claims', '', true);
set local role authenticated;
select throws_ok('select sync_pull_count()', '42501', null, 'signed in only');
reset role;

select * from finish();
rollback;
