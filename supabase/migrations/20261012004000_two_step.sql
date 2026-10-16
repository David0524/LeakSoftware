-- Two-step sign-in (owner, 2026-10-16: "How do we protect customer data"). A person can turn
-- on an authenticator-app code (Supabase TOTP) on the website (More › Two-Step Sign-In).
-- From then on their password alone opens nothing: until the session has passed the code
-- step (the token's `aal` is aal2), every membership check says no, so no shop data can be
-- read or changed through the website, the app, or the API directly.
--
-- profile.two_step is set by the server after the code is checked and cleared when the person
-- turns it off (both need a session that passed the code step). People can't change it
-- themselves: only full_name and phone are writable.

alter table public.profile add column two_step boolean not null default false;

create or replace function app.two_step_ok() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not coalesce((select p.two_step from public.profile p where p.id = auth.uid()), false)
$$;
revoke all on function app.two_step_ok() from public;
grant execute on function app.two_step_ok() to authenticated, service_role;

create or replace function app.is_member(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.membership
    where company_id = target_company
      and user_id = auth.uid()
      and status = 'active'
      and deleted_at is null
  ) and app.two_step_ok()
$$;

create or replace function app.is_owner(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.membership
    where company_id = target_company
      and user_id = auth.uid()
      and role = 'owner'
      and status = 'active'
      and deleted_at is null
  ) and app.two_step_ok()
$$;

create or replace function app.shares_company(other_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.membership mine
    join public.membership theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.status = 'active' and mine.deleted_at is null
      and theirs.user_id = other_user and theirs.status = 'active' and theirs.deleted_at is null
  ) and app.two_step_ok()
$$;

create or replace function app.member_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.two_step_ok() then
    (select coalesce(array_agg(company_id), '{}') from public.membership
     where user_id = auth.uid() and status = 'active' and deleted_at is null)
  else '{}'::uuid[] end
$$;

create or replace function app.owner_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.two_step_ok() then
    (select coalesce(array_agg(company_id), '{}') from public.membership
     where user_id = auth.uid() and role = 'owner' and status = 'active' and deleted_at is null)
  else '{}'::uuid[] end
$$;

create or replace function app.all_jobs_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.two_step_ok() then
    (select coalesce(array_agg(m.company_id), '{}')
     from public.membership m join public.company c on c.id = m.company_id
     where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
       and (m.role = 'owner' or coalesce((c.settings ->> 'techs_see_all_jobs')::boolean, true)))
  else '{}'::uuid[] end
$$;

create or replace function app.owns_member(other_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.membership mine
    join public.membership theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.role = 'owner' and mine.status = 'active'
      and mine.deleted_at is null and theirs.user_id = other_user
  ) and app.two_step_ok()
$$;

-- The server: whether a person has two-step sign-in on (the website asks for the code
-- before anything else when they do).
create or replace function public.set_two_step(target_user uuid, enabled boolean) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.profile set two_step = enabled, updated_at = now() where id = target_user
$$;
revoke all on function public.set_two_step(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_two_step(uuid, boolean) to service_role;
