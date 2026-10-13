-- New jobs from the office: one transaction, the caller's own access rules.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a,
  (b ->> 'company')::uuid as cb, (b ->> 'customer')::uuid as cust_b, (b ->> 'property')::uuid as prop_b
  from fx;
grant select on ids to authenticated;
create temp table st (k text primary key, v text);
grant all on st to authenticated;

select tests.authenticate_as((select owner_a from ids));
insert into st select 'j1', create_job(
  (select ca from ids),
  '{"name": "Riley New", "phone": "(480) 555-0100", "email": "riley@example.com", "cc_emails": ["pat@example.com"]}',
  null,
  '{"address_line1": "5 New St", "city": "Mesa", "state": "AZ", "postal_code": "85201", "pool_type": "vinyl", "has_spa": true, "access_notes": "Gate 1234"}',
  null,
  jsonb_build_object('status', 'scheduled', 'scheduled_start', '2026-11-01T16:00:00Z',
                     'scheduled_end', '2026-11-01T18:00:00Z', 'assigned_user_id', (select tech_a from ids),
                     'fee_cents', 64900, 'intake', '{"reason": ["Pool water level dropping"]}'::jsonb),
  (select jsonb_agg(jsonb_build_object('component_type_id', id, 'instance_number', 1,
                                       'label', name, 'sort_order', sort_order))
   from component_type where company_id = (select ca from ids) and key in ('skimmer', 'return')))::text;
select results_eq(
  format($$ select j.status, j.fee_cents, c.name, c.cc_emails, p.pool_type, p.has_spa
            from job j join customer c on c.id = j.bill_to_customer_id join property p on p.id = j.property_id
            where j.id = %L $$, (select v from st where k = 'j1')),
  $$ values ('scheduled', 64900, 'Riley New', '{pat@example.com}'::text[], 'vinyl', true) $$,
  'creates the customer, the pool, and the scheduled job');
select is((select count(*)::int from checklist_item_result where job_id = (select v::uuid from st where k = 'j1') and status = 'pending'),
  2, 'with its checklist, every item to do');
select ok((select number is not null from job where id = (select v::uuid from st where k = 'j1')), 'and a job number');

select lives_ok(format($$ select create_job(%L, null, %L, null, %L, '{"status": "unscheduled"}', '[]') $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)),
  'an existing customer and pool can be reused');
select throws_ok(format($$ select create_job(%L, null, %L, null, %L, '{"status": "unscheduled"}', '[]') $$,
  (select ca from ids), (select cust_a from ids), (select prop_b from ids)),
  '23514', null, 'but not a pool that is not theirs');
select throws_ok(format($$ select create_job(%L, null, %L, null, %L, '{"status": "unscheduled"}', '[]') $$,
  (select cb from ids), (select cust_b from ids), (select prop_b from ids)),
  '42501', null, 'and never in another company');
reset role;

select * from finish();
rollback;
