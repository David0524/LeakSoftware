-- Request a Feature (owner, 2026-10-19: "Add a request feature button"). Sundeck Pro's own
-- list of what shops ask for, not a shop's data: like signup_lead
-- (20261012004200_leads.sql), nobody signed in reads or writes it; only the server (service
-- role), after checking who is asking. Staff read it at /admin/requests. The shop is noted
-- by reference (company_ref), not as a company-owned row.

create table public.feature_request (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  company_ref uuid references public.company (id) on delete set null,
  -- As they were when asked, so the list still reads after a rename or a deleted account.
  name text,
  email text,
  company_name text,
  request text not null check (length(trim(request)) between 1 and 4000),
  -- Where they were in the website when they asked.
  page text,
  created_at timestamptz not null default now()
);
alter table public.feature_request enable row level security;
revoke all on public.feature_request from public, anon, authenticated;
create index feature_request_created_idx on public.feature_request (created_at desc);
