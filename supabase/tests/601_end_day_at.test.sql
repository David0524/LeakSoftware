-- End the day at the shop or at home (owner, 2026-11-23): set apart from where the day starts,
-- by the person (their own, also from the app through the sync layer) and by owners and admins.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a
  from fx;
grant select on ids to authenticated;

select ok((select insert_columns @> '{end_at}' and update_columns @> '{end_at}'
  from app.sync_table where table_name = 'member_start'), 'end_at syncs and is client-writable');

-- A tech starts at the shop and ends at home.
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ insert into member_start (id, company_id, user_id, start_from, end_at,
  home_address) values ('00000000-0000-7000-8000-000000000621', %L, %L, 'shop', 'home', '4 Elm St') $$,
  (select ca from ids), (select tech_a from ids)), 'a tech sets a home end with a shop start');
select is((select start_from || '/' || end_at from member_start
  where id = '00000000-0000-7000-8000-000000000621'), 'shop/home', 'and it''s kept apart');
select is(tests.rows_affected($$ update member_start set end_at = 'shop'
  where id = '00000000-0000-7000-8000-000000000621' $$), 1::bigint, 'and changes it');
-- From the app, through the sync layer.
select is((select sync_push(jsonb_build_array(jsonb_build_object(
  'id', '00000000-0000-7000-8000-000000000622', 'table', 'member_start',
  'row_id', '00000000-0000-7000-8000-000000000621', 'company_id', (select ca from ids),
  'fields', jsonb_build_object(
    'end_at', jsonb_build_object('v', 'home', 'hlc',
      ((extract(epoch from clock_timestamp()) * 1000)::bigint + 60000) || '-0000-dev1')))))
  -> 'results' -> 0 ->> 'status'), 'applied', 'and from the app');
select is((select end_at from member_start where id = '00000000-0000-7000-8000-000000000621'),
  'home', 'which saves it');
reset role;

-- The owner changes a tech's end.
select tests.authenticate_as((select owner_a from ids));
select is(tests.rows_affected($$ update member_start set end_at = 'shop'
  where id = '00000000-0000-7000-8000-000000000621' $$), 1::bigint, 'the owner changes a tech''s end');
reset role;

-- A new row ends at the shop; only the shop or home.
select is((select end_at from member_start where user_id = (select owner_a from ids)), 'shop',
  'a row without an end ends at the shop');
select throws_ok($$ update member_start set end_at = 'office' $$, '23514', null,
  'only the shop or home');
select throws_ok($$ update member_start set end_at = null $$, '23502', null, 'never empty');

select * from finish();
rollback;
