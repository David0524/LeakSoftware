-- Admin portal (owner, 2026-11-16): internal shops and people are left out of the portal's
-- counts; company costs are the server's only.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b,
  tests.create_user('staff-login@sundeck.test') as staff;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (b ->> 'company')::uuid as cb, (b ->> 'owner')::uuid as owner_b, staff
  from fx;
grant select on fx, ids to service_role;

set local role service_role;
create temp table before_marks as
  select (admin_metrics() ->> 'people_total')::int as people,
         jsonb_array_length(admin_shops()) as shops;
reset role;

insert into admin_internal (company_ref, staff_email) select ca, 'x@sundeck.test' from ids;
insert into admin_internal (user_ref, staff_email) select staff, 'x@sundeck.test' from ids;

select is(app.internal_shop((select ca from ids)), true, 'a marked shop is internal');
select is(app.internal_shop((select cb from ids)), false, 'others are not');
select is(app.internal_person((select tech_a from ids)), true,
  'someone whose only shop is internal is internal');
select is(app.internal_person((select owner_b from ids)), false, 'a real shop''s owner is not');
select is(app.internal_person((select staff from ids)), true, 'a marked account is internal');

set local role service_role;
select is((admin_metrics() ->> 'people_total')::int,
  (select people from before_marks) - 4,
  'people counts leave out the internal shop''s three people and the staff login');
select is(jsonb_array_length(admin_shops()), (select shops from before_marks),
  'the shop list still has every shop, flagged');
select is((select (r ->> 'internal')::boolean from jsonb_array_elements(admin_shops()) r
           where (r ->> 'id')::uuid = (select ca from ids)), true, 'with internal on the marked one');
select is((admin_person((select tech_a from ids)) ->> 'internal')::boolean, true,
  'a person''s page says internal');
reset role;

-- A marked shop or person can't be marked twice, and the mark goes with the shop.
select throws_ok(format($$ insert into admin_internal (company_ref, staff_email) values (%L, 'x') $$,
  (select ca from ids)), '23505', null, 'one mark per shop');
select throws_ok($$ insert into admin_internal (staff_email) values ('x') $$, '23514', null,
  'a mark is for a shop or a person');

-- Company costs: the server's only.
set local role authenticated;
select throws_ok($$ select * from company_cost $$, '42501', null, 'signed-in people can''t read costs');
select throws_ok($$ select * from admin_internal $$, '42501', null, 'or the internal list');
reset role;
set local role service_role;
select lives_ok($$ insert into company_cost (name, amount_cents, paid_by, created_by)
  values ('Business cards', 4500, 'cole', 'x@sundeck.test') $$, 'the server adds an expense');
select throws_ok($$ insert into company_cost (name, amount_cents, paid_by, created_by)
  values ('Lunch', 1200, 'someone', 'x') $$, '23514', null, 'paid by David, Cole or the company');
select throws_ok($$ insert into company_cost (name, repeats, created_by) values ('x', 'once', 'x') $$,
  '23514', null, 'an expense has an amount');
select lives_ok($$ insert into company_cost (name, repeats, created_by) values ('New tool', 'monthly', 'x') $$,
  'a service can wait for its price');
select ok((select count(*) from company_cost where created_by = 'setup') >= 10,
  'the services we use are listed');
reset role;

select * from finish();
rollback;
