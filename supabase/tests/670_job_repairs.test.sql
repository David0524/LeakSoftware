-- Several repairs on one repair job (owner, 2026-10-22: "add additional repair"): New Job saves
-- them with the job, techs add and remove them (through sync too), the job's price is their sum
-- whatever a phone wrote, the invoice bills one line each, and the report lists them all.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a,
  (a ->> 'job')::uuid as job_a, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated;
create temp table st (k text, v uuid);
grant select, insert on st to authenticated;

create function pg_temp.mut(tbl text, row_id uuid, company uuid, fields jsonb)
returns jsonb language sql as $$
  select jsonb_build_object('id', gen_random_uuid(), 'table', tbl, 'row_id', row_id,
                            'company_id', company, 'fields', fields)
$$;
create function pg_temp.f(v jsonb, hlc text) returns jsonb language sql as $$
  select jsonb_build_object('v', v, 'hlc', hlc)
$$;
grant execute on all functions in schema pg_temp to authenticated;

-- New Job › Repair with two repairs, given to the tech.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ insert into st select 'job', create_job(%1$L, null, %2$L, null, %3$L,
  jsonb_build_object('type', 'repair', 'status', 'in_progress', 'assigned_user_id', %4$L,
    'fee_cents', 63500, 'intake', '{"repair_item": "Pump motor, Heater igniter"}'::jsonb,
    'repairs', '[{"description": "Pump motor", "price_cents": 45000},
                 {"description": "Heater igniter", "price_cents": 18500}]'::jsonb), '[]') $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids), (select tech_a from ids)),
  'New Job saves a repair job with two repairs');
select results_eq($$ select description, price_cents, sort_order from job_repair
  where job_id = (select v from st where k = 'job') order by sort_order $$,
  $$ values ('Pump motor'::text, 45000, 0), ('Heater igniter'::text, 18500, 1) $$,
  'each repair is a row, in order');
select is((select fee_cents from job where id = (select v from st where k = 'job')), 63500,
  'the job''s price is their sum');

-- The tech adds one on the job; a stale price written after is put back to the sum.
reset role;
select tests.authenticate_as((select tech_a from ids));
insert into job_repair (company_id, job_id, description, price_cents, sort_order)
values ((select ca from ids), (select v from st where k = 'job'), 'Skimmer lid', 2500, 2);
select is((select fee_cents from job where id = (select v from st where k = 'job')), 66000,
  'adding a repair raises the price');
update job set fee_cents = 45000 where id = (select v from st where k = 'job');
select is((select fee_cents from job where id = (select v from st where k = 'job')), 66000,
  'a price written without every repair stays their sum');
update job_repair set deleted_at = now()
where job_id = (select v from st where k = 'job') and description = 'Skimmer lid';
select is((select fee_cents from job where id = (select v from st where k = 'job')), 63500,
  'removing one lowers it');

-- Two phones write the booked repair of an older job (the job's id as the row's id): one row.
reset role;
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ insert into st select 'old', create_job(%1$L, null, %2$L, null, %3$L,
  '{"type": "repair", "status": "in_progress", "fee_cents": 45000,
    "intake": {"repair_item": "Pump motor"}}', '[]') $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)),
  'a repair booked the old way (no rows)');
select is((select count(*)::int from job_repair where job_id = (select v from st where k = 'old')),
  0, 'has no repair rows');
select is((select fee_cents from job where id = (select v from st where k = 'old')), 45000,
  'and keeps its price');
select is((sync_push(jsonb_build_array(
  pg_temp.mut('job_repair', (select v from st where k = 'old'), (select ca from ids),
    jsonb_build_object('job_id', pg_temp.f(to_jsonb((select v from st where k = 'old')), '1800000000000-0000-devA'),
                       'description', pg_temp.f('"Pump motor"', '1800000000000-0000-devA'),
                       'price_cents', pg_temp.f('45000', '1800000000000-0000-devA'),
                       'sort_order', pg_temp.f('0', '1800000000000-0000-devA'))),
  pg_temp.mut('job_repair', gen_random_uuid(), (select ca from ids),
    jsonb_build_object('job_id', pg_temp.f(to_jsonb((select v from st where k = 'old')), '1800000000000-0001-devA'),
                       'description', pg_temp.f('"Heater igniter"', '1800000000000-0001-devA'),
                       'price_cents', pg_temp.f('18500', '1800000000000-0001-devA'),
                       'sort_order', pg_temp.f('1', '1800000000000-0001-devA')))), 'devA')
  -> 'results' -> 1 ->> 'status'), 'applied', 'phone A adds a repair (and writes the booked one)');
