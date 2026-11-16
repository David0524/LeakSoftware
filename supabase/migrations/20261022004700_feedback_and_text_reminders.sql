-- Feedback screening before review requests, and text-message reminders (owner's competitor
-- notes, 2026-11-16). Design: docs/design/2026-11-16-feedback-and-text-reminders.md.
--
--   * customer_feedback: a customer's thumbs up or thumbs down from their report page or the
--     review request email (no sign-in, the link's token). A thumbs down is a private complaint:
--     open until an owner or admin closes it, with a note. Written by the server only
--     (submit_feedback, service role); owners and admins read it and set status and note.
--   * due_followups(): customers with an open complaint (or a thumbs up already given on the
--     job) get no review request; reminders can go by text, so it also returns the customer's
--     phone, the shop's reminder channel (settings.reminders.channel: email, text or both;
--     default email) and which channels already went for each step.
--   * message_followup_once is per channel, so "Both" can claim an email and a text.
--   * settings.ask_feedback_first (default true): the review request email asks "How did we
--     do?" before it offers the review link.

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------

create table public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  customer_id uuid,
  job_id uuid,
  rating text not null check (rating in ('up', 'down')),
  comment text check (comment is null or length(comment) <= 2000),
  -- A thumbs down is open until the office closes it; a thumbs up is not a case.
  status text not null default 'open' check (status in ('open', 'closed')),
  office_note text check (office_note is null or length(office_note) <= 2000),
  closed_by uuid,
  closed_at timestamptz,
  check (rating = 'down' or status = 'closed'),
  foreign key (customer_id, company_id) references public.customer (id, company_id),
  foreign key (job_id, company_id) references public.job (id, company_id),
  foreign key (company_id, closed_by) references public.membership (company_id, user_id)
);
select app.make_synced('public.customer_feedback');
create index customer_feedback_customer_idx on public.customer_feedback (customer_id);
create index customer_feedback_job_idx on public.customer_feedback (job_id);
create index customer_feedback_open_idx on public.customer_feedback (company_id)
  where status = 'open' and deleted_at is null;

-- Access: as the registry generates it (20261012000600_access.sql). Owners and admins read and
-- close or reopen; the rows themselves come from the server. Phones read it through the
-- feedback_* functions below, so it is not synced.
insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('customer_feedback', 'manager', 'manager', null, '{status,office_note}', false, 970);

grant select on public.customer_feedback to authenticated;
create policy customer_feedback_select on public.customer_feedback for select to authenticated
  using (app.is_manager(company_id));
grant update (status, office_note) on public.customer_feedback to authenticated;
create policy customer_feedback_update on public.customer_feedback for update to authenticated
  using (app.is_manager(company_id)) with check (app.is_manager(company_id));

create trigger guard_writable before insert or update or delete on public.customer_feedback
  for each row execute function app.guard_writable();

select app.speed_up_policies();

/** Who closed it and when: set from the status change, never typed. Thumbs up stay closed. */
create or replace function app.customer_feedback_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.rating = 'up' then
      raise exception 'A thumbs up is not a complaint.' using errcode = '23514';
    end if;
    if new.status = 'closed' then
      new.closed_at := now();
      new.closed_by := auth.uid();
    else
      new.closed_at := null;
      new.closed_by := null;
    end if;
  end if;
  return new;
end
$$;
create trigger customer_feedback_status before update on public.customer_feedback
  for each row execute function app.customer_feedback_status();

-- ---------------------------------------------------------------------------
-- The customer's side (server only: the page calls these with the service role)
-- ---------------------------------------------------------------------------

