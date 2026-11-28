-- OK to Text: New Job marks a new customer with "text_ok", and anyone on the team can mark or
-- clear it on a customer.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a
  from fx;
grant select on ids to authenticated;
create temp table st (k text primary key, v text);
grant all on st to authenticated;

select tests.authenticate_as((select owner_a from ids));
insert into st select 'ok', create_job((select ca from ids),
  '{"name": "Texts OK", "phone": "(480) 555-0100", "text_ok": true}', null,
  '{"address_line1": "1 Ok St"}', null, '{"status": "unscheduled"}', '[]')::text;
insert into st select 'no', create_job((select ca from ids),
  '{"name": "Not Asked", "phone": "(480) 555-0101"}', null,
  '{"address_line1": "2 No St"}', null, '{"status": "unscheduled"}', '[]')::text;
select results_eq(
  format($$ select c.text_ok_at is not null, c.text_ok_by from job j
            join customer c on c.id = j.bill_to_customer_id where j.id = %L $$,
         (select v from st where k = 'ok')),
  format($$ values (true, %L::uuid) $$, (select owner_a from ids)),
  'New Job marks the new customer OK to text, by whoever made it');
select results_eq(
  format($$ select c.text_ok_at is null from job j
            join customer c on c.id = j.bill_to_customer_id where j.id = %L $$,
         (select v from st where k = 'no')),
  $$ values (true) $$,
  'and leaves it unmarked otherwise');
reset role;

select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected(format(
  $$ update customer set text_ok_at = now(), text_ok_by = %L where id = %L $$,
  (select tech_a from ids), (select cust_a from ids))), 1::bigint, 'a tech can mark a customer');
select is(tests.rows_affected(format(
  $$ update customer set text_ok_at = null, text_ok_by = null where id = %L $$,
  (select cust_a from ids))), 1::bigint, 'and clear it');
reset role;

select * from finish();
rollback;
