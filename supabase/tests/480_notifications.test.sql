-- Notifications: phones' push tokens are server-only, and each person sets their own kinds.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a from fx;
grant select on ids to authenticated, anon, service_role;

insert into push_device (user_id, service, token, app)
  values ((select tech_a from ids), 'apns', repeat('a', 64), 'iPhone app');

select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select * from push_device $$, '42501', null,
  'nobody signed in reads push tokens');
select throws_ok(format($$ insert into push_device (user_id, service, token)
  values (%L, 'expo', 'ExponentPushToken[xyz]') $$, (select tech_a from ids)), '42501', null,
  'or writes them');
select is(tests.rows_affected(format($$ update profile set notification_prefs = '{"text": false}'
  where id = %L $$, (select tech_a from ids))), 1::bigint,
  'a person turns a kind off for themselves');
select is(tests.rows_affected(format($$ update profile set notification_prefs = '{}'
  where id = %L $$, (select owner_a from ids))), 0::bigint,
  'but not for anyone else');
reset role;

select throws_ok(format($$ update profile set notification_prefs = '[]' where id = %L $$,
  (select tech_a from ids)), '23514', null, 'the settings are an object');
select throws_ok(format($$ insert into push_device (user_id, service, token)
  values (%L, 'sms', repeat('b', 20)) $$, (select tech_a from ids)), '23514', null,
  'only Apple''s and Expo''s push services');

select * from finish();
rollback;
