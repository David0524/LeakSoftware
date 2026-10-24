-- When an account agreed to the Terms and Privacy Policy (owner, 2026-10-24, for the App Store
-- launch). Every sign-up says "By creating an account, you agree to the Terms and Privacy
-- Policy." under its create button: the website's Start Free Trial and Join Your Team, and
-- Create an Account in the iPhone and Android apps (through POST /api/auth/sign-up).
--
--   profile.accepted_terms_at   set when the account is made, by the database's own clock, when
--                               the sign-up's details carry accepted_terms: true (the website's
--                               server adds it for the forms that show the line). Null for
--                               accounts made before, or without the line (older app builds,
--                               the review and demo scripts).
--
-- Members can't write it: profile's client-writable columns stay full_name and phone
-- (20261012000600_access.sql). A later sign-up of the same address doesn't make a new account,
-- so it never moves.

alter table public.profile add column accepted_terms_at timestamptz;

-- As 20261012000100_foundation.sql, with the time the terms were accepted.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profile (id, email, full_name, accepted_terms_at)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''),
          case when new.raw_user_meta_data ->> 'accepted_terms' = 'true' then now() end)
  on conflict (id) do nothing;
  return new;
end
$$;
