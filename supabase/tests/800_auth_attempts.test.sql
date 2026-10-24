-- Limits on repeated sign-in attempts and auth emails (security review M3): only the server
-- can count or ask; 10 failed sign-ins per email or 20 per address in 15 minutes; 5 emails per
-- address or 20 per visitor in an hour; and only the server learns whether an email has an
-- account.
begin;
set search_path = public, extensions;
select no_plan();

-- Nobody but the server.
select tests.authenticate_as(tests.create_user('limits@test.local'));
select throws_ok($$ select auth_attempt_allowed('sign_in', 'limits@test.local', '1.2.3.4') $$,
  '42501', null, 'signed-in people can''t ask');
select throws_ok($$ select auth_attempt_failed('sign_in', 'limits@test.local', '1.2.3.4') $$,
  '42501', null, 'or count');
select throws_ok($$ select count(*) from app.auth_attempt $$, '42501', null,
  'or read the attempts');
reset role;
set local role anon;
select throws_ok($$ select auth_attempt_allowed('sign_in', 'limits@test.local', '1.2.3.4') $$,
  '42501', null, 'nor can visitors');
select throws_ok($$ select auth_attempt_failed('sign_in', 'limits@test.local', '1.2.3.4') $$,
  '42501', null, 'or count');
reset role;

set local role service_role;
select throws_ok($$ select count(*) from app.auth_attempt $$, '42501', null,
  'even the server only goes through the functions');

-- Sign-in failures by email.
select is(auth_attempt_allowed('sign_in', 'Limits@test.local', '10.0.0.1'), true,
  'a first sign-in is allowed');
select auth_attempt_failed('sign_in', 'limits@test.local', '10.0.0.' || n) from generate_series(1, 9) n;
select is(auth_attempt_allowed('sign_in', 'LIMITS@test.local ', '10.0.1.1'), true,
  'nine failures still allow a tenth try, whatever the case');
select auth_attempt_failed('sign_in', 'limits@test.local', '10.0.0.10');
select is(auth_attempt_allowed('sign_in', 'limits@test.local', '10.0.1.1'), false,
  'ten failures in 15 minutes stop that email, from any address');
select is(auth_attempt_allowed('sign_in', 'other@test.local', '10.0.1.1'), true,
  'other emails go on');
select is(auth_attempt_allowed('two_step', 'limits@test.local', '10.0.1.1'), true,
  'and each kind counts on its own');

-- Sign-in failures by address.
select auth_attempt_failed('sign_in', 'spray' || n || '@test.local', '203.0.113.9')
from generate_series(1, 20) n;
select is(auth_attempt_allowed('sign_in', 'fresh@test.local', '203.0.113.9'), false,
  'twenty failures from one address stop it, whatever the email');
select is(auth_attempt_allowed('sign_in', 'fresh@test.local', '203.0.113.10'), true,
  'other addresses go on');
select is(auth_attempt_allowed('sign_in', 'fresh@test.local', null), true,
  'an unknown address is limited by email only');
reset role;

update app.auth_attempt set at = now() - interval '16 minutes' where kind = 'sign_in';
set local role service_role;
select is(auth_attempt_allowed('sign_in', 'limits@test.local', '203.0.113.9'), true,
  '15 minutes later both work again');

-- Emails: counted as they're taken.
select is(auth_attempt_allowed('link', 'mail@test.local', '198.51.100.' || n, true), true,
  'sends one to five go') from generate_series(1, 5) n;
select is(auth_attempt_allowed('link', 'mail@test.local', '198.51.100.7', true), false,
  'the sixth link to one email in an hour does not');
select is(auth_attempt_allowed('reset', 'mail@test.local', '198.51.100.7', true), true,
  'a reset is a different kind');
select is(auth_attempt_allowed('link', 'mail@test.local', '198.51.100.7'), false,
  'asking without taking says the same');
select is(auth_attempt_allowed('sign_up', 'new' || n || '@test.local', '192.0.2.1', true), true,
  'twenty sign-ups from one address go') from generate_series(1, 20) n;
select is(auth_attempt_allowed('sign_up', 'new21@test.local', '192.0.2.1', true), false,
  'the twenty-first in an hour does not');
reset role;

update app.auth_attempt set at = now() - interval '59 minutes' where kind = 'link';
set local role service_role;
select is(auth_attempt_allowed('link', 'mail@test.local', null, true), false,
  'emails stay limited for the whole hour');
reset role;
update app.auth_attempt set at = now() - interval '61 minutes' where kind = 'link';
set local role service_role;
select is(auth_attempt_allowed('link', 'mail@test.local', null, true), true,
  'and go again after it');

select throws_ok($$ select auth_attempt_allowed('nope', 'x@test.local', null) $$, '22023', null,
  'unknown kinds are refused');
select throws_ok($$ select auth_attempt_failed('link', 'x@test.local', null) $$, '22023', null,
  'only sign-ins and codes fail');
reset role;

-- Whether an email has an account (the server's own sign-in and confirmation emails).
select tests.create_user('status-check@test.local');
update auth.users set email_confirmed_at = now() where email = 'status-check@test.local';
set local role anon;
select throws_ok($$ select auth_email_status('status-check@test.local') $$, '42501', null,
  'visitors can''t ask whether an email has an account');
reset role;
set local role service_role;
select is(auth_email_status(' Status-Check@test.local '), 'confirmed', 'a confirmed account');
select is(auth_email_status('nobody@test.local'), 'none', 'no account');
reset role;
update auth.users set email_confirmed_at = null where email = 'status-check@test.local';
set local role service_role;
select is(auth_email_status('status-check@test.local'), 'unconfirmed', 'not confirmed yet');
reset role;

select * from finish();
rollback;
