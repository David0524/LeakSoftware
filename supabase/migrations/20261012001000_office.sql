-- Office web app (M6): invite page lookups and invite revocation.

-- What the invite page shows before the invitee signs in. Only an open invite's company
-- name, email, and role; nothing for an unknown, used, revoked, or expired token.
create or replace function public.invite_details(invite_token text)
returns table (company_name text, email text, role text)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.name, i.email, i.role
  from public.invite i
  join public.company c on c.id = i.company_id
  where i.token = invite_token
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;

create or replace function public.revoke_invite(invite_id uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  target uuid;
begin
  select company_id into target from public.invite where id = invite_id;
  if target is null or not app.is_owner(target) then
    raise exception 'Only owners can revoke invites' using errcode = 'insufficient_privilege';
  end if;
  update public.invite set revoked_at = now()
  where id = invite_id and accepted_at is null and revoked_at is null;
end
$$;

revoke all on function public.invite_details(text), public.revoke_invite(uuid) from public;
grant execute on function public.invite_details(text) to anon, authenticated;
grant execute on function public.revoke_invite(uuid) to authenticated;

-- A company always keeps at least one active owner.
create or replace function app.keep_an_owner() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.role = 'owner' and old.status = 'active' and old.deleted_at is null
     and (new.role <> 'owner' or new.status <> 'active' or new.deleted_at is not null)
     and not exists (
       select 1 from public.membership m
       where m.company_id = old.company_id and m.id <> old.id
         and m.role = 'owner' and m.status = 'active' and m.deleted_at is null) then
    raise exception 'A company needs at least one owner' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger keep_an_owner before update on public.membership
  for each row execute function app.keep_an_owner();
