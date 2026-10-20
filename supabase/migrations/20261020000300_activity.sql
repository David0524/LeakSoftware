-- Activity (owner, 2026-10-20: "Throw an activity feed in More. Consider tech's visibility
-- rules. Maybe have a shortcut to it on the owner's dashboard page."; docs/plans/
-- search-and-activity.md, section 2).
--
-- One row per thing that happened in the shop, written here by triggers on the rows that change,
-- so it doesn't matter which platform or server path caused it, and a phone that was offline
-- still makes its events when its changes sync. The events mirror the notifications
-- (apps/web/src/server/notify-events.ts):
--   quote_accepted    a quote becomes accepted (on the customer's page or in person)
--   payment_received  a payment succeeds (a deposit on a quote, or an invoice payment)
--   report_signed     a report is finished with the customer's signature on it
--   report_sent       a report or a visit report is sent
--   job_completed     a job becomes done, or its stop is marked done for the day
--   job_assigned      a job is given to someone (made with a tech, or handed over)
--   job_moved         a job's time moves to another day, or by an hour or more
--   text_received     a customer texts the shop
--
-- Nobody signed in writes here (no client grants beyond SELECT). An event is visible exactly
-- when what it is about is: a job's events when the job is (app.job_visible,
-- 20261012002300_job_visibility.sql), a text when its conversation is
-- (app.conversation_on_my_jobs, 20261012004100_conversation_visibility.sql). Not synced to
-- phones: they read it from the server like the Dashboard, through activity_feed().
--
-- The words are not stored: packages/core (activityText) builds them from the summary fields,
-- so every platform says the same thing. People's names are looked up when read.

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  kind text not null check (kind in ('quote_accepted', 'payment_received', 'report_signed',
    'report_sent', 'job_completed', 'job_assigned', 'job_moved', 'text_received')),
  -- What it opens: the job, or (for texts) the conversation.
  job_id uuid,
  conversation_id uuid,
  -- The row the event is about (quote, payment, report, job, text), so it is recorded once.
  subject_id uuid,
  -- Who did it (null for customers, Stripe, and the server).
  actor_id uuid,
  -- Summary fields, as they were when it happened.
  customer_name text,
  job_number integer,
  amount_cents integer,
  -- The person a job was given to.
  assignee_id uuid,
  -- Where a job moved to.
  scheduled_at timestamptz,
  -- A text's first 80 characters.
  preview text check (preview is null or length(preview) <= 80),
  check (job_id is not null or conversation_id is not null),
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (conversation_id, company_id) references public.conversation (id, company_id)
);
select app.make_synced('public.activity');
create index activity_feed on public.activity (company_id, created_at desc, id desc);
create index activity_job on public.activity (job_id) where job_id is not null;
create index activity_conversation on public.activity (conversation_id)
  where conversation_id is not null;
-- Each quote, payment, report, and text makes its event once (a webhook retried, a sync
-- replayed). Jobs can be completed, given, and moved more than once.
create unique index activity_once on public.activity (kind, subject_id)
  where kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
                 'text_received');

-- When each person last opened Activity: newer events than this show the dot. New people
-- start with nothing unread.
alter table public.profile add column activity_seen_at timestamptz default now();
update public.profile set activity_seen_at = now() where activity_seen_at is null;

-- ---------------------------------------------------------------------------
-- Access (same registry and generated rules as 20261012000600_access.sql): members read,
-- nobody writes. Then narrowed to what the reader may see.
-- ---------------------------------------------------------------------------

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('activity', 'member', 'none', null, null, false, 660);

grant select on public.activity to authenticated;
create policy activity_select on public.activity for select to authenticated
  using (app.is_member(company_id));

-- Written in the once-per-query form (20261012003200_fast_row_security.sql): the per-row
-- checks only run for techs in shops that limit them to their own jobs.
create policy activity_visible on public.activity as restrictive for all to authenticated
  using (
    (job_id is null
     or company_id = any ((select app.all_jobs_companies())::uuid[])
     or app.job_visible(company_id, job_id))
    and (conversation_id is null
         or company_id = any ((select app.all_jobs_companies())::uuid[])
         or app.conversation_on_my_jobs(company_id, conversation_id)));

select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- Recording
-- ---------------------------------------------------------------------------

