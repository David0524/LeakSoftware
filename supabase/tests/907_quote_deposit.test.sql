-- A quote's own deposit (2026-11-27): owners and admins set it on a draft; techs can't; sending
-- the quote freezes it and asks for that deposit.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
create temp view ids as select
  (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'admin')::uuid as admin_a, (a ->> 'quote')::uuid as quote_a
  from fx;
grant select on fx, ids to authenticated, anon, service_role;

select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ update quote set deposit_rule = '{"type": "percent", "value_bps": 0, "minimum_cents": 0}'
                   where id = (select quote_a from ids) $$,
  '42501', null, 'a tech can''t change a quote''s deposit');
select lives_ok($$ update quote set notes = 'Hi' where id = (select quote_a from ids) $$,
  'but still edits the quote');
reset role;

select tests.authenticate_as((select admin_a from ids));
select lives_ok($$ update quote set deposit_rule = '{"type": "fixed", "value_cents": 5000, "minimum_cents": 0}'
                   where id = (select quote_a from ids) $$, 'an admin sets this quote''s deposit');
reset role;

select tests.authenticate_as((select owner_a from ids));
select lives_ok($$ select send_quote((select quote_a from ids)) $$, 'the owner sends it');
reset role;
select is((select deposit_cents from quote where id = (select quote_a from ids)), 5000,
  'it asks for the quote''s own deposit, not the shop''s');
select is((select deposit_rule ->> 'type' from quote where id = (select quote_a from ids)), 'fixed',
  'and keeps the rule');

select * from finish();
rollback;
