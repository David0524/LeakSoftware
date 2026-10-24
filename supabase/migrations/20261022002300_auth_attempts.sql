-- Limits on repeated sign-in attempts and auth emails (security review M3, 2026-10-25;
-- docs/security/2026-10-25-overnight-review.md). The website reaches Supabase from Vercel's
-- addresses, so Supabase's own per-IP limits can't tell one visitor from another: the server
-- keeps its own count here, by email and by the visitor's address.
--
-- Not a company table: an attempt belongs to no shop (most come before anyone is signed in),
-- so it has no company_id, isn't synced, and isn't in app.sync_table. It lives in the private
-- `app` schema with row security on, no policies and no grants: nobody reaches it through the
-- API. Only the two functions below touch it, and only the server (service key) may call them.
--
-- Kinds and limits, per window:
--   sign_in, two_step  failures: 10 per email, 20 per address, in 15 minutes
--   sign_up, link, reset  emails sent: 5 per email, 20 per address, in an hour
-- `link` is a sign-in link or a new confirmation link.

create table app.auth_attempt (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('sign_in', 'two_step', 'sign_up', 'link', 'reset')),
  -- Lowercased; null when only the address is known.
  email text check (email = lower(email)),
  -- The visitor's address as the server saw it; null when unknown.
  ip text,
  at timestamptz not null default now()
);
alter table app.auth_attempt enable row level security;
revoke all on app.auth_attempt from public, anon, authenticated;
create index auth_attempt_email_idx on app.auth_attempt (kind, email, at desc);
create index auth_attempt_ip_idx on app.auth_attempt (kind, ip, at desc);

create or replace function app.auth_attempt_window(kind text) returns interval
language sql immutable as $$
  select case when kind in ('sign_in', 'two_step') then interval '15 minutes'
              else interval '1 hour' end
$$;

-- True when another attempt of this kind is allowed now for this email and address. With
-- `take`, an allowed attempt is also counted (an email about to be sent). Old rows are
-- cleared as it goes.
create or replace function public.auth_attempt_allowed(
  attempt_kind text, target_email text, client_ip text, take boolean default false)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  addr text := nullif(lower(trim(coalesce(target_email, ''))), '');
  ip_key text := nullif(trim(coalesce(client_ip, '')), '');
  since timestamptz := now() - app.auth_attempt_window(attempt_kind);
  per_email int := case when attempt_kind in ('sign_in', 'two_step') then 10 else 5 end;
  per_ip int := 20;
begin
  if attempt_kind not in ('sign_in', 'two_step', 'sign_up', 'link', 'reset') then
    raise exception 'Unknown attempt kind %', attempt_kind using errcode = 'invalid_parameter_value';
  end if;
  delete from app.auth_attempt where at < now() - interval '1 day';
  if addr is not null and (select count(*) from app.auth_attempt a
      where a.kind = attempt_kind and a.email = addr and a.at > since) >= per_email then
    return false;
  end if;
  if ip_key is not null and (select count(*) from app.auth_attempt a
      where a.kind = attempt_kind and a.ip = ip_key and a.at > since) >= per_ip then
    return false;
  end if;
  if take then
    insert into app.auth_attempt (kind, email, ip) values (attempt_kind, addr, ip_key);
  end if;
  return true;
end
$$;

-- Counts a failed attempt (a wrong password or two-step code).
create or replace function public.auth_attempt_failed(
  attempt_kind text, target_email text, client_ip text)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if attempt_kind not in ('sign_in', 'two_step') then
    raise exception 'Only sign-ins and codes fail' using errcode = 'invalid_parameter_value';
  end if;
  insert into app.auth_attempt (kind, email, ip)
  values (attempt_kind, nullif(lower(trim(coalesce(target_email, ''))), ''),
          nullif(trim(coalesce(client_ip, '')), ''));
end
$$;

revoke all on function public.auth_attempt_allowed(text, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.auth_attempt_failed(text, text, text) from public, anon, authenticated;
revoke all on function app.auth_attempt_window(text) from public, anon, authenticated;
grant execute on function public.auth_attempt_allowed(text, text, text, boolean) to service_role;
grant execute on function public.auth_attempt_failed(text, text, text) to service_role;

-- Whether an email has an account, and whether it's confirmed: 'none', 'unconfirmed' or
-- 'confirmed'. The server sends its own sign-in and confirmation emails (owner, 2026-10-24) and
-- asks first, since Supabase's link maker makes an account for an unknown address. Callers
-- answer the same whatever it says, so nobody learns which addresses have accounts.
create or replace function public.auth_email_status(target_email text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select case when u.email_confirmed_at is null then 'unconfirmed' else 'confirmed' end
     from auth.users u where lower(u.email) = lower(trim(target_email))
     order by u.email_confirmed_at nulls last limit 1),
    'none')
$$;
revoke all on function public.auth_email_status(text) from public, anon, authenticated;
grant execute on function public.auth_email_status(text) to service_role;
