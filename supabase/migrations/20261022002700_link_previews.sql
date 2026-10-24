-- Link previews for quotes, invoices and reports (owner, 2026-10-24: "When a shop sends a quote,
-- invoice or report link … the preview should show the document").
--
-- Messages, Mail, Slack and the like fetch a link's page and its og:image before anyone opens
-- it. Both read this, never quote_for_token / invoice_for_token / report_for_token: those count
-- a view (and a report's first view tells the shop the customer opened it). This one counts
-- nothing and returns only what the preview shows, all of it already on the customer's page:
-- no phone numbers, emails or line items.
--
-- A sent report is frozen: its preview reads the report's own snapshot (shop name, logo,
-- address, customer, visit date), so later edits to the job, customer or shop never change it.
-- Quotes and invoices have no snapshot; their pages show the shop and job as they are now, and so
-- does the preview.
--
-- A link that no longer works (expired, turned off, its document deleted) still answers with
-- the shop's name and nothing else, so the preview can say the document is no longer available.
-- An unknown token answers null.

create or replace function public.link_preview_for_token(link_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sl public.share_link;
  co public.company;
  q public.quote;
  inv public.invoice;
  rep public.report;
  j public.job;
  kind text;
  customer_name text;
  address text;
begin
  select * into sl from public.share_link where token = link_token and deleted_at is null;
  if sl.id is null then
    return null;
  end if;
  select * into co from public.company where id = sl.company_id;
  kind := case when sl.quote_id is not null then 'quote'
               when sl.invoice_id is not null then 'invoice'
               when sl.report_id is not null then 'report' end;
  if kind is null then
    return null;
  end if;
  if sl.revoked_at is not null or (sl.expires_at is not null and sl.expires_at <= now()) then
    return jsonb_build_object('kind', kind, 'live', false, 'shop', co.name);
  end if;

  if kind = 'report' then
    select * into rep from public.report
    where id = sl.report_id and status in ('sent', 'superseded') and deleted_at is null;
    if rep.id is null then
      return jsonb_build_object('kind', kind, 'live', false, 'shop', co.name);
    end if;
    return jsonb_build_object(
      'kind', kind, 'live', true,
      'shop', coalesce(rep.data_snapshot -> 'company' ->> 'name', co.name),
      'logo_path', rep.data_snapshot -> 'company' ->> 'logo_path',
      'brand_primary', rep.data_snapshot -> 'company' ->> 'brand_primary',
      'timezone', coalesce(rep.data_snapshot -> 'company' ->> 'timezone', co.timezone),
      'status', rep.status, 'template_key', rep.template_key, 'version', rep.version,
      'sent_at', rep.sent_at,
      'job_type', rep.data_snapshot -> 'job' ->> 'type',
      'customer', rep.data_snapshot -> 'customer' ->> 'name',
      'address', rep.data_snapshot -> 'property' ->> 'address',
      -- The day the work was done, as the report shows it (a visit report's own completed_at,
      -- else the job's), falling back to the day it was sent.
      'visit_at', coalesce(rep.data_snapshot ->> 'completed_at',
                           rep.data_snapshot -> 'job' ->> 'completed_at',
                           rep.data_snapshot -> 'job' ->> 'started_at',
                           rep.data_snapshot -> 'job' ->> 'scheduled_start',
                           to_jsonb(rep.sent_at) #>> '{}'));
  end if;

  if kind = 'quote' then
    select * into q from public.quote
    where id = sl.quote_id and status <> 'draft' and deleted_at is null;
    if q.id is null then
      return jsonb_build_object('kind', kind, 'live', false, 'shop', co.name);
    end if;
    select * into j from public.job where id = q.job_id;
  else
    select * into inv from public.invoice
    where id = sl.invoice_id and status <> 'draft' and deleted_at is null;
    if inv.id is null then
      return jsonb_build_object('kind', kind, 'live', false, 'shop', co.name);
    end if;
    select * into j from public.job where id = inv.job_id;
  end if;
  -- The same customer and address the page shows (quote_for_token, invoice_for_token).
  select c.name into customer_name from public.customer c where c.id = j.bill_to_customer_id;
  select concat_ws(', ', p.address_line1, p.city, concat_ws(' ', p.state, p.postal_code))
    into address from public.property p where p.id = j.property_id;

  if kind = 'quote' then
    return jsonb_build_object(
      'kind', kind, 'live', true, 'shop', co.name, 'logo_path', co.logo_path,
      'brand_primary', co.brand_primary, 'timezone', co.timezone,
      'number', q.number,
      -- Expired the way the page says so: still "sent" after its good-through day.
      'status', case when q.status = 'sent' and q.valid_until is not null
                          and q.valid_until < (now() at time zone co.timezone)::date
                     then 'expired' else q.status end,
      'total_cents', q.total_cents, 'valid_until', q.valid_until, 'sent_at', q.sent_at,
      'customer', customer_name, 'address', address);
  end if;
  return jsonb_build_object(
    'kind', kind, 'live', true, 'shop', co.name, 'logo_path', co.logo_path,
    'brand_primary', co.brand_primary, 'timezone', co.timezone,
    'number', inv.number, 'status', inv.status, 'total_cents', inv.total_cents,
    'balance_cents', greatest(inv.total_cents - inv.amount_paid_cents, 0),
    'due_date', inv.due_date, 'sent_at', inv.sent_at,
    'customer', customer_name, 'address', address);
end
$$;

revoke all on function public.link_preview_for_token(text) from public;
grant execute on function public.link_preview_for_token(text) to anon, authenticated;
