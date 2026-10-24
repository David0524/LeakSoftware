-- "How did you hear about us?" (owner, 2026-10-24): create_company keeps the answer on the new
-- shop's subscription, from its arguments or the account's sign-up details; a bad answer is
-- dropped, never an error; owners read it but can't change it; staff see it in admin_shops.
begin;
set search_path = public, extensions;
select no_plan();

-- An answer passed in.
select tests.authenticate_as(tests.create_user('card@heard.local'));
create temp table made (label text, id uuid);
grant all on made to authenticated, service_role;
insert into made select 'card', create_company('Card Pools', null, 'pool', 'card');
reset role;
select results_eq($$ select heard_from, heard_from_other from subscription
                     where company_id = (select id from made where label = 'card') $$,
  $$ values ('card'::text, null::text) $$, 'the answer is kept with the new shop');

-- Other, with its text cleaned up and cut to 100 characters.
select tests.authenticate_as(tests.create_user('other@heard.local'));
insert into made select 'other', create_company('Other Pools', null, 'pool', ' Other ',
  '  truck   wrap ' || repeat('x', 200));
reset role;
select results_eq($$ select heard_from, char_length(heard_from_other), left(heard_from_other, 10)
                     from subscription where company_id = (select id from made where label = 'other') $$,
  $$ values ('other'::text, 100, 'truck wrap'::text) $$, 'Other keeps one short line');

-- Email confirmation first: the answer comes from the account's sign-up details.
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-0000000e0001', 'later@heard.local',
        '{"full_name": "Later", "heard_from": "other", "heard_from_other": "A billboard"}');
select tests.authenticate_as('00000000-0000-4000-8000-0000000e0001');
insert into made select 'later', create_company('Later Pools');
reset role;
select results_eq($$ select heard_from, heard_from_other from subscription
                     where company_id = (select id from made where label = 'later') $$,
  $$ values ('other'::text, 'A billboard'::text) $$, 'a shop made after confirming gets the sign-up answer');

-- Not answered, or nonsense: the shop is made all the same, with no answer.
select tests.authenticate_as(tests.create_user('none@heard.local'));
insert into made select 'none', create_company('Quiet Pools');
insert into made select 'bad', create_company('Odd Pools', null, 'pool', 'DROP TABLE; --', 'ignored');
insert into made select 'notother', create_company('Google Pools', null, 'pool', 'google', 'ignored');
reset role;
select results_eq($$ select label, heard_from, heard_from_other from subscription s
                     join made m on m.id = s.company_id where label in ('none', 'bad', 'notother')
                     order by label $$,
  $$ values ('bad'::text, null::text, null::text), ('none', null, null), ('notother', 'google', null) $$,
  'no answer, a bad one, or text without Other never stops a sign-up');

-- Owners read it with the rest of the subscription, and can't change it.
select tests.authenticate_as((select id from auth.users where email = 'card@heard.local'));
select is((select heard_from from subscription where company_id = (select id from made where label = 'card')),
  'card', 'the owner can read it');
select throws_ok(format($$ update subscription set heard_from = 'google' where company_id = %L $$,
                        (select id from made where label = 'card')),
  '42501', null, 'the owner cannot change it');
reset role;

-- The database refuses a malformed key or Other's text on another answer.
select throws_ok(format($$ update subscription set heard_from = 'Laminate Card' where company_id = %L $$,
                        (select id from made where label = 'card')),
  '23514', null, 'keys are lowercase words');
select throws_ok(format($$ update subscription set heard_from_other = 'x' where company_id = %L $$,
                        (select id from made where label = 'card')),
  '23514', null, 'text only with Other');

-- Staff (the service role) see it on the Shops pages.
set local role service_role;
select is((select r ->> 'heard_from' from jsonb_array_elements(admin_shops()) r
           where r ->> 'id' = (select id::text from made where label = 'later')), 'other',
  'admin_shops shows the answer');
select is((admin_shop((select id from made where label = 'later')) -> 'shop' ->> 'heard_from_other'),
  'A billboard', 'and a shop''s page shows what Other said');
reset role;

select * from finish();
rollback;
