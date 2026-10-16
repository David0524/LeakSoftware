-- Company texting (20261012003500): the server writes texts and calls; members read them and
-- mark a conversation read for the team; owners change the line's settings; pictures stay in
-- the shop's own folder.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (b ->> 'company')::uuid as cb,
  (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a from fx;
grant select on ids to authenticated;

-- A tech sees the shop's conversation and marks it read for everyone.
select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from conversation), 1, 'a tech sees the shop''s conversations');
select is((select count(*)::int from text_message), 1, 'and their texts');
select is((select count(*)::int from call_log), 1, 'and calls');
with u as (update conversation set unread = false returning 1)
select is((select count(*)::int from u), 1, 'a tech marks a conversation read');
select throws_ok(
  format('insert into text_message (company_id, conversation_id, direction, body) select %L, id, ''out'', ''hi'' from conversation',
    (select ca from ids)),
  '42501', null, 'only the server writes texts (they go out through Twilio)');
with u as (update phone_line set pictures = false returning 1)
select is((select count(*)::int from u), 0, 'a tech can''t change the line''s settings');
reset role;

-- The owner turns pictures off and picks who rings.
select tests.authenticate_as((select owner_a from ids));
with u as (update phone_line set pictures = false, ring_user_ids = array[(select owner_a from ids)]
           returning 1)
select is((select count(*)::int from u), 1, 'an owner changes the line''s settings');
select throws_ok('update phone_line set number = ''+16025550199''', '42501', null,
  'but not its number (the server owns it)');
select is((select count(*)::int from storage.objects where bucket_id = 'texts'), 1,
  'pictures in texts: the shop''s own folder only');
reset role;

-- One working line per shop, and a number belongs to one shop.
select throws_ok(
  format('insert into phone_line (company_id, number) values (%L, ''+16025550111'')', (select ca from ids)),
  '23505', null, 'a shop has one working number');
select throws_ok(
  format('insert into phone_line (company_id, number) select %L, number from phone_line where company_id = %L',
    (select cb from ids), (select ca from ids)),
  '23505', null, 'a number can''t belong to two shops');
select throws_ok(
  format('insert into conversation (company_id, phone) values (%L, ''602-555-0100'')', (select ca from ids)),
  '23514', null, 'phone numbers are stored as +1...');

select * from finish();
rollback;
