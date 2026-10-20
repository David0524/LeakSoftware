-- Row security looks up the caller's companies once per query, not once per row.
begin;
set search_path = public, extensions;
select no_plan();

select is(
  (select count(*)::int
   from pg_policy pol
   join pg_class c on c.oid = pol.polrelid
   join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and app.fast_check(coalesce(pg_get_expr(pol.polqual, pol.polrelid, true), '') || ' '
           || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid, true), ''))
         is distinct from
         (coalesce(pg_get_expr(pol.polqual, pol.polrelid, true), '') || ' '
           || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid, true), ''))),
  0,
  'no policy calls a membership check per row (run select app.speed_up_policies() after adding policies)');

-- Same answers as before for an owner, a tech, and someone from another shop.
create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;

select tests.authenticate_as((select (a ->> 'owner')::uuid from fx));
select ok((select (a ->> 'company')::uuid from fx) = any (app.member_companies()), 'an owner is a member');
select ok((select (a ->> 'company')::uuid from fx) = any (app.owner_companies()), 'and an owner');
select ok((select (a ->> 'company')::uuid from fx) = any (app.all_jobs_companies()), 'and sees every job');
select ok(not ((select (b ->> 'company')::uuid from fx) = any (app.member_companies())), 'but not of another shop');

reset role;
select tests.authenticate_as((select (a ->> 'tech')::uuid from fx));
select ok((select (a ->> 'company')::uuid from fx) = any (app.member_companies()), 'a tech is a member');
select ok(not ((select (a ->> 'company')::uuid from fx) = any (app.owner_companies())), 'not an owner');
select ok(not ((select (a ->> 'company')::uuid from fx) = any (app.all_jobs_companies())),
  'and in a new shop sees only their own jobs');

reset role;
select ok(exists (select 1 from pg_constraint
                 where conrelid = 'public.membership'::regclass
                   and confrelid = 'public.profile'::regclass and contype = 'f'),
  'a membership points at its profile, so the team loads with names in one query');

select * from finish();
rollback;
