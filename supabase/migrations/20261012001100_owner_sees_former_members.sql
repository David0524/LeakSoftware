-- 1. Owners can read the profile (name, email) of anyone with a membership in a company they
--    own, including people whose access is turned off, so the Team page can name them.
-- 2. Drop app.keep_an_owner from 20261012001000: app.protect_last_owner (foundation) already
--    enforces the same rule.

create or replace function app.owns_member(other_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.membership mine
    join public.membership theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.role = 'owner' and mine.status = 'active'
      and mine.deleted_at is null and theirs.user_id = other_user
  )
$$;
revoke all on function app.owns_member(uuid) from public;
grant execute on function app.owns_member(uuid) to authenticated;

drop policy if exists profile_select on public.profile;
create policy profile_select on public.profile for select to authenticated
  using (id = auth.uid() or app.shares_company(id) or app.owns_member(id));

drop trigger if exists keep_an_owner on public.membership;
drop function if exists app.keep_an_owner();
