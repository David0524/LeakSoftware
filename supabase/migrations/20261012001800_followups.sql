-- Follow-ups (M10): reminder emails for quotes not yet accepted and invoices not yet paid,
-- and one review request after a job is paid. A daily server job (apps/web
-- /api/cron/daily) asks due_followups() what is due, claims each one in the message log,
-- sends it, and records the result. Customers can stop these emails from any of them
-- (customer.marketing_opt_out); receipts and reports are not affected.

alter table public.message
  add column quote_id uuid,
  add column invoice_id uuid,
  add foreign key (quote_id, company_id) references public.quote (id, company_id),
  add foreign key (invoice_id, company_id) references public.invoice (id, company_id);

-- Each follow-up goes out once: one row per template and quote, invoice, or job. A failed
-- attempt keeps its row, so a broken address isn't retried every day.
create unique index message_followup_once on public.message
  (company_id, template, coalesce(quote_id, invoice_id, job_id))
  where template like 'quote_reminder_%' or template like 'invoice_reminder_%'
     or template = 'review_request';

-- The day numbers in a reminder schedule, e.g. settings.reminders.quote_days = [3, 7].
create or replace function app.reminder_days(settings jsonb, kind text) returns integer[]
language sql immutable as $$
  select coalesce(array(
    select d::integer from jsonb_array_elements_text(settings -> 'reminders' -> kind) d
    where d ~ '^\d{1,3}$' and d::integer > 0
    order by d::integer
  ), '{}')
$$;

-- Everything due now, newest step only (a quote 8 days out gets its 7-day reminder, not
-- the 3-day one as well). Server only.
create or replace function public.due_followups(at timestamptz default now())
returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  with customer_of as (
    select j.id as job_id, j.company_id, c.id as customer_id, c.name, c.email, c.cc_emails
    from public.job j
    left join public.property p on p.id = j.property_id
    join public.customer c on c.id = coalesce(j.bill_to_customer_id, p.customer_id)
    where j.deleted_at is null and c.deleted_at is null
      and not c.marketing_opt_out and nullif(trim(c.email), '') is not null
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
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'company_id', d.company_id, 'job_id', d.job_id, 'quote_id', d.quote_id,
    'invoice_id', d.invoice_id, 'template', d.template, 'number', d.number,
    'amount_cents', d.amount_cents, 'token', d.token,
    'customer', jsonb_build_object('name', c.name, 'email', c.email,
                                   'cc_emails', coalesce(to_jsonb(c.cc_emails), '[]'::jsonb)),
    'company', jsonb_build_object('name', co.name, 'email', co.email, 'phone', co.phone,
                                  'review_url', co.review_url)
  ) order by d.company_id, d.template), '[]'::jsonb)
  from due d
  join customer_of c on c.job_id = d.job_id
  join public.company co on co.id = d.company_id
  where d.token is not null
    and not exists (
      select 1 from public.message m
      where m.company_id = d.company_id and m.template = d.template
        and coalesce(m.quote_id, m.invoice_id, m.job_id)
          = coalesce(d.quote_id, d.invoice_id, d.job_id)
    )
    -- A later reminder already went out (for example after the schedule changed).
    and not exists (
      select 1 from public.message m
      where m.company_id = d.company_id
        and split_part(m.template, '_reminder_', 1) = split_part(d.template, '_reminder_', 1)
        and coalesce(m.quote_id, m.invoice_id) = coalesce(d.quote_id, d.invoice_id)
        and nullif(split_part(m.template, '_reminder_', 2), '')::integer
          >= nullif(split_part(d.template, '_reminder_', 2), '')::integer
    )
$$;

revoke all on function public.due_followups(timestamptz) from public, anon, authenticated;
grant execute on function public.due_followups(timestamptz) to service_role;

-- The customer's "stop these emails" link, from any quote, invoice, or report link.
create or replace function public.opt_out_for_token(link_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sl public.share_link;
  cust uuid;
  shop text;
begin
  select * into sl from public.share_link where token = link_token and revoked_at is null;
  if sl.id is null then
    return null;
  end if;
  select coalesce(j.bill_to_customer_id, p.customer_id), co.name into cust, shop
  from public.job j
  left join public.property p on p.id = j.property_id
  join public.company co on co.id = j.company_id
  where j.id = sl.job_id;
  update public.customer set marketing_opt_out = true where id = cust;
  return jsonb_build_object('company', shop);
end
$$;

revoke all on function public.opt_out_for_token(text) from public;
grant execute on function public.opt_out_for_token(text) to anon, authenticated;

-- What the stop page shows before the customer confirms.
create or replace function public.shop_for_token(link_token text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select co.name from public.share_link sl
  join public.company co on co.id = sl.company_id
  where sl.token = link_token and sl.revoked_at is null
$$;

revoke all on function public.shop_for_token(text) from public;
grant execute on function public.shop_for_token(text) to anon, authenticated;
