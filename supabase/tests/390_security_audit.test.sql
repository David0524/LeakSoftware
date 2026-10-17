-- Fixes from the security audit (2026-10-17): each block reproduces a confirmed finding and
-- checks it is closed.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'quote')::uuid as quote_a, (a ->> 'invoice')::uuid as inv_a,
  (b ->> 'company')::uuid as cb, (b ->> 'invoice')::uuid as inv_b
  from fx;
grant select on ids to authenticated, service_role;
grant select on fx to service_role;

-- Stripe: a payment taken on another shop's account is not recorded.
set local role service_role;
select is(stripe_record_invoice_payment((select inv_b from ids), 'cs_forged', null, 18500, 'card',
                                        'succeeded', 'acct_a') ->> 'payment',
  'ignored', 'a payment from another shop''s account is ignored');
select is(stripe_record_quote_payment((select quote_a from ids), 'cs_noacct', null, 100, 'card',
                                      'succeeded', null),
  'ignored', 'and so is one with no account');
select throws_ok(format($$ select stripe_record_invoice_payment(%L, 'cs_x', null, 1, 'card', 'succeeded') $$,
  (select inv_a from ids)), '42501', null, 'the server can''t record a payment without the account');
reset role;
select is((select count(*)::int from payment where stripe_checkout_session_id in ('cs_forged', 'cs_noacct')),
  0, 'nothing was written');

-- Demo codes: not for canceled shops, and capped.
update subscription set status = 'canceled' where company_id = (select ca from ids);
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select redeem_access_code(%L, 'VIP26') $$, (select ca from ids)),
  '22023', null, 'a canceled shop can''t unlock itself with a code');
reset role;
update subscription set status = 'trialing' where company_id = (select ca from ids);
update app.access_code set max_redemptions = 0 where code = 'VIP26';
select tests.authenticate_as((select owner_a from ids));
select throws_ok(format($$ select redeem_access_code(%L, 'VIP26') $$, (select ca from ids)),
  '22023', null, 'a code past its limit is refused');
reset role;
update app.access_code set max_redemptions = null where code = 'VIP26';
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ select redeem_access_code(%L, 'VIP26') $$, (select ca from ids)),
  'a new shop can still use a valid code');
reset role;

-- Sign-up: with billing on, a shop made by calling create_company directly needs a card.
set local role service_role;
select require_card_at_signup(true);
reset role;
select tests.authenticate_as(tests.create_user('direct@test.local'));
create temp table direct on commit drop as select create_company('Direct Pools', null, 'pool') as id;
reset role;
select is((select card_required from subscription where company_id = (select id from direct)),
  true, 'a direct create_company shop needs a card');
select is(app.company_locked((select id from direct)), true, 'and is read-only until it has one');

-- Routing allowance: the counter only goes up.
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select routing_use(%L, 'geocode', -1000000, 2147483647) $$, (select ca from ids)),
  '22023', null, 'a negative count is refused');
select is(routing_use((select ca from ids), 'geocode', 1, 300), true, 'a normal count works');
reset role;

-- Server allowances: counted, capped, and only the server can count.
set local role service_role;
select is(use_allowance((select ca from ids), 'email', 2, 2), true, 'within the allowance');
select is(use_allowance((select ca from ids), 'email', 1, 2), false, 'over it is refused');
reset role;
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select use_allowance(%L, 'email', 1, 1000) $$, (select ca from ids)),
  '42501', null, 'members can''t count allowances');
reset role;

-- Limited techs: no reaching into a hidden job through a second reference.
create temp table hidden on commit drop as select gen_random_uuid() as job, gen_random_uuid() as quote,
  gen_random_uuid() as finding, gen_random_uuid() as link;
grant select on hidden to authenticated;
insert into job (id, company_id, property_id, bill_to_customer_id, status, assigned_user_id)
  select h.job, i.ca, j.property_id, j.bill_to_customer_id, 'in_progress', i.owner_a
  from hidden h, ids i join job j on j.id = i.job_a;
insert into finding (id, company_id, job_id, title, severity_key, pin_x, pin_y)
  select finding, (select ca from ids), job, 'Hidden finding', 'major', 0.5, 0.5 from hidden;
insert into quote (id, company_id, job_id, total_cents) select quote, (select ca from ids), job, 1000 from hidden;
insert into quote_line_item (company_id, quote_id, finding_id, description, unit_price_cents)
  select (select ca from ids), quote, finding, 'Hidden repair', 1000 from hidden;
insert into share_link (id, company_id, job_id, quote_id)
  select link, (select ca from ids), job, quote from hidden;
update company set settings = settings || '{"techs_see_all_jobs": false}' where id = (select ca from ids);

select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ insert into signature (company_id, job_id, quote_id, purpose, signer_name, signed_at)
                          values (%L, %L, %L, 'quote_acceptance', 'Forged', now()) $$,
  (select ca from ids), (select job_a from ids), (select quote from hidden)),
  '23503', null, 'a signature on my job can''t point at a hidden job''s quote');
select throws_ok(format($$ insert into media (company_id, job_id, finding_id, kind, sha256)
                          values (%L, %L, %L, 'photo', repeat('b', 64)) $$,
  (select ca from ids), (select job_a from ids), (select finding from hidden)),
  '23503', null, 'nor a picture at a hidden finding');
select throws_ok(format($$ select turn_off_share_link(%L) $$, (select link from hidden)),
  'P0002', null, 'nor turn off a hidden job''s customer link');
reset role;
select is((select status from quote where id = (select quote from hidden)), 'draft',
  'the hidden quote was not accepted');

-- Phones: changing a job's pool or deleting it restarts limited techs' sync.
select tests.authenticate_as((select tech_a from ids));
create temp table scope1 on commit drop as select sync_scope() as s;
reset role;
update job set deleted_at = now() where id = (select job from hidden);
select tests.authenticate_as((select tech_a from ids));
select isnt(sync_scope(), (select s from scope1), 'deleting a job changes the phones'' scope');
reset role;

-- Text pictures follow conversation visibility.
insert into storage.objects (bucket_id, name, owner) values
  ('texts', (select ca from ids) || '/out/mine.jpg', (select tech_a from ids)),
  ('texts', (select ca from ids) || '/out/theirs.jpg', (select owner_a from ids));
update job set assigned_user_id = (select owner_a from ids) where id = (select job_a from ids);
select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from storage.objects
           where bucket_id = 'texts' and name like (select ca from ids) || '/%'),
  1, 'a limited tech sees only their own sent picture, not hidden conversations''');
reset role;

-- The locked shop's texting tables are read-only for members too.
update subscription set status = 'canceled', access_code = null where company_id = (select cb from ids);
select tests.authenticate_as(((select b from fx) ->> 'owner')::uuid);
select throws_ok(format($$ update conversation set unread = false where company_id = %L $$, (select cb from ids)),
  'TL423', null, 'a read-only shop can''t change its conversations');
reset role;

-- Opt-out links honor expiry.
update share_link set expires_at = now() - interval '1 day'
where company_id = (select cb from ids);
select is(opt_out_for_token((select token from share_link where company_id = (select cb from ids) limit 1)),
  null, 'an expired link can''t be used to opt out');

select * from finish();
rollback;
