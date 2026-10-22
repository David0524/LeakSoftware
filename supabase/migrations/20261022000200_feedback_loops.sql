-- Feedback loops (owner, 2026-10-22): "Techs never hear the outcome. Add a notification when the
-- customer opens their report or pays ('Rebecca paid $650')." and "Owners get no weekly
-- summary. A short email: jobs done, money in, quotes waiting."
--
-- 1. A report's first open by the customer is an Activity event (report_opened), recorded once
--    per report by the server (record_report_opened), which then sends the push. Visit reports
--    (maintenance) are left out: a pool route sends dozens a week.
-- 2. Each push for a once-only event is claimed on its Activity row (activity.notified_at), so a
--    Stripe webhook retried, two deliveries at once, or a reload never notify twice.
-- 3. The weekly summary email: weekly_summaries_due() says who gets one this week,
--    claim_weekly_summary() claims it once per shop, week, and person (public.weekly_summary),
--    weekly_summary_data() has the numbers, and the email's link turns it off
--    (weekly_summary_link / weekly_summary_off). Who wants it is profile.notification_prefs
--    "weekly": owners get it unless they turn it off, admins when they turn it on.

-- ---------------------------------------------------------------------------
-- 1. report_opened
-- ---------------------------------------------------------------------------

alter table public.activity drop constraint activity_kind_check;
alter table public.activity add constraint activity_kind_check
  check (kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
    'report_opened', 'job_completed', 'job_assigned', 'job_moved', 'text_received'));

drop index public.activity_once;
create unique index activity_once on public.activity (kind, subject_id)
  where kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
                 'report_opened', 'text_received');

-- The same function as 20261020000300_activity.sql, with report_opened in the once-only kinds.
create or replace function app.record_activity(
  target_company uuid, event_kind text, target_job uuid, target_conversation uuid,
  subject uuid, actor uuid, customer text, amount integer default null,
  assignee uuid default null, scheduled timestamptz default null, text_preview text default null)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  insert into public.activity (company_id, kind, job_id, conversation_id, subject_id, actor_id,
    customer_name, job_number, amount_cents, assignee_id, scheduled_at, preview, created_at)
  values (target_company, event_kind, target_job, target_conversation, subject, actor,
    nullif(btrim(customer), ''),
    (select number from public.job where id = target_job),
    amount, assignee, scheduled, text_preview,
    clock_timestamp())
  on conflict (kind, subject_id)
    where kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
                   'report_opened', 'text_received')
    do nothing;
exception when others then
  raise warning 'activity: % not recorded: %', event_kind, sqlerrm;
end
$$;
revoke all on function app.record_activity(uuid, text, uuid, uuid, uuid, uuid, text, integer,
  uuid, timestamptz, text) from public;

-- When a push for this event went out (server only; null for events nobody is told about).
alter table public.activity add column notified_at timestamptz;
-- What came before is already told: a webhook replayed after this ships doesn't notify again.
update public.activity set notified_at = created_at
where kind in ('quote_accepted', 'payment_received', 'report_signed');

-- Reports a customer opened before this shipped count as opened (hidden from Activity, since
-- when they were first opened isn't known), so the next open of an old link doesn't notify.
insert into public.activity (company_id, kind, job_id, subject_id, customer_name, job_number,
  created_at, notified_at, deleted_at)
select r.company_id, 'report_opened', r.job_id, r.id, app.job_customer_name(r.job_id),
  (select number from public.job where id = r.job_id), now(), now(), now()
from public.report r
where r.template_key <> 'maintenance'
  and exists (select 1 from public.share_link sl where sl.report_id = r.id and sl.view_count > 0)
on conflict (kind, subject_id)
  where kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
                 'report_opened', 'text_received')
  do nothing;

/**
 * The customer opened a report's link (/r/<token>), called by the server after the page shows
 * (not for the shop's own people, whom the server leaves out). The first open of each report
 * records report_opened and returns {company_id, job_id, report_id, customer_name} for the
 * push; every later open, a link that doesn't work, or a visit report returns null.
 */
create or replace function public.record_report_opened(link_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  sl public.share_link;
  rep public.report;
  who text;
  new_id uuid;
begin
  select * into sl from public.share_link
  where token = link_token and revoked_at is null and deleted_at is null
    and (expires_at is null or expires_at > now());
  if sl.id is null or sl.report_id is null then
    return null;
  end if;
  select * into rep from public.report
  where id = sl.report_id and status in ('sent', 'superseded') and deleted_at is null;
  if rep.id is null or rep.template_key = 'maintenance' then
    return null;
  end if;
  who := app.job_customer_name(rep.job_id);
  insert into public.activity (company_id, kind, job_id, subject_id, customer_name, job_number,
    created_at, notified_at)
  values (rep.company_id, 'report_opened', rep.job_id, rep.id, nullif(btrim(who), ''),
    (select number from public.job where id = rep.job_id), clock_timestamp(), clock_timestamp())
  on conflict (kind, subject_id)
    where kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
                   'report_opened', 'text_received')
    do nothing
  returning id into new_id;
  if new_id is null then
    return null;
  end if;
  return jsonb_build_object('company_id', rep.company_id, 'job_id', rep.job_id,
    'report_id', rep.id, 'customer_name', who);
