-- Two-step sign-in (owner, 2026-10-16): with it on, a session that hasn't passed the code
-- step (aal1) sees and changes nothing in the shop; after the code (aal2), everything works.
-- People can't turn it off for themselves.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'job')::uuid as job_a
  from fx;
grant select on ids to authenticated, anon, service_role;

create or replace function pg_temp.as_owner(aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select owner_a from ids),
    'role', 'authenticated', 'aal', aal)::text, true);
  perform set_config('role', 'authenticated', true);
end
$$;

select pg_temp.as_owner('aal1');
select is((select count(*) from job where company_id = (select ca from ids)), 1::bigint,
  'without two-step, the password session works');
reset role;

select set_two_step((select owner_a from ids), true);

select pg_temp.as_owner('aal1');
select is((select count(*) from job where company_id = (select ca from ids)), 0::bigint,
  'with two-step on, the password alone shows no jobs');
select is((select count(*) from customer where company_id = (select ca from ids)), 0::bigint,
  'or customers');
select is(tests.rows_affected(format($$ update job set summary_notes = 'x' where id = %L $$, (select job_a from ids))),
  0::bigint, 'and changes nothing');
select is((select two_step from profile where id = auth.uid()), true,
  'the person can still read their own profile (to be sent to the code step)');
select throws_ok(format($$ select set_two_step(%L, false) $$, (select owner_a from ids)), '42501', null,
  'and can''t turn two-step off themselves');
select throws_ok($$ update profile set two_step = false where id = auth.uid() $$, '42501', null,
  'not even by writing their profile');
reset role;

select pg_temp.as_owner('aal2');
select is((select count(*) from job where company_id = (select ca from ids)), 1::bigint,
  'after the code, everything is there');
select is(tests.rows_affected(format($$ update job set summary_notes = 'x' where id = %L $$, (select job_a from ids))),
  1::bigint, 'and can be changed');
reset role;

select * from finish();
rollback;
