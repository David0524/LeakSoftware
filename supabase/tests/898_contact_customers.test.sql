-- Text and Call Customers, per person (owner, 2026-11-23): on by default; owners and admins
-- turn it off for a tech, who then can't read the inbox or turn it back on; their phone's sync
-- starts over.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
-- Techs see every job here, so only the switch decides what they read.
update company set settings = settings || '{"techs_see_all_jobs": true}'
  where id in (select (a ->> 'company')::uuid from fx);
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a,
  (select id from membership m where m.user_id = (a ->> 'tech')::uuid) as tech_member,
  (select id from membership m where m.user_id = (a ->> 'admin')::uuid) as admin_member
  from fx;
grant select on fx, ids to authenticated;
update customer set phone = '(602) 555-0177', email = 'pat@example.com'
  where company_id = (select ca from ids);
-- Past this transaction, so its rows count as finished (as 750_first_download).
create temp table hi as select (pg_current_xact_id()::text::bigint + 1)::text as h;
create temp view pulled_customers as
  select r -> 'row' as c
  from jsonb_array_elements(
    sync_pull(jsonb_build_object('first', true, 'high', (select h from hi)), 2000) -> 'rows') r
  where r ->> 'table' = 'customer';
grant select on hi, pulled_customers to authenticated;

select is((select bool_and(can_contact_customers) from membership
           where company_id = (select ca from ids)), true, 'everyone has it to begin with');

-- With it on, the tech reads the inbox as before.
select tests.authenticate_as((select tech_a from ids));
select ok((select count(*) from conversation) > 0, 'a tech with it reads conversations');
select ok((select count(*) from text_message) > 0, 'and texts');
select ok((select count(*) from call_log) > 0, 'and calls');
create temp table scope_on on commit drop as select sync_scope() as s;
select ok((select bool_and(c ->> 'phone' is not null and c ->> 'email' is not null)
           from pulled_customers), 'their phone gets customers'' numbers and emails');
reset role;

-- An admin turns it off.
select tests.authenticate_as((select admin_a from ids));
select is(tests.rows_affected(format(
  $$ update membership set can_contact_customers = false where id = %L $$,
  (select tech_member from ids))), 1::bigint, 'an admin turns it off for a tech');
reset role;

select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from conversation), 0, 'without it, a tech reads no conversations');
select is((select count(*)::int from text_message), 0, 'no texts');
select is((select count(*)::int from call_log), 0, 'no calls');
select is((select count(*)::int from activity where conversation_id is not null), 0,
  'and no Activity about texts');
select is(tests.rows_affected(format($$ update conversation set unread = false where company_id = %L $$,
  (select ca from ids))), 0::bigint, 'and can''t mark the inbox read');
select isnt(sync_scope(), (select s from scope_on), 'their phone starts its sync over');
select ok(sync_scope() like '%:no-contact', 'with the inbox left out');
select is(may_contact_customers((select ca from ids)), false, 'the website''s check says no');
select ok((select count(*) from pulled_customers) > 0, 'customers still come down to their phone');
select ok((select bool_and(c -> 'phone' = 'null'::jsonb and c -> 'email' = 'null'::jsonb
                           and c -> 'cc_emails' = '[]'::jsonb) from pulled_customers),
  'with their numbers and emails blank');
select is(tests.rows_affected(format(
  $$ update customer set phone = null, email = null, notes = 'Gate code 1234' where company_id = %L $$,
  (select ca from ids))) > 0, true, 'a tech without it still edits a customer');
reset role;
select ok((select bool_and(phone = '(602) 555-0177' and email = 'pat@example.com'
                           and notes = 'Gate code 1234') from customer
           where company_id = (select ca from ids)),
  'but can''t change or wipe their number and email');
select tests.authenticate_as((select tech_a from ids));

-- They can't turn it back on.
select is(tests.rows_affected(format(
  $$ update membership set can_contact_customers = true where id = %L $$,
  (select tech_member from ids))), 0::bigint, 'a tech can''t turn it back on for themselves');
reset role;
select is((select can_contact_customers from membership where id = (select tech_member from ids)),
  false, 'and it stays off');

-- Owners and admins always have it, whatever the switch says.
update membership set can_contact_customers = false where id = (select admin_member from ids);
select tests.authenticate_as((select admin_a from ids));
select ok((select count(*) from conversation) > 0, 'an admin always reads the inbox');
reset role;

-- The owner turns it back on: the tech reads the inbox again.
select tests.authenticate_as((select owner_a from ids));
select is(tests.rows_affected(format(
  $$ update membership set can_contact_customers = true where id = %L $$,
  (select tech_member from ids))), 1::bigint, 'the owner turns it back on');
reset role;
select tests.authenticate_as((select tech_a from ids));
select ok((select count(*) from conversation) > 0, 'and the tech reads conversations again');
select is(sync_scope(), (select s from scope_on), 'with the scope they had');
reset role;

select * from finish();
rollback;
