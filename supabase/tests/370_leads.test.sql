-- Leads (owner, 2026-10-16): Tidemark's sales list. Nobody signed in can read or write it;
-- the server's lead list shows how far each person got.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;

insert into signup_lead (email, name, company_name, phone, services)
values ('walkaway@test.local', 'Walk Away', 'Halfway Pools', '+16025550123', 'pool');
insert into signup_lead (email, name, user_id)
values ('a-owner@test.local', 'Owner A', (select (a ->> 'owner')::uuid from fx))
on conflict (email) do update set user_id = excluded.user_id;

select tests.authenticate_as((select (a ->> 'owner')::uuid from fx));
select throws_ok($$ select count(*) from signup_lead $$, '42501', null, 'shop owners can''t read leads');
select throws_ok($$ insert into signup_lead (email) values ('x@test.local') $$, '42501', null,
  'or add them');
select throws_ok($$ select lead_list() $$, '42501', null, 'or list them');
reset role;

set local role anon;
select throws_ok($$ select count(*) from signup_lead $$, '42501', null, 'nor can visitors');
reset role;

select is((select x ->> 'company_name' from jsonb_array_elements(lead_list()) x
           where x ->> 'email' = 'walkaway@test.local'), 'Halfway Pools',
  'a form left half done is on the list');
select is((select x ->> 'company' from jsonb_array_elements(lead_list()) x
           where x ->> 'email' = 'a-owner@test.local'), 'Company a',
  'a signed-up lead shows their shop');
select is((select (x ->> 'card_in')::boolean from jsonb_array_elements(lead_list()) x
           where x ->> 'email' = 'a-owner@test.local'), false, 'and whether a card is in');
select throws_ok($$ insert into signup_lead (email) values ('Mixed@Test.local') $$, '23514', null,
  'emails are stored lowercased');

select * from finish();
rollback;
