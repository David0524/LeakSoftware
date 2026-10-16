-- Demo codes (owner, 2026-10-16: "Add a demo code - make it VIP26"). On the payment step at
-- the end of onboarding, an owner can enter a code instead of a card. A valid code makes the
-- shop a demo shop, like the built-in demo: no card, no charge, no trial end, everything
-- works. Codes are rows here (config, not code); turning one off stops new shops using it
-- and leaves shops that already did as they are. subscription.access_code records which code
-- a shop used.

create table app.access_code (
  code text primary key check (code = upper(code) and length(code) between 3 and 40),
  plan text not null default 'demo',
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

insert into app.access_code (code, note) values
  ('VIP26', 'Demos and partners, launch 2026');

alter table public.subscription add column access_code text;

-- The subscription row is the lock itself, written only by the server and by billing
-- functions (owners have no write access to it), so the read-only guard doesn't belong on
-- it: it would stop a code (or anything else) from ever unlocking a shop.
drop trigger if exists guard_writable on public.subscription;

-- Owners redeem a code for their shop. Wrong codes are refused with one message whatever
-- the reason (unknown or turned off).
create or replace function public.redeem_access_code(target_company uuid, code text)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c app.access_code;
begin
  if not app.is_owner(target_company) then
    raise exception 'Only the shop''s owner can use a code' using errcode = 'insufficient_privilege';
  end if;
  select * into c from app.access_code a where a.code = upper(trim(redeem_access_code.code));
  if c.code is null or not c.active then
    raise exception 'That code isn''t valid.' using errcode = 'invalid_parameter_value';
  end if;
  update public.subscription
  set plan = c.plan, status = 'active', card_required = false, access_code = c.code,
      updated_at = now()
  where company_id = target_company;
end
$$;
revoke all on function public.redeem_access_code(uuid, text) from public, anon;
grant execute on function public.redeem_access_code(uuid, text) to authenticated;