select is((sync_push(jsonb_build_array(
  pg_temp.mut('job_repair', (select v from st where k = 'old'), (select ca from ids),
    jsonb_build_object('job_id', pg_temp.f(to_jsonb((select v from st where k = 'old')), '1800000000000-0000-devB'),
                       'description', pg_temp.f('"Pump motor"', '1800000000000-0000-devB'),
                       'price_cents', pg_temp.f('45000', '1800000000000-0000-devB'),
                       'sort_order', pg_temp.f('0', '1800000000000-0000-devB'))),
  pg_temp.mut('job_repair', gen_random_uuid(), (select ca from ids),
    jsonb_build_object('job_id', pg_temp.f(to_jsonb((select v from st where k = 'old')), '1800000000000-0001-devB'),
                       'description', pg_temp.f('"Skimmer lid"', '1800000000000-0001-devB'),
                       'price_cents', pg_temp.f('2500', '1800000000000-0001-devB'),
                       'sort_order', pg_temp.f('1', '1800000000000-0001-devB'))),
  pg_temp.mut('job', (select v from st where k = 'old'), (select ca from ids),
    jsonb_build_object('fee_cents', pg_temp.f('47500', '1800000000000-0002-devB')))), 'devB')
  -> 'results' -> 1 ->> 'status'), 'applied', 'phone B, which hadn''t seen it, adds another');
select results_eq($$ select description, price_cents from job_repair
  where job_id = (select v from st where k = 'old') and deleted_at is null
  order by sort_order, description $$,
  $$ values ('Pump motor'::text, 45000), ('Heater igniter'::text, 18500), ('Skimmer lid'::text, 2500) $$,
  'both repairs stay, and the booked one is there once');
select is((select fee_cents from job where id = (select v from st where k = 'old')), 66000,
  'the price is the full sum, whatever phone B wrote');

-- The invoice bills one line per repair; the report lists every repair.
reset role;
update job set status = 'in_progress' where id = (select v from st where k = 'job');
reset role;
select tests.authenticate_as((select owner_a from ids));
insert into st select 'inv', create_invoice((select v from st where k = 'job'));
select results_eq($$ select description, unit_price_cents::int from invoice_line_item
  where invoice_id = (select v from st where k = 'inv') and deleted_at is null order by sort_order $$,
  $$ values ('Pump motor'::text, 45000), ('Heater igniter'::text, 18500) $$,
  'the invoice bills each live repair');
reset role;
select is(app.report_snapshot((select v from st where k = 'job')) -> 'work',
  '[{"description": "Pump motor", "quantity": 1}, {"description": "Heater igniter", "quantity": 1}]'::jsonb,
  'the report lists every repair');
-- Removing every repair leaves nothing to list (not the booking again) and a $0 price.
update job_repair set deleted_at = now() where job_id = (select v from st where k = 'old');
select is(app.report_snapshot((select v from st where k = 'old')) -> 'work', '[]'::jsonb,
  'a job whose repairs were all removed lists none');
select is((select fee_cents from job where id = (select v from st where k = 'old')), 0,
  'and costs nothing');

-- A leak detection job's fee isn't touched by a repair row on it (the helper adds one).
create temp table fee0 as select fee_cents from job where id = (select job_a from ids);
insert into job_repair (company_id, job_id, description, price_cents)
values ((select ca from ids), (select job_a from ids), 'Another', 777);
select is((select fee_cents from job where id = (select job_a from ids)), (select fee_cents from fee0),
  'leak detection fee unchanged');
select is((select count(*)::int from job_repair where job_id = (select job_a from ids)), 2,
  'the helper''s repair and this one are there');

-- Another shop can't see or add repairs here.
reset role;
select tests.authenticate_as((select owner_b from ids));
select is((select count(*)::int from job_repair where job_id = (select v from st where k = 'job')), 0,
  'another shop sees none');
select throws_ok(format($$ insert into job_repair (company_id, job_id, description, price_cents)
  values (%L, %L, 'Sneaky', 1) $$, (select ca from ids), (select v from st where k = 'job')),
  '42501', null, 'and can''t add one');
reset role;

select * from finish();
rollback;
