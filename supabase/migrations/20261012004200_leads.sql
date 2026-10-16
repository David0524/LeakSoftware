-- Leads (owner, 2026-10-16: "If someone puts their name/email in and doesn't pay, I want that
-- information, so we can call them"). Tidemark's own sales list, not a shop's data: no
-- company_id, nobody signed in can read or write it, only the server (service role).
--
-- A row is saved as soon as someone types a valid email on the sign-up form (with whatever
-- name, company, and phone they've typed), before they finish; signing up links it to the
-- account. Staff see it at /admin/leads with how far each person got and whether they paid.

create table public.signup_lead (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased; one row per email.
  email text not null unique check (email = lower(email) and position('@' in email) > 1),
  name text,
  company_name text,
  phone text,
  services text,
  user_id uuid references auth.users (id) on delete set null,
  -- Staff notes for the follow-up call.
  contacted_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.signup_lead enable row level security;
revoke all on public.signup_lead from public, anon, authenticated;

-- Everyone who signed up before this: from their accounts.
insert into public.signup_lead (email, name, company_name, services, user_id, created_at)
select lower(u.email), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'company_name',
       u.raw_user_meta_data ->> 'services', u.id, u.created_at
from auth.users u
where u.email is not null and u.raw_user_meta_data ? 'company_name'
on conflict (email) do nothing;

-- Staff (the server, after checking the person is Tidemark staff): every lead with how far
-- they got. Paid means a card is in (a Stripe subscription) or a demo code was used.
create or replace function public.lead_list() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) from (
    select l.id, l.email, l.name, l.company_name, l.phone, l.services, l.notes,
           l.created_at, l.updated_at, l.contacted_at, l.user_id,
           u.email_confirmed_at,
           co.id as company_id, co.name as company,
           s.status, s.plan, s.access_code, s.trial_ends_at, s.onboarded_at,
           s.stripe_subscription_id is not null as card_in,
           s.onboarding is not null as reached_payment,
           (s.onboarding ->> 'people')::int as people,
           s.onboarding ->> 'goal' as goal
    from public.signup_lead l
    left join auth.users u on u.id = l.user_id
    left join lateral (
      select m.company_id from public.membership m
      where m.user_id = l.user_id and m.role = 'owner' and m.deleted_at is null
      order by m.company_id limit 1
    ) m on true
    left join public.company co on co.id = m.company_id
    left join public.subscription s on s.company_id = co.id
  ) x
$$;
revoke all on function public.lead_list() from public, anon, authenticated;
grant execute on function public.lead_list() to service_role;
