-- The weekly summary goes out at 7 AM Monday in each shop's own time zone (owner, 2026-10-22:
-- "I have Vercel pro", so /api/cron/weekly runs every hour). Same function as
-- 20261022000200_feedback_loops.sql except the hour; grants are unchanged by create or replace.

/**
 * Who gets a weekly summary now: shops where it's Monday from 7 AM (or Tuesday, to catch a run
 * that didn't happen) in their own time zone, not read-only, with each owner and admin who wants
 * it, has an email, and hasn't been sent this week's (or has a failed one to try again).
 * Returns [{company_id, week_of, recipients: [{user_id, email, role}]}].
 */
create or replace function public.weekly_summaries_due(at timestamptz default now())
returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  with shops as (
    select c.id, app.last_week_monday((at at time zone c.timezone)::date) as week_of
    from public.company c
    where c.deleted_at is null
      -- Monday from 7 AM in the shop's time zone (owner, 2026-10-22, with Vercel Pro an hourly
      -- run is possible); all of Tuesday catches a run that didn't happen.
      and (
        (extract(isodow from (at at time zone c.timezone)) = 1
          and extract(hour from (at at time zone c.timezone)) >= 7)
        or extract(isodow from (at at time zone c.timezone)) = 2
      )
      and not app.company_locked(c.id)
  ),
  people as (
    select s.id as company_id, s.week_of, m.user_id, btrim(p.email) as email, m.role
    from shops s
    join public.membership m on m.company_id = s.id and m.status = 'active'
      and m.deleted_at is null
    join public.profile p on p.id = m.user_id
    where app.wants_weekly_summary(p.notification_prefs, m.role)
      and coalesce(btrim(p.email), '') like '%@%'
      and not exists (
        select 1 from public.weekly_summary w
        where w.company_id = s.id and w.week_of = s.week_of and w.user_id = m.user_id
          and (w.status <> 'failed' or w.attempts >= 3))
  )
  select coalesce(jsonb_agg(jsonb_build_object('company_id', company_id, 'week_of', week_of,
    'recipients', recipients) order by company_id), '[]'::jsonb)
  from (
    select company_id, week_of,
      jsonb_agg(jsonb_build_object('user_id', user_id, 'email', email, 'role', role)
        order by role desc, email) as recipients
    from people group by company_id, week_of
  ) d
$$;
