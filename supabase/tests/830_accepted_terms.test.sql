-- "By creating an account, you agree to the Terms and Privacy Policy." (owner, 2026-10-24): an
-- account made with accepted_terms in its sign-up details records when, by the database's
-- clock; others record nothing; nobody can change it afterwards.
begin;
set search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000f0001', 'agreed@terms.local',
   '{"full_name": "Agreed", "accepted_terms": true}'),
  ('00000000-0000-4000-8000-0000000f0002', 'before@terms.local', '{"full_name": "Before"}'),
  ('00000000-0000-4000-8000-0000000f0003', 'said-no@terms.local',
   '{"full_name": "Said No", "accepted_terms": false}');

select results_eq($$ select email, accepted_terms_at = now(), full_name from profile
                     where email like '%@terms.local' order by email $$,
  $$ values ('agreed@terms.local'::text, true, 'Agreed'::text), ('before@terms.local', null, 'Before'),
            ('said-no@terms.local', null, 'Said No') $$,
  'the time is recorded only for a sign-up that showed the terms line');

-- The person can read it, and change their name, but never the time.
select tests.authenticate_as('00000000-0000-4000-8000-0000000f0001');
select isnt((select accepted_terms_at from profile where id = auth.uid()), null, 'they can read it');
select throws_ok($$ update profile set accepted_terms_at = null where id = auth.uid() $$,
  '42501', null, 'they cannot clear it');
reset role;
select tests.authenticate_as('00000000-0000-4000-8000-0000000f0002');
select throws_ok($$ update profile set accepted_terms_at = now() where id = auth.uid() $$,
  '42501', null, 'or set it');
select is(tests.rows_affected($$ update profile set full_name = 'Before Too' where id = auth.uid() $$),
  1::bigint, 'their name is still theirs to change');
reset role;

select * from finish();
rollback;
