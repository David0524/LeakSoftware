-- The Admin role (owner, 2026-10-18): office staff who can do what owners could, except the
-- owner-only items: Sundeck Pro billing, payments setup, deleting the shop, roles, turning an
-- owner off, and the shop's security settings. A shop never loses its last active owner.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'admin')::uuid as admin_a,
  (a ->> 'tech')::uuid as tech_a, (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a,
  (b ->> 'company')::uuid as cb
  from fx;
grant select on ids to authenticated;

create function pg_temp.member(who uuid) returns uuid language sql as $$
  select id from membership where user_id = who and company_id = (select ca from ids)
$$;
grant execute on function pg_temp.member(uuid) to authenticated;

select tests.authenticate_as((select admin_a from ids));
select is(app.is_manager((select ca from ids)), true, 'an admin is a manager');
select is(app.is_owner((select ca from ids)), false, 'but not an owner');
select is(app.is_manager((select cb from ids)), false, 'and only in their own shop');

-- Manager actions.
select is(tests.rows_affected(format(
  $$update price_book_item set price_cents = price_cents + 100 where company_id = %L$$,
  (select ca from ids))) > 0, true, 'admins edit the price book');
select is(tests.rows_affected(format(
  $$update company set settings = settings || '{"tax_rate_bps": 825}' where id = %L$$,
  (select ca from ids))), 1::bigint, 'and other company settings');
select lives_ok(format($$ select create_monthly_invoices(%L, current_date) $$, (select ca from ids)),
  'admins bill maintenance');
select lives_ok(format($$ select create_service_plan(%L, null, %L, null, %L,
    jsonb_build_object('starts_on', current_date, 'paused', true)) $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)),
  'admins start maintenance plans');
select lives_ok(format($$ select owner_dashboard(%L, 6) $$, (select ca from ids)),
  'admins see the dashboard');
select lives_ok(format($$ select create_invite(%L, 'new-tech@test.local', 'tech') $$, (select ca from ids)),
  'admins invite techs');
select is(tests.rows_affected(format($$update membership set status = 'disabled' where id = %L$$,
  pg_temp.member((select tech_a from ids)))), 1::bigint, 'and turn a tech off');
select is(tests.rows_affected(format($$update membership set status = 'active' where id = %L$$,
  pg_temp.member((select tech_a from ids)))), 1::bigint, 'and back on');

-- Owner-only.
select throws_ok(format($$ select create_invite(%L, 'new-admin@test.local', 'admin') $$, (select ca from ids)),
  '42501', null, 'admins can''t invite admins');
select throws_ok(format($$ select create_invite(%L, 'new-owner@test.local', 'owner') $$, (select ca from ids)),
  '42501', null, 'or owners');
select throws_ok(format($$ update membership set role = 'admin' where id = %L $$,
  pg_temp.member((select tech_a from ids))), '42501', null, 'admins can''t make someone an admin');
select throws_ok(format($$ update membership set role = 'tech' where id = %L $$,
  pg_temp.member((select admin_a from ids))), '42501', null, 'or change an admin''s role');
select throws_ok(format($$ update membership set status = 'disabled' where id = %L $$,
  pg_temp.member((select owner_a from ids))), '42501', null, 'or turn an owner off');
select throws_ok(format($$ update company set settings = settings || '{"techs_see_all_jobs": true}' where id = %L $$,
  (select ca from ids)), '42501', null, 'or change what techs may see');
select throws_ok(format($$ update company set settings = settings || '{"techs_make_jobs": false}' where id = %L $$,
  (select ca from ids)), '42501', null, 'or whether techs make jobs');
select throws_ok(format($$ select redeem_access_code(%L, 'VIP26') $$, (select ca from ids)),
  '42501', null, 'or use a Sundeck Pro billing code');
-- Billing and payments setup are server-side (service role) and the website checks the owner;
-- an admin can read their state but never write it.
select throws_ok(format($$ update subscription set plan = 'demo' where company_id = %L $$,
  (select ca from ids)), '42501', null, 'admins can''t change the subscription');
select throws_ok(format($$ insert into stripe_account (company_id, stripe_account_id) values (%L, 'acct_admin') $$,
  (select ca from ids)), '42501', null, 'or connect a Stripe account');
reset role;

-- Owners can do the owner-only items.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ update membership set role = 'admin' where id = %L $$,
  pg_temp.member((select tech_a from ids))), 'owners make someone an admin');
select lives_ok(format($$ update membership set role = 'tech' where id = %L $$,
  pg_temp.member((select tech_a from ids))), 'and change it back');
select lives_ok(format($$ select create_invite(%L, 'second-owner@test.local', 'owner') $$, (select ca from ids)),
  'owners invite owners');
select lives_ok(format($$ update company set settings = settings || '{"techs_make_jobs": true}' where id = %L $$,
  (select ca from ids)), 'owners change security settings');

-- The last owner stays.
select throws_ok(format($$ update membership set role = 'admin' where id = %L $$,
  pg_temp.member((select owner_a from ids))), '23514', null, 'the last owner can''t be made an admin');
select throws_ok(format($$ update membership set status = 'disabled' where id = %L $$,
  pg_temp.member((select owner_a from ids))), '23514', null, 'or turned off');
reset role;

-- With a second owner, the first can step down to admin.
update membership set role = 'owner' where id = pg_temp.member((select admin_a from ids));
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ update membership set role = 'admin' where id = %L $$,
  pg_temp.member((select owner_a from ids))), 'with another owner, an owner can become an admin');
reset role;

select * from finish();
rollback;
