-- A repair job's report is about the repair work (owner, 2026-10-22): its snapshot lists the
-- work from the accepted quote that made the job, else the item it was booked for. Leak
-- detection snapshots don't change.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'job')::uuid as job_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated, anon;
create temp table st (k text primary key, v text);
grant all on st to authenticated, anon;

-- A quote on the leak detection job, sent and accepted: accepting makes the repair job.
select tests.authenticate_as((select owner_a from ids));
with x as (
  insert into quote (company_id, job_id) values ((select ca from ids), (select job_a from ids))
  returning id)
insert into st select 'q', id from x;
insert into quote_line_item (company_id, quote_id, description, quantity, unit_price_cents, sort_order)
select (select ca from ids), (select v::uuid from st where k = 'q'), d, qty, 1000, n
from (values ('Pool light bulb', 2.0, 2), ('Replace main drain cover', 1.0, 1)) v(d, qty, n);
insert into st select 'sent', send_quote((select v::uuid from st where k = 'q'))::text;
reset role;
set local role anon;
select is(accept_quote_by_link((select v::jsonb ->> 'token' from st where k = 'sent'), 'Sam', true)
  ->> 'status', 'accepted', 'the customer accepts the quote');
reset role;
insert into st select 'repair', repair_job_id from quote where id = (select v::uuid from st where k = 'q');

select is(app.report_snapshot((select v::uuid from st where k = 'repair')) -> 'work',
  '[{"description": "Replace main drain cover", "quantity": 1.0},
    {"description": "Pool light bulb", "quantity": 2.0}]'::jsonb,
  'a repair job''s snapshot lists its accepted quote''s lines, in order, without prices');
select is(app.report_snapshot((select v::uuid from st where k = 'repair')) #>> '{job,type}', 'repair',
  'and is still the repair job''s snapshot');

-- Made in New Job › Repair: the When They Call item it was booked for.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ insert into st select 'direct', create_job(%1$L, null, %2$L, null, %3$L,
  '{"type": "repair", "status": "in_progress", "intake": {"repair_item": "Filter clean"}}', '[]') $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)), 'a repair booked directly');
select lives_ok(format($$ insert into st select 'bare', create_job(%1$L, null, %2$L, null, %3$L,
  '{"type": "repair", "status": "in_progress", "summary_notes": "Pump is loud"}', '[]') $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)), 'and one with only notes');
reset role;
select is(app.report_snapshot((select v::uuid from st where k = 'direct')) -> 'work',
  '[{"description": "Filter clean", "quantity": 1}]'::jsonb, 'lists the item it was booked for');
select is(app.report_snapshot((select v::uuid from st where k = 'bare')) -> 'work', '[]'::jsonb,
  'and nothing it wasn''t (the draft uses the notes)');

-- Leak detection snapshots are as they were.
select ok(not (app.report_snapshot((select job_a from ids)) ? 'work'),
  'a leak detection snapshot has no work list');

select * from finish();
rollback;