/** The customer behind a job: who it is billed to, else the pool's owner. */
create or replace function app.job_customer_id(target_job uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(j.bill_to_customer_id, p.customer_id)
  from public.job j
  left join public.property p on p.id = j.property_id
  where j.id = target_job
$$;
revoke all on function app.job_customer_id(uuid) from public;

/**
 * What the "How did we do?" card needs for a customer link: the shop, its review link, and
 * whether it asks first. Null for a link that no longer works or the shop's sample job.
 */
create or replace function public.feedback_for_token(link_token text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object(
    'company_id', co.id, 'company', co.name, 'job_id', sl.job_id,
    'review_url', nullif(btrim(co.review_url), ''),
    'enabled', coalesce((co.settings ->> 'ask_feedback_first')::boolean, true))
  from public.share_link sl
  join public.company co on co.id = sl.company_id
  join public.job j on j.id = sl.job_id and not j.sample
  where sl.token = link_token and sl.revoked_at is null and sl.deleted_at is null
    and (sl.expires_at is null or sl.expires_at > now())
$$;
revoke all on function public.feedback_for_token(text) from public, anon, authenticated;
grant execute on function public.feedback_for_token(text) to service_role;

/**
 * A thumbs up or down from a customer's link. Returns {id, company_id, job_id, customer_id,
 * customer_name, rating, review_url, made}: `made` false when the same answer was already
 * recorded (a thumbs up once per job; the same complaint twice), so a double tap or a reload
 * never makes two. Null for a link that no longer works.
 */
create or replace function public.submit_feedback(
  link_token text, new_rating text, new_comment text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  sl public.share_link;
  cust uuid;
  words text := nullif(btrim(coalesce(new_comment, '')), '');
  existing public.customer_feedback;
  made boolean := true;
  who text;
  url text;
begin
  if new_rating not in ('up', 'down') then
    raise exception 'Pick a thumbs up or a thumbs down.' using errcode = '22023';
  end if;
  if words is not null and length(words) > 2000 then
    raise exception 'Keep it under 2,000 characters.' using errcode = '22023';
  end if;
  select * into sl from public.share_link
  where token = link_token and revoked_at is null and deleted_at is null
    and (expires_at is null or expires_at > now());
  if sl.id is null or exists (select 1 from public.job where id = sl.job_id and sample) then
    return null;
  end if;
  cust := app.job_customer_id(sl.job_id);
  select * into existing from public.customer_feedback
  where company_id = sl.company_id and job_id = sl.job_id and rating = new_rating
    and deleted_at is null and (new_rating = 'up' or comment is not distinct from words)
  order by created_at desc limit 1;
  if existing.id is null then
    insert into public.customer_feedback (company_id, customer_id, job_id, rating, comment, status)
    values (sl.company_id, cust, sl.job_id, new_rating,
            case when new_rating = 'down' then words end,
            case when new_rating = 'down' then 'open' else 'closed' end)
    returning * into existing;
  else
    made := false;
  end if;
  select name into who from public.customer where id = cust;
  select nullif(btrim(review_url), '') into url from public.company where id = sl.company_id;
  return jsonb_build_object('id', existing.id, 'company_id', sl.company_id, 'job_id', sl.job_id,
    'customer_id', cust, 'customer_name', who, 'rating', new_rating, 'review_url', url,
    'made', made);
end
$$;
revoke all on function public.submit_feedback(text, text, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- The office's side (owners and admins; the table's row security applies)
-- ---------------------------------------------------------------------------

/**
 * Feedback, open complaints first and newest first: {open_count, rows}. `target_customer`
 * narrows it to one customer (their page). Row security gives anyone but an owner or admin
 * nothing.
 */
create or replace function public.feedback_list(
  target_company uuid, target_customer uuid default null) returns jsonb
language sql stable set search_path = public, app, pg_temp as $$
  select jsonb_build_object(
    'open_count', (select count(*) from public.customer_feedback f
                   where f.company_id = target_company and f.status = 'open'
                     and f.deleted_at is null),
    'rows', coalesce((
      select jsonb_agg(s.r order by s.sort, s.created_at desc) from (
        select jsonb_build_object(
          'id', f.id, 'customer_id', f.customer_id,
          'customer_name', nullif(btrim(coalesce(c.name, c.company_name)), ''),
          'job_id', f.job_id, 'job_number', j.number, 'rating', f.rating,
          'comment', f.comment, 'status', f.status, 'office_note', f.office_note,
          'closed_at', f.closed_at, 'created_at', f.created_at,
          'closed_by_name', nullif(btrim(p.full_name), '')) as r,
          case when f.status = 'open' then 0 when f.rating = 'down' then 1 else 2 end as sort,
          f.created_at
        from public.customer_feedback f
        left join public.customer c on c.id = f.customer_id
        left join public.job j on j.id = f.job_id
        left join public.profile p on p.id = f.closed_by
        where f.company_id = target_company and f.deleted_at is null
          and (target_customer is null or f.customer_id = target_customer)
        order by case when f.status = 'open' then 0 when f.rating = 'down' then 1 else 2 end,
                 f.created_at desc
        limit 300) s), '[]'::jsonb))
$$;
revoke all on function public.feedback_list(uuid, uuid) from public, anon;
grant execute on function public.feedback_list(uuid, uuid) to authenticated;

/** How many complaints are open: the Dashboard card (zero for anyone but an owner or admin). */
create or replace function public.feedback_open_count(target_company uuid) returns integer
language sql stable set search_path = public, app, pg_temp as $$
  select count(*)::integer from public.customer_feedback f
  where f.company_id = target_company and f.status = 'open' and f.deleted_at is null
$$;
revoke all on function public.feedback_open_count(uuid) from public, anon;
grant execute on function public.feedback_open_count(uuid) to authenticated;

/** Close or reopen a complaint, with the office's note. */
create or replace function public.set_feedback_status(
  target_feedback uuid, new_status text, new_note text default null) returns void
language plpgsql set search_path = public, app, pg_temp as $$
declare
  n integer;
begin
  if new_status not in ('open', 'closed') then
    raise exception 'Pick open or closed.' using errcode = '22023';
  end if;
  if length(coalesce(new_note, '')) > 2000 then
    raise exception 'Keep the note under 2,000 characters.' using errcode = '22023';
  end if;
  update public.customer_feedback
  set status = new_status, office_note = nullif(btrim(coalesce(new_note, '')), '')
  where id = target_feedback and rating = 'down' and deleted_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'That complaint isn’t there.' using errcode = 'P0002';
  end if;
end
$$;
revoke all on function public.set_feedback_status(uuid, text, text) from public, anon;
grant execute on function public.set_feedback_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Follow-ups: channel, phone, open complaints
-- ---------------------------------------------------------------------------

drop index public.message_followup_once;
create unique index message_followup_once on public.message
  (company_id, template, coalesce(quote_id, invoice_id, job_id), channel)
  where template like 'quote_reminder_%' or template like 'invoice_reminder_%'
     or template = 'review_request';

-- How a shop's reminders go: anything but 'text' or 'both' is email.
create or replace function app.reminder_channel(settings jsonb) returns text
language sql immutable as $$
  select case settings -> 'reminders' ->> 'channel'
    when 'text' then 'text' when 'both' then 'both' else 'email' end
$$;

-- Everything due now, newest step only (a quote 8 days out gets its 7-day reminder, not the
-- 3-day one as well). Each item says the shop's channel and the channels already sent for its
-- step; the server picks what the customer can get. Server only.
create or replace function public.due_followups(at timestamptz default now())
returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  with customer_of as (
    select j.id as job_id, j.company_id, c.id as customer_id, c.name, c.email, c.phone,
           c.cc_emails
    from public.job j
    left join public.property p on p.id = j.property_id
    join public.customer c on c.id = coalesce(j.bill_to_customer_id, p.customer_id)
    where j.deleted_at is null and c.deleted_at is null and not c.marketing_opt_out
      and (nullif(trim(c.email), '') is not null or nullif(trim(c.phone), '') is not null)
  ),
  quotes as (
    select q.company_id, q.job_id, q.id as quote_id, null::uuid as invoice_id,
           'quote_reminder_' || step as template, q.number, q.total_cents as amount_cents,
           (select token from public.share_link s
            where s.quote_id = q.id and s.revoked_at is null order by s.created_at desc limit 1)
             as token
    from public.quote q
    join public.company co on co.id = q.company_id
    cross join lateral (
      select max(d) as step from unnest(app.reminder_days(co.settings, 'quote_days')) d
      where q.sent_at + make_interval(days => d) <= at
    ) s
    where q.status = 'sent' and q.deleted_at is null and q.sent_at is not null
      and s.step is not null
      and (q.valid_until is null or q.valid_until >= (at at time zone co.timezone)::date)
  ),
  invoices as (
    select i.company_id, i.job_id, null::uuid, i.id, 'invoice_reminder_' || step,
           i.number, i.total_cents - i.amount_paid_cents,
           (select token from public.share_link s
            where s.invoice_id = i.id and s.revoked_at is null order by s.created_at desc limit 1)
    from public.invoice i
    join public.company co on co.id = i.company_id
    cross join lateral (
      select max(d) as step from unnest(app.reminder_days(co.settings, 'invoice_days')) d
      where i.sent_at + make_interval(days => d) <= at
    ) s
    where i.status in ('sent', 'partially_paid') and i.deleted_at is null
      and i.sent_at is not null and s.step is not null
      and i.total_cents > i.amount_paid_cents
  ),
  reviews as (
    -- Paid in the last two weeks, at least two hours ago, when the shop has a review link.
    select i.company_id, i.job_id, null::uuid, i.id, 'review_request', i.number, i.total_cents,
           (select token from public.share_link s
            where s.invoice_id = i.id and s.revoked_at is null order by s.created_at desc limit 1)
    from public.invoice i
    join public.company co on co.id = i.company_id
    where i.status = 'paid' and i.deleted_at is null
      and i.paid_at between at - interval '14 days' and at - interval '2 hours'
      and coalesce((co.settings ->> 'review_requests')::boolean, true)
      and nullif(trim(co.review_url), '') is not null
      and not exists (select 1 from public.message m
                      where m.job_id = i.job_id and m.template = 'review_request')
  ),
  due as (
    select * from quotes union all select * from invoices union all select * from reviews
  ),
  wanted as (
    select d.*, c.customer_id, c.name, c.email, c.phone, c.cc_emails,
           case when d.template = 'review_request' then 'email'
                else app.reminder_channel(co.settings) end as channel,
           coalesce((co.settings ->> 'ask_feedback_first')::boolean, true) as feedback_first,
           co.name as shop, co.email as shop_email, co.phone as shop_phone, co.review_url,
           coalesce((select array_agg(m.channel) from public.message m
                     where m.company_id = d.company_id and m.template = d.template
                       and coalesce(m.quote_id, m.invoice_id, m.job_id)
                         = coalesce(d.quote_id, d.invoice_id, d.job_id)), '{}') as sent_channels
    from due d
    join customer_of c on c.job_id = d.job_id
    join public.company co on co.id = d.company_id
    where d.token is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'company_id', w.company_id, 'job_id', w.job_id, 'quote_id', w.quote_id,
    'invoice_id', w.invoice_id, 'template', w.template, 'number', w.number,
    'amount_cents', w.amount_cents, 'token', w.token, 'channel', w.channel,
    'feedback_first', w.feedback_first, 'sent_channels', to_jsonb(w.sent_channels),
    'customer', jsonb_build_object('name', w.name, 'email', coalesce(w.email, ''),
                                   'phone', w.phone,
                                   'cc_emails', coalesce(to_jsonb(w.cc_emails), '[]'::jsonb)),
    'company', jsonb_build_object('name', w.shop, 'email', w.shop_email, 'phone', w.shop_phone,
                                  'review_url', w.review_url)
  ) order by w.company_id, w.template), '[]'::jsonb)
  from wanted w
  where
    -- Every channel the shop picked has gone for this step: nothing left to send.
    not (case w.channel when 'both' then w.sent_channels @> array['email', 'sms']
                        when 'text' then 'sms' = any (w.sent_channels)
                        else 'email' = any (w.sent_channels) end)
    -- A later reminder already went out (for example after the schedule changed).
    and not exists (
      select 1 from public.message m
      where m.company_id = w.company_id
        and split_part(m.template, '_reminder_', 1) = split_part(w.template, '_reminder_', 1)
        and coalesce(m.quote_id, m.invoice_id) = coalesce(w.quote_id, w.invoice_id)
        and nullif(split_part(m.template, '_reminder_', 2), '')::integer
          > nullif(split_part(w.template, '_reminder_', 2), '')::integer
    )
    -- The review request is an email and needs an address.
    and (w.template <> 'review_request' or nullif(trim(w.email), '') is not null)
    -- No review request to a customer with an open complaint, or on a job they already
    -- gave a thumbs up (they were shown the review link then).
    and (w.template <> 'review_request' or not exists (
      select 1 from public.customer_feedback f
      where f.company_id = w.company_id and f.deleted_at is null
        and ((f.customer_id = w.customer_id and f.rating = 'down' and f.status = 'open')
             or (f.job_id = w.job_id and f.rating = 'up'))))
$$;

revoke all on function public.due_followups(timestamptz) from public, anon, authenticated;
grant execute on function public.due_followups(timestamptz) to service_role;