/** The job's customer: who it's billed to, else the pool's owner. */
create or replace function app.job_customer_name(target_job uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(b.name, o.name)
  from public.job j
  left join public.customer b on b.id = j.bill_to_customer_id
  left join public.property p on p.id = j.property_id
  left join public.customer o on o.id = p.customer_id
  where j.id = target_job
$$;

/**
 * Records one event. Never fails what caused it: an event that can't be written is a warning,
 * not a refused payment, text, or phone sync.
 */
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
    -- In order within one transaction (a report signed, then sent).
    clock_timestamp())
  on conflict (kind, subject_id)
    where kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
                   'text_received')
    do nothing;
exception when others then
  raise warning 'activity: % not recorded: %', event_kind, sqlerrm;
end
$$;

-- A quote accepted, on the customer's page (accept_quote_by_link) or in person.
create or replace function app.activity_quote() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.status = 'accepted' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform app.record_activity(new.company_id, 'quote_accepted', new.job_id, null, new.id,
      auth.uid(), app.job_customer_name(new.job_id), new.total_cents);
  end if;
  return null;
end
$$;
create trigger activity after insert or update of status on public.quote
  for each row execute function app.activity_quote();

-- A payment that succeeded: Stripe (a deposit or an invoice) or one the office recorded.
create or replace function app.activity_payment() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  j uuid;
begin
  if new.status = 'succeeded' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'succeeded') then
    j := coalesce((select job_id from public.invoice where id = new.invoice_id),
                  (select job_id from public.quote where id = new.quote_id));
    if j is not null then
      perform app.record_activity(new.company_id, 'payment_received', j, null, new.id,
        auth.uid(), app.job_customer_name(j), new.amount_cents);
    end if;
  end if;
  return null;
end
$$;
create trigger activity after insert or update of status on public.payment
  for each row execute function app.activity_payment();

-- A report finished with the customer's signature: finishing gives the version the
-- signatures taken since the last one (send_report, 20261012002600_report_sign_off.sql). The
-- quote's acceptance signature is the quote's event, not the report's.
create or replace function app.activity_signature() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.report_id is not null and old.report_id is null and new.deleted_at is null
     and new.purpose <> 'quote_acceptance' then
    perform app.record_activity(new.company_id, 'report_signed', new.job_id, null,
      new.report_id, auth.uid(), app.job_customer_name(new.job_id));
  end if;
  return null;
end
$$;
create trigger activity after update of report_id on public.signature
  for each row execute function app.activity_signature();

-- A report or a visit report sent (a visit report is made already sent).
create or replace function app.activity_report() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.status = 'sent' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status = 'draft') then
    perform app.record_activity(new.company_id, 'report_sent', new.job_id, null, new.id,
      auth.uid(), app.job_customer_name(new.job_id));
  end if;
  return null;
end
$$;
create trigger activity after insert or update of status on public.report
  for each row execute function app.activity_report();

-- Jobs: completed (done, or the stop marked done), given to someone, or moved.
create or replace function app.activity_job() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  tz text;
begin
  if new.deleted_at is not null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    -- A service plan's visits are made many at a time; they aren't news.
    if new.assigned_user_id is not null and new.service_plan_id is null then
      perform app.record_activity(new.company_id, 'job_assigned', new.id, null, new.id,
        auth.uid(), app.job_customer_name(new.id), null, new.assigned_user_id,
        new.scheduled_start);
    end if;
    return null;
  end if;

  if (new.status = 'done' and old.status is distinct from 'done')
     or (new.stop_done_on is not null and new.stop_done_on is distinct from old.stop_done_on) then
    perform app.record_activity(new.company_id, 'job_completed', new.id, null, new.id,
      coalesce(auth.uid(), new.assigned_user_id), app.job_customer_name(new.id));
  end if;

  if new.assigned_user_id is not null
     and new.assigned_user_id is distinct from old.assigned_user_id then
    perform app.record_activity(new.company_id, 'job_assigned', new.id, null, new.id,
      auth.uid(), app.job_customer_name(new.id), null, new.assigned_user_id,
      new.scheduled_start);
  elsif new.scheduled_start is not null and old.scheduled_start is not null
        and new.scheduled_start <> old.scheduled_start then
    -- Moved to another day, or by an hour or more. Smaller shifts are a route making room
    -- for its other stops.
    select timezone into tz from public.company where id = new.company_id;
    if (new.scheduled_start at time zone tz)::date <> (old.scheduled_start at time zone tz)::date
       or abs(extract(epoch from new.scheduled_start - old.scheduled_start)) >= 3600 then
      perform app.record_activity(new.company_id, 'job_moved', new.id, null, new.id,
        auth.uid(), app.job_customer_name(new.id), null, new.assigned_user_id,
        new.scheduled_start);
    end if;
  end if;
  return null;
