-- Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check").
--
-- 1. A payment the shop records says how it was paid: 'cash', 'check' (with an optional check
--    number), or 'other' as before. record_invoice_payment takes both; a call with only the
--    invoice and amount (older phones) still records 'other'. It also returns the payment's id,
--    so the Send Receipt that follows is for that payment.
-- 2. A receipt can be texted from the shop's company number: message.channel 'sms'.
-- 3. log_receipt() logs a receipt sent for one payment and, once sent, an Activity event
--    (receipt_sent) with who sent it, when, and how. The channel word ('email' or 'text') rides
--    in activity.preview, which for texts holds their first words; packages/core reads it.
-- 4. The customer's page lists each payment's method and check number, in the order paid.

-- ---------------------------------------------------------------------------
-- 1. Cash and check
-- ---------------------------------------------------------------------------

alter table public.payment drop constraint payment_method_check;
alter table public.payment add constraint payment_method_check
  check (method in ('card', 'ach', 'cash', 'check', 'other'));
alter table public.payment add column check_number text
  check (check_number is null or (length(check_number) between 1 and 20 and method = 'check'));

drop function public.record_invoice_payment(uuid, integer);
drop function app.record_invoice_payment_unchecked(uuid, integer);

-- Managers only (20261012005200_admin_role.sql). Returns {status, paid_now, payment_id}.
create function app.record_invoice_payment_unchecked(target_invoice uuid, amount integer,
  pay_method text default 'other', check_no text default null)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  balance bigint;
  paid_now boolean;
  how text := coalesce(nullif(btrim(pay_method), ''), 'other');
  -- "#1234" and " 1234 " are check 1234; only a check keeps a number.
  num text := nullif(btrim(ltrim(btrim(coalesce(check_no, '')), '#')), '');
  new_id uuid;
begin
  select * into inv from public.invoice where id = target_invoice and deleted_at is null for update;
  if inv.id is null or not app.is_member(inv.company_id) then
    raise exception 'Invoice not found' using errcode = 'insufficient_privilege';
  end if;
  if not app.is_manager(inv.company_id) then
    raise exception 'Only owners and admins can record payments' using errcode = 'insufficient_privilege';
  end if;
  if inv.status not in ('sent', 'partially_paid') then
    raise exception 'Send the invoice before recording a payment' using errcode = 'check_violation';
  end if;
  if how not in ('cash', 'check', 'other') then
    raise exception 'Pick Cash, Check, or Other' using errcode = 'check_violation';
  end if;
  if how <> 'check' then
    num := null;
  elsif num is not null and length(num) > 20 then
    raise exception 'Enter a check number up to 20 characters' using errcode = 'check_violation';
  end if;
  balance := inv.total_cents - inv.amount_paid_cents;
  if amount is null or amount <= 0 or amount > balance then
    raise exception 'Enter an amount up to the balance due' using errcode = 'check_violation';
  end if;
  insert into public.payment (company_id, invoice_id, amount_cents, method, check_number, status, paid_at)
  values (inv.company_id, inv.id, amount, how, num, 'succeeded', now())
  returning id into new_id;
  paid_now := app.refresh_invoice(inv.id);
  return jsonb_build_object('status', (select status from public.invoice where id = inv.id),
                            'paid_now', paid_now, 'payment_id', new_id);
end
$$;
revoke all on function app.record_invoice_payment_unchecked(uuid, integer, text, text) from public;

-- The job-visibility wrapper, as 20261012002800_visibility_functions.sql makes them.
create function public.record_invoice_payment(target_invoice uuid, amount integer,
  method text default 'other', check_number text default null)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.require_visible_record('invoice', $1);
  return app.record_invoice_payment_unchecked($1, $2, $3, $4);
end
$$;
revoke all on function public.record_invoice_payment(uuid, integer, text, text) from public;
grant execute on function public.record_invoice_payment(uuid, integer, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Texts from the company number
-- ---------------------------------------------------------------------------

alter table public.message drop constraint message_channel_check;
alter table public.message add constraint message_channel_check
  check (channel in ('email', 'sms_device', 'sms'));

-- ---------------------------------------------------------------------------
-- 3. Receipts sent, in Activity
-- ---------------------------------------------------------------------------

alter table public.activity drop constraint activity_kind_check;
alter table public.activity add constraint activity_kind_check
  check (kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
    'report_opened', 'job_completed', 'job_assigned', 'job_moved', 'text_received',
    'receipt_sent'));

/**
 * The server sent (or failed to send) a receipt for a payment, as the signed-in member: logs the
 * message on the job and, when sent, a receipt_sent event (any number per payment: a receipt
 * can be sent again). `via` is 'email' or 'sms' (the company number). Returns the message id.
 */
