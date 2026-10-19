-- Owner's list of 2026-10-19: the chemical log (readings belong to a pool, at least one
-- reading, anyone on the team can add and remove), pool diagrams, and feature requests
-- (server only).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'property')::uuid as prop_a, (a ->> 'job')::uuid as job_a,
  (b ->> 'property')::uuid as prop_b
  from fx;
grant select on ids to authenticated, anon, service_role;

-- Chemical log
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ insert into chemical_reading (company_id, property_id, job_id, fc, ph, ta)
  values (%L, %L, %L, 3, 7.6, 90) $$, (select ca from ids), (select prop_a from ids),
  (select job_a from ids)), 'a tech submits readings for a visit');
select is((select recorded_by from chemical_reading
           where property_id = (select prop_a from ids) and ta = 90),
  (select tech_a from ids), 'the reading records who submitted it');
select throws_ok(format($$ insert into chemical_reading (company_id, property_id)
  values (%L, %L) $$, (select ca from ids), (select prop_a from ids)),
  '23514', null, 'a submit needs at least one reading');
select throws_ok(format($$ insert into chemical_reading (company_id, property_id, ph)
  values (%L, %L, 15) $$, (select ca from ids), (select prop_a from ids)),
  '23514', null, 'a pH above 14 is refused');
select throws_ok(format($$ insert into chemical_reading (company_id, property_id, fc)
  values (%L, %L, 2) $$, (select ca from ids), (select prop_b from ids)),
  '23503', null, 'another company''s pool is refused');
select is(tests.rows_affected(format($$ update chemical_reading set deleted_at = now()
  where property_id = %L and ta = 90 $$, (select prop_a from ids))), 1::bigint,
  'a mistaken entry is removed');
reset role;

-- Pool diagrams: new shapes, the spa's place, and the job's markup, carried into reports
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update property set diagram_shape = 'figure_eight',
  diagram_layout = '{"mirror": true, "spa": {"x": 0.2, "y": 0.8, "size": "large"}}' where id = %L $$,
  (select prop_a from ids)), 'a tech picks a Figure 8 and places the spa');
select throws_ok(format($$ update property set diagram_shape = 'star' where id = %L $$,
  (select prop_a from ids)), '23514', null, 'an unknown shape is refused');
select lives_ok(format($$ update job set diagram_markup =
  '{"version": 1, "shapes": [{"type": "pen", "color": "red", "points": [[0.1, 0.1], [0.2, 0.3]]}]}'
  where id = %L $$, (select job_a from ids)), 'a tech marks up the job''s diagram');
reset role;
select is(app.report_snapshot((select job_a from ids)) #>> '{property,diagram_layout,spa,size}',
  'large', 'reports carry the spa''s place');
select is(app.report_snapshot((select job_a from ids)) #>> '{job,diagram_markup,shapes,0,type}',
  'pen', 'reports carry the diagram markup');
select is(app.report_snapshot((select job_a from ids)) #>> '{property,diagram_shape}',
  'figure_eight', 'reports keep the shape');

-- When They Call: owners pick which price book items show; techs can't
select tests.authenticate_as((select owner_a from ids));
select is(tests.rows_affected(format($$ update price_book_item set on_repair_call = true
  where company_id = %L and name = 'Salt cell clean' $$, (select ca from ids))) > 0, true,
  'an owner puts an item on the When They Call menu');
reset role;
select tests.authenticate_as((select tech_a from ids));
select is(tests.rows_affected(format($$ update price_book_item set on_repair_call = false
  where company_id = %L $$, (select ca from ids))), 0::bigint,
  'a tech cannot change the menu');
reset role;

-- Feature requests: only the server
select tests.authenticate_as((select owner_a from ids));
select throws_ok($$ insert into feature_request (request) values ('More colors') $$,
  '42501', null, 'signed-in people cannot write feature requests directly');
select throws_ok($$ select count(*) from feature_request $$,
  '42501', null, 'signed-in people cannot read feature requests');
reset role;
select lives_ok(format($$ insert into feature_request (user_id, company_ref, request)
  values (%L, %L, 'Route by zip code') $$, (select owner_a from ids), (select ca from ids)),
  'the server saves a request');
select throws_ok($$ insert into feature_request (request) values ('   ') $$,
  '23514', null, 'an empty request is refused');

select * from finish();
rollback;
