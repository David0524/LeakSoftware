-- New Job offers Repair to every shop (owner, 2026-10-18): create_job makes a repair job with
-- no checklist, and its price goes on the invoice as "Repair", not "Leak detection".
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated;
create temp table st (k text, v uuid);
grant select, insert on st to authenticated;

select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ insert into st select 'repair', create_job(%1$L, null, %2$L, null, %3$L,
  '{"type": "repair", "status": "in_progress", "fee_cents": 45000}', '[]') $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)),
  'owners make a repair job directly');
select results_eq($$ select type, fee_cents, parent_job_id from job
  where id = (select v from st where k = 'repair') $$,
  $$ values ('repair'::text, 45000, null::uuid) $$, 'a repair with its price and no quote');
select is((select count(*)::int from job_component
  where job_id = (select v from st where k = 'repair')), 0, 'with no checklist');
insert into st select 'inv', create_invoice((select v from st where k = 'repair'));
select results_eq($$ select description, unit_price_cents::int from invoice_line_item
  where invoice_id = (select v from st where k = 'inv') and deleted_at is null $$,
  $$ values ('Repair'::text, 45000) $$, 'its invoice bills the price as a repair');

select lives_ok(format($$ insert into st select 'det', create_job(%1$L, null, %2$L, null, %3$L,
  '{"type": "detection", "status": "in_progress", "fee_cents": 29900}', '[]') $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)), 'a leak job');
insert into st select 'inv2', create_invoice((select v from st where k = 'det'));
select results_eq($$ select description from invoice_line_item
  where invoice_id = (select v from st where k = 'inv2') and deleted_at is null $$,
  $$ values ('Leak detection'::text) $$, 'still bills its fee as leak detection');
reset role;

select * from finish();
rollback;
