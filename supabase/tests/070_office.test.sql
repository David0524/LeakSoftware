-- Office web app: invite lookups, revoking invites, and keeping an owner.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a
  from fx;
grant select on ids to authenticated, anon;
create temp table inv as
  select id, token from invite where company_id = (select ca from ids) limit 1;
grant select on inv to authenticated, anon;

-- Signed out, an open invite shows its company, email, and role; nothing else.
set local role anon;
select is((select company_name from invite_details((select token from inv))), 'Company a',
  'anon sees the company of an open invite');
select is((select count(*) from invite_details('not-a-token')), 0::bigint,
  'unknown token shows nothing');
select throws_ok($$ select * from invite $$, '42501', null, 'anon still cannot read invites');
reset role;

-- Techs cannot revoke; owners can, and a revoked invite no longer shows.
select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select revoke_invite((select id from inv)) $$, '42501', null,
  'tech cannot revoke an invite');
reset role;
select tests.authenticate_as((select owner_a from ids));
select lives_ok($$ select revoke_invite((select id from inv)) $$, 'owner revokes an invite');
select is((select count(*) from invite_details((select token from inv))), 0::bigint,
  'revoked invite shows nothing');

-- The last owner cannot be demoted or disabled; with a second owner they can.
select throws_ok($$
  update membership set role = 'tech' where user_id = (select owner_a from ids)
$$, '23514', null, 'the only owner cannot become a tech');
select throws_ok($$
  update membership set status = 'disabled' where user_id = (select owner_a from ids)
$$, '23514', null, 'the only owner cannot be disabled');
select lives_ok($$
  update membership set role = 'owner' where user_id = (select tech_a from ids)
$$, 'owner promotes the tech');
select lives_ok($$
  update membership set role = 'tech' where user_id = (select owner_a from ids)
$$, 'with two owners, one can step down');

-- Owners still see the name of someone whose access is turned off; techs don't.
reset role;
update membership set role = 'owner' where user_id = (select owner_a from ids);
update membership set role = 'tech', status = 'disabled' where user_id = (select tech_a from ids);
select tests.authenticate_as((select owner_a from ids));
select is((select count(*) from profile where id = (select tech_a from ids)), 1::bigint,
  'owner sees a turned-off member''s profile');
reset role;
create temp table t2 as select tests.create_user('second-tech@test.local') as id;
grant select on t2 to authenticated;
insert into membership (company_id, user_id, role)
  values ((select ca from ids), (select id from t2), 'tech');
select tests.authenticate_as((select id from t2));
select is((select count(*) from profile where id = (select tech_a from ids)), 0::bigint,
  'a tech does not see a turned-off member''s profile');

select * from finish();
rollback;
