-- Out-of-range reading alerts (docs/design/2026-11-16-chemistry-trends.md).
--
-- chemical_alert: which readings of a log entry already sent their push to the owners and
-- admins, so the hourly run (/api/cron/chemistry) tells them once per reading, however often the
-- entry is edited afterwards. Like push_device it isn't shop data: nobody signed in reads or
-- writes it, and the server (service role) records a row before it sends. A removed log entry
-- takes its alerts with it.

create table public.chemical_alert (
  reading_id uuid not null references public.chemical_reading (id) on delete cascade,
  reading_key text not null check (reading_key in ('fc', 'ph', 'ta', 'ch', 'cya', 'salt')),
  sent_at timestamptz not null default now(),
  primary key (reading_id, reading_key)
);
alter table public.chemical_alert enable row level security;
revoke all on public.chemical_alert from public, anon, authenticated;

-- The hourly run reads the entries saved in the last few days, across shops.
create index chemical_reading_updated_idx on public.chemical_reading (updated_at)
  where deleted_at is null;
