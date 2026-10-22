-- Password reset (owner, 2026-10-22: "Add a password reset feature for our users"). The
-- server makes the reset link (Supabase's recovery token) and emails it itself, so the same
-- link works whichever app or browser asked. This keeps an address from being sent more than 3
-- reset emails an hour, whoever asks for them. Only the server calls it.

create table app.password_reset_request (
  id bigint generated always as identity primary key,
  -- Lowercased.
  email text not null check (email = lower(email)),
  requested_at timestamptz not null default now()
);
alter table app.password_reset_request enable row level security;
create index password_reset_request_email_idx on app.password_reset_request (email, requested_at desc);

-- True (and counted) when this address may be sent another reset email now. Rows older than a
-- day are cleared as it goes.
create or replace function public.take_password_reset(target_email text) returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  addr text := lower(trim(target_email));
begin
  delete from app.password_reset_request where requested_at < now() - interval '1 day';
  if (select count(*) from app.password_reset_request
      where email = addr and requested_at > now() - interval '1 hour') >= 3 then
    return false;
  end if;
  insert into app.password_reset_request (email) values (addr);
  return true;
end
$$;
revoke all on function public.take_password_reset(text) from public, anon, authenticated;
grant execute on function public.take_password_reset(text) to service_role;
