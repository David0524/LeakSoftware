-- Notifications (owner, 2026-10-19: "Let's also get live activities and notifications for the
-- apps"; docs/plans/live-activities-and-notifications.md).
--
-- push_device: each phone's push token, so the website can reach it (Apple's push service for
-- the iPhone app, Expo's for the Android app). Like feature_request it isn't shop data and
-- nobody signed in reads or writes it: the phone registers through /api/push/devices with its
-- bearer token, and the server (service role) writes the row after checking who is asking.
-- A token belongs to one person at a time: signing in as someone else on the same phone moves it.
--
-- profile.notification_prefs: which kinds each person gets, {"text": false, ...}; a kind not
-- listed is on. Per person, not per shop, and set by that person only.

create table public.push_device (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service text not null check (service in ('apns', 'expo')),
  token text not null check (length(token) between 10 and 400),
  -- "iPhone app", "Android app": shown in More › Notifications.
  app text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (service, token)
);
alter table public.push_device enable row level security;
revoke all on public.push_device from public, anon, authenticated;
create index push_device_user_idx on public.push_device (user_id);

alter table public.profile add column notification_prefs jsonb not null default '{}'
  check (jsonb_typeof(notification_prefs) = 'object');
grant update (notification_prefs) on public.profile to authenticated;
