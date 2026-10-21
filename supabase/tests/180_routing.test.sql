-- Routing (owner request, 2026-10-13): route order and fixed times on jobs, the shop's
-- coordinates (owners only), usage counted per shop with a daily cap, and drive times cached
-- per shop.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'property')::uuid as prop_a,
  (b ->> 'company')::uuid as cb, (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on ids to authenticated;

select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update job set route_order = 2, arrival_fixed = true where id = %L $$,
  (select job_a from ids)), 'techs set the route order and a fixed time');
select lives_ok(format($$ update property set latitude = 33.4488, longitude = -112.0771,
  location_source = 'gps', geocoded_address = '200 W Washington St' where id = %L $$,
  (select prop_a from ids)), 'techs save a pool''s location (for example from the phone''s GPS)');
select throws_ok(format($$ update property set location_source = 'guess' where id = %L $$,
  (select prop_a from ids)), '23514', null, 'only known location sources');
select results_eq(format($$ with u as (update company set latitude = 1 where id = %L returning 1)
                           select count(*)::int from u $$, (select ca from ids)),
  $$ values (0) $$, 'techs cannot move the shop');
reset role;

select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ update company set latitude = 33.44879, longitude = -112.07711,
  geocoded_address = '200 W Washington St, Phoenix, AZ 85003' where id = %L $$, (select ca from ids)),
  'owners set the shop''s location');

-- Usage: counted per shop per day, refused past the cap.
select is(routing_use((select ca from ids), 'matrix', 3, 5), true, 'calls within the daily cap');
select is(routing_use((select ca from ids), 'geocode', 2, 5), true, 'kinds share the cap');
select is(routing_use((select ca from ids), 'matrix', 1, 5), false, 'past the cap: use the estimate');
-- Address suggestions have their own allowance (2026-10-20): typing never uses up routes'.
select is(routing_use((select ca from ids), 'suggest', 4, 5), true, 'suggestions are counted apart');
select is(routing_use((select ca from ids), 'suggest', 2, 5), false, 'and stop at their own cap');
-- Map images too (2026-10-20): maps never use up routes' or suggestions' allowance.
select is(routing_use((select ca from ids), 'map', 5, 5), true, 'map images are counted apart');
select is(routing_use((select ca from ids), 'map', 1, 5), false, 'and stop at their own cap');
select throws_ok(format('select routing_use(%L, ''matrix'', 1, 5)', (select cb from ids)), '42501',
  null, 'only for your own shop');

-- Drive times: saved and read back per shop.
select lives_ok(format($$ select save_drive_times(%L, '[{"from": "33.4488,-112.0771", "to": "33.4496,-111.9464", "minutes": 18}]') $$,
  (select ca from ids)), 'drive times are saved');
select results_eq(format($$ select minutes from cached_drive_times(%L, array['33.4488,-112.0771'], array['33.4496,-111.9464']) $$,
  (select ca from ids)), $$ values (18) $$, 'and read back');
reset role;

select tests.authenticate_as((select tech_b from ids));
select throws_ok(format($$ select * from cached_drive_times(%L, array['33.4488,-112.0771'], array['33.4496,-111.9464']) $$,
  (select ca from ids)), '42501', null, 'another shop cannot read them');
reset role;

select * from finish();
rollback;
