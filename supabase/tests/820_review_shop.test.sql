-- The App Review shop switch (owner, 2026-10-24): company.review_shop is off for every shop,
-- and only the service role turns it on. Owners can read it but never set it, directly or
-- through sync_push.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('review') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select (a ->> 'company')::uuid as co, (a ->> 'owner')::uuid as owner,
  (a ->> 'tech')::uuid as tech from fx;
grant select on ids to authenticated, anon, service_role;

select col_not_null('public', 'company', 'review_shop', 'review_shop is never null');
select col_default_is('public', 'company', 'review_shop', 'false', 'and is off by default');
select is((select review_shop from company where id = (select co from ids)), false,
  'a new shop is not the review shop');

-- The owner reads it, and can't turn it on.
select tests.authenticate_as((select owner from ids));
select is((select review_shop from company where id = (select co from ids)), false,
  'the owner can read it');
select throws_ok(format($$ update company set review_shop = true where id = %L $$, (select co from ids)),
  '42501', null, 'the owner cannot turn it on');
select throws_ok(format($$ update company set review_shop = false where id = %L $$, (select co from ids)),
  '42501', null, 'or off');
-- Through the phones' sync: the change is refused, never applied.
select isnt(
  sync_push(jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'table', 'company', 'row_id', (select co from ids),
    'company_id', (select co from ids),
    'fields', jsonb_build_object('review_shop',
      jsonb_build_object('v', true, 'hlc', '1700000000000-0000-devA'))))
  , 'devA') -> 'results' -> 0 ->> 'status',
  'applied', 'sync_push cannot set it');
reset role;
select is((select review_shop from company where id = (select co from ids)), false,
  'still off after the owner tried');

select tests.authenticate_as((select tech from ids));
select throws_ok(format($$ update company set review_shop = true where id = %L $$, (select co from ids)),
  '42501', null, 'a tech cannot either');
reset role;

-- Nobody signed in gets anything.
set local role anon;
select throws_ok(format($$ update company set review_shop = true where id = %L $$, (select co from ids)),
  '42501', null, 'anonymous visitors cannot');
reset role;

-- The service role (the review-account script, the website's server) can.
set local role service_role;
update company set review_shop = true where id = (select co from ids);
select is((select review_shop from company where id = (select co from ids)), true,
  'the service role turns it on');
reset role;

select * from finish();
rollback;
