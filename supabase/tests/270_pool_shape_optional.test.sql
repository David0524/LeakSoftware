-- A pool can be saved without a shape and get one later.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
create temp table p (id uuid);
with x as (
  insert into property (company_id, customer_id, address_line1)
  select (a ->> 'company')::uuid, (a ->> 'customer')::uuid, '1 Blank Shape Way' from fx
  returning id)
insert into p select id from x;

select is((select diagram_shape from property where id = (select id from p)), null,
  'a new pool has no shape until one is picked');
update property set diagram_shape = 'kidney' where id = (select id from p);
select is((select diagram_shape from property where id = (select id from p)), 'kidney',
  'and gets one later');
select throws_ok($$ update property set diagram_shape = 'triangle' where id = (select id from p) $$, '23514', null,
  'only the known shapes');

select * from finish();
rollback;
