-- Checks the test harness itself: pgTAP loads and auth.uid() reads the JWT claims
-- the same way under the shim and under real Supabase.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(3);

select is(auth.uid(), null, 'no user without claims');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000a1', 'role', 'authenticated')::text,
  true
);
select is(auth.uid(), '00000000-0000-0000-0000-0000000000a1'::uuid, 'auth.uid() reads sub claim');
select has_schema('storage', 'storage schema exists');

select * from finish();
rollback;
