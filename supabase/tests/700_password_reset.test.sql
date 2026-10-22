-- Password reset (owner, 2026-10-22): at most 3 reset emails an hour to one address, and only
-- the server can ask.
begin;
set search_path = public, extensions;
select no_plan();

select tests.authenticate_as(tests.create_user('reset-me@test.local'));
select throws_ok($$ select take_password_reset('reset-me@test.local') $$, '42501', null,
  'signed-in people can''t call it');
reset role;
set local role anon;
select throws_ok($$ select take_password_reset('reset-me@test.local') $$, '42501', null,
  'nor can visitors');
reset role;

set local role service_role;
select is(take_password_reset('Reset-Me@test.local '), true, 'the first request is sent');
select is(take_password_reset('reset-me@test.local'), true, 'the second');
select is(take_password_reset('RESET-ME@TEST.LOCAL'), true, 'the third, whatever the case');
select is(take_password_reset('reset-me@test.local'), false, 'the fourth in an hour is not');
select is(take_password_reset('someone-else@test.local'), true, 'other addresses are separate');
reset role;

update app.password_reset_request set requested_at = now() - interval '61 minutes'
where email = 'reset-me@test.local';
set local role service_role;
select is(take_password_reset('reset-me@test.local'), true, 'an hour later it works again');
reset role;

select * from finish();
rollback;