end
$$;
create trigger activity after insert or update of status, stop_done_on, assigned_user_id,
  scheduled_start on public.job
  for each row execute function app.activity_job();

-- A text from a customer (not one sent while they've opted out, which the team isn't told of).
create or replace function app.activity_text() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  conv public.conversation;
  one_line text := btrim(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'));
begin
  if new.direction <> 'in' then
    return null;
  end if;
  select * into conv from public.conversation where id = new.conversation_id;
  if conv.id is null or conv.opted_out then
    return null;
  end if;
  perform app.record_activity(new.company_id, 'text_received', null, conv.id, new.id, null,
    coalesce((select name from public.customer where id = conv.customer_id), conv.phone),
    null, null, null, nullif(left(one_line, 80), ''));
  return null;
end
$$;
create trigger activity after insert on public.text_message
  for each row execute function app.activity_text();

revoke all on function app.job_customer_name(uuid),
  app.record_activity(uuid, text, uuid, uuid, uuid, uuid, text, integer, uuid, timestamptz, text),
  app.activity_quote(), app.activity_payment(), app.activity_signature(), app.activity_report(),
  app.activity_job(), app.activity_text() from public;

-- ---------------------------------------------------------------------------
-- Reading: the website and both apps
-- ---------------------------------------------------------------------------

/**
 * A page of the shop's activity the caller may see, newest first. Pass the last event's
 * created_at and id to get the next page. Returns
 * {events: [{id, kind, created_at, job_id, conversation_id, customer_name, job_number,
 *            amount_cents, scheduled_at, preview, actor_name, assignee_name}],
 *  more: boolean, seen_at: timestamptz | null}.
 */
create or replace function public.activity_feed(target_company uuid,
  before_at timestamptz default null, before_id uuid default null, page_size integer default 50)
returns jsonb
language plpgsql stable security invoker set search_path = public, app, pg_temp as $$
declare
  n integer := least(greatest(coalesce(page_size, 50), 1), 100);
  rows jsonb;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this shop' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(jsonb_agg(e order by e.created_at desc, e.id desc), '[]'::jsonb) into rows
  from (
    select a.id, a.kind, a.created_at, a.job_id, a.conversation_id, a.customer_name,
           a.job_number, a.amount_cents, a.scheduled_at, a.preview,
           coalesce(actor.full_name, actor.email) as actor_name,
           coalesce(assignee.full_name, assignee.email) as assignee_name
    from public.activity a
    left join public.profile actor on actor.id = a.actor_id
    left join public.profile assignee on assignee.id = a.assignee_id
    where a.company_id = target_company and a.deleted_at is null
      and (before_at is null
           or (a.created_at, a.id) < (before_at, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by a.created_at desc, a.id desc
    limit n + 1
  ) e;
  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
               from jsonb_array_elements(rows) with ordinality as t(x, ord) where ord <= n),
    'more', jsonb_array_length(rows) > n,
    'seen_at', (select activity_seen_at from public.profile where id = auth.uid()));
end
$$;

/** Whether the caller has activity newer than when they last opened it (not their own). */
create or replace function public.activity_unread(target_company uuid) returns boolean
language sql stable security invoker set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from public.activity a
    where a.company_id = target_company and a.deleted_at is null
      and a.created_at > coalesce((select activity_seen_at from public.profile
                                   where id = auth.uid()), '-infinity'::timestamptz)
      and a.actor_id is distinct from auth.uid())
$$;

/** The caller opened Activity: nothing before now is unread. Returns the time recorded. */
create or replace function public.mark_activity_seen() returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  at timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  update public.profile set activity_seen_at = at where id = auth.uid();
  return at;
end
$$;

revoke all on function public.activity_feed(uuid, timestamptz, uuid, integer),
  public.activity_unread(uuid), public.mark_activity_seen() from public, anon;
grant execute on function public.activity_feed(uuid, timestamptz, uuid, integer),
  public.activity_unread(uuid), public.mark_activity_seen() to authenticated;