create or replace function public.log_receipt(target_payment uuid, via text, sent_to text,
  delivery text, provider text default null, failure text default null)
returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  p public.payment;
  inv public.invoice;
  new_id uuid;
begin
  select * into p from public.payment
  where id = target_payment and deleted_at is null and invoice_id is not null;
  if p.id is null or not app.is_member(p.company_id) then
    raise exception 'Payment not found' using errcode = 'insufficient_privilege';
  end if;
  perform app.require_visible_record('invoice', p.invoice_id);
  if via not in ('email', 'sms') or delivery not in ('sent', 'failed')
     or coalesce(btrim(sent_to), '') = '' then
    raise exception 'Unknown receipt delivery' using errcode = 'invalid_parameter_value';
  end if;
  select * into inv from public.invoice where id = p.invoice_id;
  insert into public.message (company_id, job_id, channel, recipient, template, status,
                              provider_id, error)
  values (p.company_id, inv.job_id, via, left(sent_to, 500), 'receipt', delivery, provider,
          left(failure, 500))
  returning id into new_id;
  if delivery = 'sent' then
    perform app.record_activity(p.company_id, 'receipt_sent', inv.job_id, null, new_id,
      auth.uid(), app.job_customer_name(inv.job_id), p.amount_cents, null, null,
      case via when 'sms' then 'text' else 'email' end);
  end if;
  return new_id;
end
$$;
revoke all on function public.log_receipt(uuid, text, text, text, text, text) from public;
grant execute on function public.log_receipt(uuid, text, text, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The customer's page: each payment's method and check number, in the order paid
-- ---------------------------------------------------------------------------

create or replace function public.invoice_for_token(link_token text, count_view boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  sl public.share_link;
  inv public.invoice;
  co public.company;
  j public.job;
begin
  select * into sl from public.share_link
  where token = link_token and revoked_at is null and (expires_at is null or expires_at > now())
    and deleted_at is null;
  if sl.id is null or sl.invoice_id is null then
    return null;
  end if;
  select * into inv from public.invoice
  where id = sl.invoice_id and status <> 'draft' and deleted_at is null;
  if inv.id is null then
    return null;
  end if;
  if count_view then
    update public.share_link set view_count = view_count + 1, last_viewed_at = now() where id = sl.id;
  end if;
  select * into co from public.company where id = inv.company_id;
  select * into j from public.job where id = inv.job_id;
  return jsonb_build_object(
    'invoice_id', inv.id, 'company_id', inv.company_id, 'job_id', inv.job_id,
    'number', inv.number, 'job_number', j.number, 'status', inv.status,
    'subtotal_cents', inv.subtotal_cents, 'discount_cents', inv.discount_cents,
    'tax_cents', inv.tax_cents, 'credit_cents', inv.credit_cents, 'total_cents', inv.total_cents,
    'amount_paid_cents', inv.amount_paid_cents,
    'balance_cents', greatest(inv.total_cents - inv.amount_paid_cents, 0),
    'due_date', inv.due_date, 'notes', inv.notes, 'sent_at', inv.sent_at, 'paid_at', inv.paid_at,
    'company', jsonb_build_object(
      'name', co.name, 'legal_name', co.legal_name, 'phone', co.phone, 'email', co.email,
      'address', concat_ws(', ', nullif(co.address_line1, ''), nullif(co.city, ''),
                           nullif(concat_ws(' ', co.state, co.postal_code), '')),
      'logo_path', co.logo_path, 'brand_primary', co.brand_primary, 'timezone', co.timezone,
      'tax_rate_bps', coalesce((co.settings ->> 'tax_rate_bps')::int, 0)),
    'property', (select jsonb_build_object(
        'address', concat_ws(', ', p.address_line1, p.city, concat_ws(' ', p.state, p.postal_code)))
      from public.property p where p.id = j.property_id),
    'customer', (select jsonb_build_object('name', c.name, 'email', c.email)
      from public.customer c where c.id = j.bill_to_customer_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'kind', l.kind, 'description', l.description, 'quantity', l.quantity,
        'unit_price_cents', l.unit_price_cents, 'taxable', l.taxable,
        'warranty_months', l.warranty_months)
        order by l.sort_order, l.id)
      from public.invoice_line_item l where l.invoice_id = inv.id and l.deleted_at is null), '[]'),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'amount_cents', p.amount_cents,
                                          'method', p.method, 'check_number', p.check_number,
                                          'status', p.status, 'paid_at', p.paid_at)
                       order by p.paid_at nulls last, p.created_at, p.id)
      from public.payment p where p.invoice_id = inv.id and p.deleted_at is null), '[]'),
    'can_pay', exists (select 1 from public.stripe_account a
                       where a.company_id = inv.company_id and a.charges_enabled));
end
$$;
