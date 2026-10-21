-- Start the day from home (owner, 2026-10-21): each person sets their own start and home
-- address, owners and admins anyone's; other techs never read someone's home address, and other
-- shops see nothing.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp table more as select tests.create_user('a-tech2@test.local') as tech2;
insert into membership (company_id, user_id, role)
  select (a ->> 'company')::uuid, (select tech2 from more), 'tech' from fx;
grant select on more to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a, (select tech2 from more) as tech2_a,
  (b ->> 'company')::uuid as cb, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated;

-- A tech sets their own start.
select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from member_start), 0, 'a tech reads nobody else''s start');
select lives_ok(format($$ insert into member_start (id, company_id, user_id, start_from, home_address)
  values ('00000000-0000-7000-8000-000000000601', %L, %L, 'home', '4 Elm St, Mesa, AZ') $$,
  (select ca from ids), (select tech_a from ids)), 'a tech adds their own start');
select is((select count(*)::int from member_start), 1, 'and reads it');
select is(tests.rows_affected($$ update member_start set home_latitude = 33.41, home_longitude = -111.83,
  home_geocoded_address = '4 Elm St, Mesa, AZ' where id = '00000000-0000-7000-8000-000000000601' $$),
  1::bigint, 'and sets its coordinates (the website''s lookup, as them)');
select is(tests.rows_affected($$ update member_start set start_from = 'shop'
  where id = '00000000-0000-7000-8000-000000000601' $$), 1::bigint, 'and changes it');
select throws_ok(format($$ insert into member_start (company_id, user_id, start_from)
  values (%L, %L, 'home') $$, (select ca from ids), (select tech2_a from ids)),
  '42501', null, 'but can''t add a start for another tech');
select throws_ok(format($$ insert into member_start (company_id, user_id, start_from)
  values (%L, %L, 'home') $$, (select cb from ids), (select tech_a from ids)),
  '42501', null, 'or in another shop');
select throws_ok($$ update member_start set user_id = gen_random_uuid() $$,
  '42501', null, 'or hand their row to someone else');
select is(tests.rows_affected($$ update member_start set home_address = 'x'
  where user_id <> auth.uid() $$), 0::bigint, 'or change anyone else''s');
reset role;

-- A changed address drops the old coordinates.
update member_start set home_address = '8 Oak Ave, Mesa, AZ'
  where id = '00000000-0000-7000-8000-000000000601';
select is((select row(home_latitude, home_longitude, home_geocoded_address)::text from member_start
  where id = '00000000-0000-7000-8000-000000000601'), '(,,)',
  'a new address clears the coordinates until it''s found');
update member_start set home_address = '9 Oak Ave, Mesa, AZ', home_latitude = 33.4, home_longitude = -111.8
  where id = '00000000-0000-7000-8000-000000000601';
select is((select home_latitude from member_start where id = '00000000-0000-7000-8000-000000000601'),
  33.4::double precision, 'unless the same write sets new ones');
select throws_ok($$ update member_start set start_from = 'office' $$, '23514', null,
  'only the shop or home');
select throws_ok($$ update member_start set home_latitude = null
  where id = '00000000-0000-7000-8000-000000000601' $$, '23514', null,
  'coordinates come in pairs');

-- Another tech of the same shop sees none of it.
select tests.authenticate_as((select tech2_a from ids));
select is((select count(*)::int from member_start), 0, 'another tech can''t read either start');
select is(tests.rows_affected($$ update member_start set start_from = 'shop' $$), 0::bigint,
  'or change one');
-- Their own goes through the sync layer, as the apps write it.
select is((select sync_push(jsonb_build_array(jsonb_build_object(
  'id', '00000000-0000-7000-8000-000000000611', 'table', 'member_start',
  'row_id', '00000000-0000-7000-8000-000000000612', 'company_id', (select ca from ids),
  'fields', jsonb_build_object(
    'user_id', jsonb_build_object('v', (select tech2_a from ids), 'hlc', '1760000000000-0000-dev1'),
    'start_from', jsonb_build_object('v', 'home', 'hlc', '1760000000000-0000-dev1'),
    'home_address', jsonb_build_object('v', '1 Pine Rd', 'hlc', '1760000000000-0000-dev1')))))
  -> 'results' -> 0 ->> 'status'), 'applied', 'a tech saves their own start from the app');
select is((select sync_push(jsonb_build_array(jsonb_build_object(
  'id', '00000000-0000-7000-8000-000000000613', 'table', 'member_start',
  'row_id', '00000000-0000-7000-8000-000000000601', 'company_id', (select ca from ids),
  'fields', jsonb_build_object(
    'start_from', jsonb_build_object('v', 'shop', 'hlc', '1760000000001-0000-dev1')))))
  -> 'results' -> 0 ->> 'status'), 'rejected', 'but not someone else''s');
reset role;

-- Owners and admins read and write everyone's.
select tests.authenticate_as((select owner_a from ids));
select is((select count(*)::int from member_start), 3, 'the owner reads every start');
select is((select home_address from member_start where user_id = (select tech_a from ids)),
  '9 Oak Ave, Mesa, AZ', 'home address included');
select is(tests.rows_affected($$ update member_start set start_from = 'home'
  where id = '00000000-0000-7000-8000-000000000601' $$), 1::bigint, 'and changes a tech''s');
select lives_ok(format($$ insert into member_start (company_id, user_id, start_from, home_address)
  values (%L, %L, 'home', '5 Birch Ct') $$, (select ca from ids), (select admin_a from ids)),
  'and adds one for someone');
select throws_ok(format($$ insert into member_start (company_id, user_id) values (%L, %L) $$,
  (select ca from ids), (select tech2_a from ids)), '23505', null, 'one start per person');
reset role;

select tests.authenticate_as((select admin_a from ids));
select is((select count(*)::int from member_start), 4, 'admins read every start too');
select is(tests.rows_affected($$ update member_start set home_address = '2 Pine Rd'
  where user_id = (select tech2_a from ids) $$), 1::bigint, 'and change them');
reset role;

-- Other shops see nothing.
select tests.authenticate_as((select owner_b from ids));
select is((select count(*)::int from member_start where company_id = (select ca from ids)), 0,
  'another shop''s owner reads none');
select is(tests.rows_affected(format($$ update member_start set start_from = 'shop'
  where company_id = %L $$, (select ca from ids))), 0::bigint, 'or changes one');
reset role;

-- A disabled member loses their own too.
update membership set status = 'disabled' where user_id = (select tech_a from ids);
select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from member_start), 0, 'a turned-off tech reads nothing');
reset role;

-- It syncs through the registry: the person writes it from their phone.
select is((select read_role || '/' || write_role || '/' || device_sync from app.sync_table
  where table_name = 'member_start'), 'manager/manager/true', 'registered and synced');

select * from finish();
rollback;
