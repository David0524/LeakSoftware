-- Routes that follow the roads (owner, 2026-10-23): each leg's road path saved once per shop and
-- provider, written only through save_route_legs, read by the shop's members.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a,
  (b ->> 'company')::uuid as cb from fx;
grant select on ids to authenticated;

select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$select save_route_legs(%L, 'apple', '[
  {"from": "33.4000,-111.9000", "to": "33.4100,-111.9100", "polyline": "abc"},
  {"from": "33.4100,-111.9100", "to": "33.4000,-111.9000", "polyline": null}
]')$$, (select ca from ids)), 'a tech saves the legs the server fetched');
select is((select count(*)::int from route_leg where provider = 'apple'
  and from_key in ('33.4000,-111.9000', '33.4100,-111.9100')), 2, 'and reads them back');
select is((select polyline from route_leg where from_key = '33.4100,-111.9100'
  and to_key = '33.4000,-111.9000'), null, 'no road route is saved as null');

select lives_ok(format($$select save_route_legs(%L, 'apple', '[
  {"from": "33.4000,-111.9000", "to": "33.4100,-111.9100", "polyline": "xyz"}]')$$,
  (select ca from ids)), 'saving a leg again replaces it');
select is((select polyline from route_leg where from_key = '33.4000,-111.9000'
  and to_key = '33.4100,-111.9100' and provider = 'apple'), 'xyz', 'with the new path');
select is((select count(*)::int from route_leg where from_key = '33.4000,-111.9000'
  and to_key = '33.4100,-111.9100'), 1, 'still one row');

select lives_ok(format($$select save_route_legs(%L, 'mapbox', '[
  {"from": "33.4000,-111.9000", "to": "33.4100,-111.9100", "polyline": "mbx"}]')$$,
  (select ca from ids)), 'the same leg from another provider');
select is((select count(*)::int from route_leg where from_key = '33.4000,-111.9000'
  and to_key = '33.4100,-111.9100'), 2, 'is its own row');

select throws_ok(format($$select save_route_legs(%L, 'apple', '[
  {"from": "33.4,-111.9", "to": "33.4100,-111.9100", "polyline": "abc"}]')$$,
  (select ca from ids)), '23514', null, 'keys must be pointKey (4 decimals)');
select throws_ok(format($$select save_route_legs(%L, 'google', '[
  {"from": "33.4000,-111.9000", "to": "33.4100,-111.9100", "polyline": "abc"}]')$$,
  (select ca from ids)), '23514', null, 'only Apple and Mapbox');
select throws_ok(format($$select save_route_legs(%L, 'apple', '{}')$$, (select ca from ids)),
  '22023', null, 'rows must be a list');
select throws_ok(format($$select save_route_legs(%L, 'apple', '[]')$$, (select cb from ids)),
  '42501', null, 'never for another shop');
select throws_ok(format(
  $$insert into route_leg (company_id, provider, from_key, to_key) values (%L, 'apple',
    '33.5000,-111.9000', '33.6000,-111.9000')$$, (select ca from ids)),
  '42501', null, 'nobody writes the table directly');

-- New legs a day have their own allowance, apart from drive times and maps.
select is(routing_use((select ca from ids), 'directions', 3, 3), true, 'legs within the day');
select is(routing_use((select ca from ids), 'directions', 1, 3), false, 'then no more legs');
select is(routing_use((select ca from ids), 'matrix', 1, 3), true, 'drive times unaffected');
select is(routing_use((select ca from ids), 'map', 1, 3), true, 'map images unaffected');
reset role;

select is((select monthly_limit from app.mapbox_budget where api = 'directions'), 90000,
  'about 90% of Mapbox Directions'' free tier');

select * from finish();
rollback;