end
$$;

/**
 * A Stripe payment succeeded (the webhook, after recording it): claims its push. Returns the
 * payment ({company_id, job_id, invoice_id, quote_id, invoice_number, amount_cents,
 * customer_name}) the first time only; null when it was already told, isn't recorded as
 * succeeded, or wasn't taken on the shop's own account (then nothing was recorded).
 */
create or replace function public.claim_payment_notification(session_id text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  p public.payment;
  a public.activity;
begin
  select * into p from public.payment
  where stripe_checkout_session_id = session_id and status = 'succeeded' and deleted_at is null;
  if p.id is null then
    return null;
  end if;
  update public.activity set notified_at = clock_timestamp()
  where kind = 'payment_received' and subject_id = p.id and notified_at is null
  returning * into a;
  if a.id is null then
    return null;
  end if;
  return jsonb_build_object('company_id', p.company_id, 'job_id', a.job_id,
    'invoice_id', p.invoice_id, 'quote_id', p.quote_id,
    'invoice_number', (select number from public.invoice where id = p.invoice_id),
    'amount_cents', p.amount_cents, 'customer_name', a.customer_name);
end
$$;

revoke all on function public.record_report_opened(text),
  public.claim_payment_notification(text) from public, anon, authenticated;
grant execute on function public.record_report_opened(text),
  public.claim_payment_notification(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The weekly summary
-- ---------------------------------------------------------------------------

-- One row per weekly summary email: the shop, the week it covers (that week's Monday, in the
-- shop's time zone), and the person. The unique key is the claim, so a second cron run, or two
-- at once, never send it twice. A failed send is tried again on the next run (at most 3 times).
-- The token is the email's turn-off link. Server only: owners can read it, nobody writes it.
create table public.weekly_summary (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  week_of date not null check (extract(isodow from week_of) = 1),
  user_id uuid not null,
  email text not null check (length(email) between 3 and 320),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts between 1 and 3),
  provider_id text,
  error text,
  sent_at timestamptz,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  foreign key (company_id, user_id) references public.membership (company_id, user_id)
    on delete cascade,
  unique (company_id, week_of, user_id)
);
select app.make_synced('public.weekly_summary');

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('weekly_summary', 'owner', 'none', null, null, false, 940);

-- Access, as the registry generates it (20261012000600_access.sql): owners read, nobody writes.
grant select on public.weekly_summary to authenticated;
create policy weekly_summary_select on public.weekly_summary for select to authenticated
  using (app.is_owner(company_id));

select app.speed_up_policies();

/** Whether a person wants the weekly summary: their choice, else on for owners only. */
create or replace function app.wants_weekly_summary(prefs jsonb, member_role text)
returns boolean
language sql immutable as $$
  select case when jsonb_typeof(prefs -> 'weekly') = 'boolean' then (prefs ->> 'weekly')::boolean
              else member_role = 'owner' end
    and member_role in ('owner', 'admin')
$$;

/** The Monday that starts the week before the one `local_day` is in. */
create or replace function app.last_week_monday(local_day date) returns date
language sql immutable as $$
  select local_day - (extract(isodow from local_day)::int - 1) - 7
$$;

/**
 * Who gets a weekly summary now: shops where it's Monday (or Tuesday, to catch a run that
 * didn't happen) in their own time zone, not read-only, with each owner and admin who wants
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
      and extract(isodow from (at at time zone c.timezone)::date) in (1, 2)
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

/**
 * Claims one person's summary for the week: their turn-off token when this run should send it,
 * null when it's already sent or being sent (another run claimed it first). A failed one is
 * claimed again, up to 3 tries.
 */
create or replace function public.claim_weekly_summary(target_company uuid, target_week date,
  target_user uuid, to_email text) returns text
language sql volatile security definer set search_path = public, app, pg_temp as $$
  insert into public.weekly_summary (company_id, week_of, user_id, email)
  values (target_company, target_week, target_user, btrim(to_email))
  on conflict (company_id, week_of, user_id) do update
    set status = 'queued', attempts = public.weekly_summary.attempts + 1, error = null,
        email = excluded.email
    where public.weekly_summary.status = 'failed' and public.weekly_summary.attempts < 3
  returning token
$$;

/** How a claimed summary went: sent (with the provider's id) or failed (with why). */
create or replace function public.finish_weekly_summary(link_token text, delivered boolean,
  provider text default null, failure text default null) returns void
language sql volatile security definer set search_path = public, app, pg_temp as $$
  update public.weekly_summary
  set status = case when delivered then 'sent' else 'failed' end,
      provider_id = provider, error = left(failure, 500),
      sent_at = case when delivered then now() end
  where token = link_token
$$;

/**
 * The numbers in a shop's weekly summary, for the week starting `week_of` (a Monday, in the
 * shop's time zone):
 *   jobs_done        jobs completed in the week (Activity's job_completed, each job once), by type
 *   collected_cents  payments that succeeded in the week
 *   owed_cents       what's still owed on open invoices now, and how many (owed_count)
 *   quotes_waiting   sent quotes not yet accepted or declined: how many, their total, and the
 *                    oldest three (customer, number, total, sent_at)
 *   scheduled_next   jobs scheduled in the week after (the one the email arrives in)
 * plus the shop's name, logo and time zone.
 */
create or replace function public.weekly_summary_data(target_company uuid, week_of date)
returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  co public.company;
  starts timestamptz;
  ends timestamptz;
  next_ends timestamptz;
begin
  select * into co from public.company where id = target_company;
  if co.id is null then
    return null;
  end if;
  starts := week_of::timestamp at time zone co.timezone;
  ends := (week_of + 7)::timestamp at time zone co.timezone;
  next_ends := (week_of + 14)::timestamp at time zone co.timezone;
  return jsonb_build_object(
    'company', jsonb_build_object('id', co.id, 'name', co.name, 'logo_path', co.logo_path,
      'timezone', co.timezone),
    'week_of', week_of,
    'jobs_done', (
      select coalesce(jsonb_object_agg(type, n), '{}'::jsonb) from (
        select j.type, count(distinct j.id) as n
        from public.activity a join public.job j on j.id = a.job_id
        where a.company_id = target_company and a.kind = 'job_completed'
          and a.deleted_at is null and j.deleted_at is null
          and a.created_at >= starts and a.created_at < ends
        group by j.type) t),
    'collected_cents', (
      select coalesce(sum(p.amount_cents), 0) from public.payment p
      where p.company_id = target_company and p.deleted_at is null and p.status = 'succeeded'
        and p.paid_at >= starts and p.paid_at < ends),
    'owed_cents', (
      select coalesce(sum(i.total_cents - i.amount_paid_cents), 0) from public.invoice i
      where i.company_id = target_company and i.deleted_at is null
        and i.status in ('sent', 'partially_paid')),
    'owed_count', (
      select count(*) from public.invoice i
      where i.company_id = target_company and i.deleted_at is null
        and i.status in ('sent', 'partially_paid') and i.total_cents > i.amount_paid_cents),
    'quotes_waiting', (
      select jsonb_build_object(
        'count', count(*),
        'total_cents', coalesce(sum(q.total_cents), 0),
        'oldest', coalesce((
          select jsonb_agg(o order by o.sent_at, o.number) from (
            select app.job_customer_name(q2.job_id) as customer_name, q2.number,
                   q2.total_cents, q2.sent_at
            from public.quote q2 join public.job j2 on j2.id = q2.job_id
            where q2.company_id = target_company and q2.deleted_at is null
              and q2.status = 'sent' and j2.deleted_at is null
            order by q2.sent_at nulls last, q2.number limit 3) o), '[]'::jsonb))
      from public.quote q join public.job j on j.id = q.job_id
      where q.company_id = target_company and q.deleted_at is null and q.status = 'sent'
        and j.deleted_at is null),
    'scheduled_next', (
      select count(*) from public.job j
      where j.company_id = target_company and j.deleted_at is null
        and j.status <> 'canceled'
        and j.scheduled_start >= ends and j.scheduled_start < next_ends));
end
$$;

/** The turn-off page (from the email, signed out): the shop's name, or null for a bad link. */
create or replace function public.weekly_summary_link(link_token text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object('company_name', c.name, 'email', w.email,
    'on', app.wants_weekly_summary(p.notification_prefs, m.role))
  from public.weekly_summary w
  join public.company c on c.id = w.company_id
  join public.membership m on m.company_id = w.company_id and m.user_id = w.user_id
  join public.profile p on p.id = w.user_id
  where w.token = link_token and w.created_at > now() - interval '1 year'
$$;

/** Turn Off Weekly Summary (the email's link): that person's choice, everywhere. */
create or replace function public.weekly_summary_off(link_token text) returns boolean
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  who uuid;
begin
  select user_id into who from public.weekly_summary
  where token = link_token and created_at > now() - interval '1 year';
  if who is null then
    return false;
  end if;
  update public.profile
  set notification_prefs = notification_prefs || '{"weekly": false}'::jsonb
  where id = who;
  return true;
end
$$;

revoke all on function app.wants_weekly_summary(jsonb, text), app.last_week_monday(date),
  public.weekly_summaries_due(timestamptz),
  public.claim_weekly_summary(uuid, date, uuid, text),
  public.finish_weekly_summary(text, boolean, text, text),
  public.weekly_summary_data(uuid, date),
  public.weekly_summary_link(text), public.weekly_summary_off(text)
  from public, anon, authenticated;
grant execute on function public.weekly_summaries_due(timestamptz),
  public.claim_weekly_summary(uuid, date, uuid, text),
  public.finish_weekly_summary(text, boolean, text, text),
  public.weekly_summary_data(uuid, date) to service_role;
-- The turn-off page is signed out, like the customer pages.
grant execute on function public.weekly_summary_link(text), public.weekly_summary_off(text)
  to anon, authenticated, service_role;
