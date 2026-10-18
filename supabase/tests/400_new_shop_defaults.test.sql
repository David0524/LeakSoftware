-- New shops start with no deposit and no tech discount (owner, 2026-10-18).
begin;
set search_path = public, extensions;
select plan(2);

select tests.authenticate_as(tests.create_user('fresh-shop@test.local'));
create temp table fresh on commit drop as select create_company('Fresh Pools', null, 'both') as id;
reset role;

select is((select (settings -> 'deposit' ->> 'value_bps')::int from company where id = (select id from fresh)),
  0, 'a new shop asks for no deposit');
select is((select (settings ->> 'tech_discount_limit_bps')::int from company where id = (select id from fresh)),
  0, 'and lets techs give no discount');

select * from finish();
rollback;
