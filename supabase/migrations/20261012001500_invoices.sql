-- Invoices and payment (M9, BUILD_PLAN 6.4): an invoice from a job (the detection fee, or the
-- accepted quote's work with its deposit credited), sending, the customer invoice page, card
-- and bank payment through Stripe, payments the office records (check, cash), receipts, and
-- void.
--
-- Totals are computed here when an invoice is sent, with the same rules as
-- packages/core/src/invoice.ts (supabase/tests/110_invoices.test.sql checks the same figures).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- The accepted quote's discount carries over; the office can change it on a draft.
alter table public.invoice
  add column discount_cents integer not null default 0 check (discount_cents >= 0),
  -- Deposits and other credits, as a positive amount taken off the total.
  add column credit_cents integer not null default 0 check (credit_cents >= 0),
  add column voided_at timestamptz;

update app.sync_table
set insert_columns = insert_columns || '{discount_cents}',
    update_columns = update_columns || '{discount_cents}'
where table_name = 'invoice';
grant insert (discount_cents), update (discount_cents) on public.invoice to authenticated;

-- ---------------------------------------------------------------------------
-- Sent invoices are frozen
-- ---------------------------------------------------------------------------

-- Server functions set this for their own transaction to change a sent invoice.
create or replace function app.invoice_server_write() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.invoice_server', true), '') = 'on'
$$;

create or replace function app.freeze_sent_invoice() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' and not app.invoice_server_write() then
    raise exception 'Invoice % has been sent and cannot be changed', old.id
      using errcode = 'check_violation';
  end if;
  -- Only the server sends, pays, or voids.
  if new.status is distinct from old.status and not app.invoice_server_write() then
    raise exception 'Invoice status is set by the server' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger freeze_sent_invoice before update on public.invoice
  for each row execute function app.freeze_sent_invoice();

create or replace function app.freeze_sent_invoice_lines() returns trigger
language plpgsql as $$
declare
  st text;
begin
  select status into st from public.invoice
  where id = case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  if st is not null and st <> 'draft' and not app.invoice_server_write() then
    raise exception 'This invoice has been sent; its lines cannot change'
      using errcode = 'check_violation';
  end if;
  -- Deposit credits come from recorded payments, never from the app.
  if tg_op <> 'DELETE' and new.kind = 'deposit_credit' and not app.invoice_server_write()
     and (tg_op = 'INSERT' or old.unit_price_cents <> new.unit_price_cents
          or old.quantity <> new.quantity or old.kind <> new.kind) then
    raise exception 'Deposit credits are added by the server' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger freeze_sent_invoice_lines
  before insert or update or delete on public.invoice_line_item
  for each row execute function app.freeze_sent_invoice_lines();

-- ---------------------------------------------------------------------------
-- Totals
-- ---------------------------------------------------------------------------

-- {subtotal_cents, discount_cents, tax_cents, credit_cents, total_cents} for an invoice's live
-- lines: items are taxed like quote lines (discount shared before tax); deposit credits come
-- off after tax.
create or replace function app.invoice_totals(target_invoice uuid) returns jsonb
language plpgsql stable set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  rate numeric;
  subtotal bigint;
  taxable_sum bigint;
  credit bigint;
  discount bigint;
  taxable_discount bigint;
  tax bigint;
begin
  select * into inv from public.invoice where id = target_invoice;
  select coalesce((settings ->> 'tax_rate_bps')::numeric, 0) into rate
  from public.company where id = inv.company_id;
  select coalesce(sum(round(round(quantity * 100) * unit_price_cents / 100.0)) filter (where kind = 'item'), 0),
         coalesce(sum(round(round(quantity * 100) * unit_price_cents / 100.0)) filter (where kind = 'item' and taxable), 0),
         coalesce(-sum(round(round(quantity * 100) * unit_price_cents / 100.0)) filter (where kind = 'deposit_credit'), 0)
  into subtotal, taxable_sum, credit
  from public.invoice_line_item where invoice_id = target_invoice and deleted_at is null;
  discount := least(greatest(inv.discount_cents, 0), subtotal);
  taxable_discount := case when subtotal = 0 then 0 else round(discount * taxable_sum / subtotal::numeric) end;
  tax := round((taxable_sum - taxable_discount) * rate / 10000);
  return jsonb_build_object('subtotal_cents', subtotal, 'discount_cents', discount,
                            'tax_cents', tax, 'credit_cents', credit,
                            'total_cents', subtotal - discount + tax - credit);
end
$$;

-- Paid so far, status, and the job's status, from the invoice's succeeded payments. Returns
-- true when this call made the invoice paid in full.
create or replace function app.refresh_invoice(target_invoice uuid) returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  paid bigint;
  next_status text;
begin
  select * into inv from public.invoice where id = target_invoice for update;
  if inv.status in ('draft', 'void') then
    return false;
  end if;
  select coalesce(sum(amount_cents), 0) into paid from public.payment
  where invoice_id = inv.id and status = 'succeeded' and deleted_at is null;
  next_status := case when paid >= inv.total_cents then 'paid'
                      when paid > 0 then 'partially_paid'
                      else 'sent' end;
  perform set_config('app.invoice_server', 'on', true);
  update public.invoice
  set amount_paid_cents = paid, status = next_status,
      paid_at = case when next_status = 'paid' then coalesce(paid_at, now()) end
  where id = inv.id;
  perform set_config('app.invoice_server', 'off', true);
  if next_status = 'paid' then
    update public.job set status = 'paid' where id = inv.job_id and status = 'invoiced';
  end if;
  return next_status = 'paid' and inv.status <> 'paid';
end
$$;

-- ---------------------------------------------------------------------------
-- Creating an invoice from a job
-- ---------------------------------------------------------------------------

-- The job's invoice draft, made once: a detection job's fee, or a repair job's accepted quote
-- (its lines and discount) with the deposit paid on it as a credit. Returns the invoice id;
-- calling it again returns the job's open invoice.
create or replace function public.create_invoice(target_job uuid) returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  j public.job;
  q public.quote;
  inv uuid;
  deposit bigint;
begin
  select * into j from public.job where id = target_job and deleted_at is null for update;
  if j.id is null or not app.is_member(j.company_id) then
    raise exception 'Job not found' using errcode = 'insufficient_privilege';
  end if;
  select id into inv from public.invoice
  where job_id = j.id and status <> 'void' and deleted_at is null order by created_at limit 1;
  if inv is not null then
    return inv;
  end if;
  if j.status in ('unscheduled', 'scheduled', 'canceled') then
    raise exception 'Start the job before invoicing it' using errcode = 'check_violation';
  end if;

  select * into q from public.quote
  where repair_job_id = j.id and status = 'accepted' and deleted_at is null
  order by accepted_at desc limit 1;
  if q.id is not null and exists (select 1 from public.payment where quote_id = q.id
                                  and status = 'pending' and deleted_at is null) then
    raise exception 'The deposit is still clearing. Create the invoice once it has cleared.'
      using errcode = 'check_violation', hint = 'deposit_pending';
  end if;

  insert into public.invoice (company_id, job_id, quote_id, discount_cents)
  values (j.company_id, j.id, q.id, coalesce(q.discount_cents, 0))
  returning id into inv;

  if j.fee_cents is not null and j.fee_cents > 0 then
    insert into public.invoice_line_item (company_id, invoice_id, description, unit_price_cents,
                                          taxable, sort_order)
    values (j.company_id, inv, 'Leak detection', j.fee_cents, false, 0);
  end if;
  if q.id is not null then
    insert into public.invoice_line_item (company_id, invoice_id, description, quantity,
                                          unit_price_cents, taxable, warranty_months, sort_order)
    select j.company_id, inv, l.description, l.quantity, l.unit_price_cents, l.taxable,
           l.warranty_months, 10 + row_number() over (order by l.sort_order, l.id)
    from public.quote_line_item l where l.quote_id = q.id and l.deleted_at is null;

    select coalesce(sum(amount_cents), 0) into deposit from public.payment
    where quote_id = q.id and status = 'succeeded' and deleted_at is null;
    if deposit > 0 then
      perform set_config('app.invoice_server', 'on', true);
      insert into public.invoice_line_item (company_id, invoice_id, kind, description,
                                            unit_price_cents, taxable, sort_order)
      values (j.company_id, inv, 'deposit_credit',
              'Deposit paid on quote #' || coalesce(q.number::text, ''), -deposit, false, 1000);
      perform set_config('app.invoice_server', 'off', true);
    end if;
  end if;
  return inv;
end
$$;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- Sends a draft invoice (or returns the link of one already sent): totals locked, due on
-- receipt unless a due date was set, a customer link, and the job moves to "invoiced" (or
-- straight to "paid" when credits cover it). Returns {token, invoice_id, number, status}.
create or replace function public.send_invoice(target_invoice uuid) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  j public.job;
  t jsonb;
  tz text;
  link text;
begin
  select * into inv from public.invoice where id = target_invoice and deleted_at is null for update;
  if inv.id is null or not app.is_member(inv.company_id) then
    raise exception 'Invoice not found' using errcode = 'insufficient_privilege';
  end if;
  if inv.status = 'void' then
    raise exception 'This invoice was voided' using errcode = 'check_violation';
  end if;
  if inv.status = 'draft' then
    select * into j from public.job where id = inv.job_id;
    if j.status in ('unscheduled', 'scheduled', 'canceled') then
      raise exception 'Start the job before invoicing it' using errcode = 'check_violation';
    end if;
    t := app.invoice_totals(inv.id);
    if (t ->> 'subtotal_cents')::bigint <= 0 then
      raise exception 'Add at least one line with a price' using errcode = 'check_violation';
    end if;
    if (t ->> 'total_cents')::bigint < 0 then
      raise exception 'The credits are more than the invoice' using errcode = 'check_violation';
    end if;
    select timezone into tz from public.company where id = inv.company_id;
    perform set_config('app.invoice_server', 'on', true);
    update public.invoice
    set subtotal_cents = (t ->> 'subtotal_cents')::int,
        discount_cents = (t ->> 'discount_cents')::int,
        tax_cents = (t ->> 'tax_cents')::int,
        credit_cents = (t ->> 'credit_cents')::int,
        total_cents = (t ->> 'total_cents')::int,
        due_date = coalesce(due_date, (now() at time zone tz)::date),
        status = 'sent', sent_at = now()
    where id = inv.id;
    perform set_config('app.invoice_server', 'off', true);
    update public.job set status = 'invoiced', completed_at = coalesce(completed_at, now())
    where id = j.id and status in ('in_progress', 'report_sent', 'quote_sent', 'quote_accepted');
    perform app.refresh_invoice(inv.id);
  end if;
  select token into link from public.share_link
  where invoice_id = inv.id and revoked_at is null and deleted_at is null order by id limit 1;
  if link is null then
    insert into public.share_link (company_id, job_id, invoice_id)
    values (inv.company_id, inv.job_id, inv.id) returning token into link;
  end if;
  select * into inv from public.invoice where id = inv.id;
  return jsonb_build_object('token', link, 'invoice_id', inv.id, 'number', inv.number,
                            'status', inv.status);
end
$$;

-- Voids an invoice nobody has paid on. Owners only once it was sent. The link then shows it
-- as void, and the job can be invoiced again.
create or replace function public.void_invoice(target_invoice uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
begin
  select * into inv from public.invoice where id = target_invoice and deleted_at is null for update;
  if inv.id is null or not app.is_member(inv.company_id) then
    raise exception 'Invoice not found' using errcode = 'insufficient_privilege';
  end if;
  if inv.status <> 'draft' and not app.is_owner(inv.company_id) then
    raise exception 'Only owners can void a sent invoice' using errcode = 'insufficient_privilege';
  end if;
  if inv.status = 'void' then
    return;
  end if;
  if exists (select 1 from public.payment where invoice_id = inv.id
             and status in ('pending', 'succeeded') and deleted_at is null) then
    raise exception 'This invoice has payments and cannot be voided' using errcode = 'check_violation';
  end if;
  perform set_config('app.invoice_server', 'on', true);
  update public.invoice set status = 'void', voided_at = now() where id = inv.id;
  perform set_config('app.invoice_server', 'off', true);
end
$$;

-- ---------------------------------------------------------------------------
-- Payments the office records (check, cash, or anything outside Stripe)
-- ---------------------------------------------------------------------------

-- Owners only. Returns {status, paid_now}.
create or replace function public.record_invoice_payment(target_invoice uuid, amount integer)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  balance bigint;
  paid_now boolean;
begin
  select * into inv from public.invoice where id = target_invoice and deleted_at is null for update;
  if inv.id is null or not app.is_member(inv.company_id) then
    raise exception 'Invoice not found' using errcode = 'insufficient_privilege';
  end if;
  if not app.is_owner(inv.company_id) then
    raise exception 'Only owners can record payments' using errcode = 'insufficient_privilege';
  end if;
  if inv.status not in ('sent', 'partially_paid') then
    raise exception 'Send the invoice before recording a payment' using errcode = 'check_violation';
  end if;
  balance := inv.total_cents - inv.amount_paid_cents;
  if amount is null or amount <= 0 or amount > balance then
    raise exception 'Enter an amount up to the balance due' using errcode = 'check_violation';
  end if;
  insert into public.payment (company_id, invoice_id, amount_cents, method, status, paid_at)
  values (inv.company_id, inv.id, amount, 'other', 'succeeded', now());
  paid_now := app.refresh_invoice(inv.id);
  return jsonb_build_object('status', (select status from public.invoice where id = inv.id),
                            'paid_now', paid_now);
end
$$;

-- ---------------------------------------------------------------------------
-- Customer page (/i/{token})
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
      select jsonb_agg(jsonb_build_object('amount_cents', p.amount_cents, 'method', p.method,
                                          'status', p.status, 'paid_at', p.paid_at)
                       order by p.id)
      from public.payment p where p.invoice_id = inv.id and p.deleted_at is null), '[]'),
    'can_pay', exists (select 1 from public.stripe_account a
                       where a.company_id = inv.company_id and a.charges_enabled));
end
$$;

-- ---------------------------------------------------------------------------
-- Stripe and email (called by the server)
-- ---------------------------------------------------------------------------

-- What the server needs to start a checkout for an invoice link's balance.
create or replace function public.invoice_checkout_details(link_token text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'invoice_id', i.id, 'company_id', i.company_id, 'job_id', i.job_id, 'number', i.number,
    'status', i.status, 'balance_cents', greatest(i.total_cents - i.amount_paid_cents, 0),
    'company_name', co.name, 'customer_email', c.email,
    'stripe_account_id', a.stripe_account_id, 'charges_enabled', coalesce(a.charges_enabled, false),
    'payment_pending', exists (select 1 from public.payment p where p.invoice_id = i.id
                               and p.status = 'pending' and p.deleted_at is null))
  from public.share_link sl
  join public.invoice i on i.id = sl.invoice_id and i.deleted_at is null
  join public.company co on co.id = i.company_id
  join public.job j on j.id = i.job_id
  left join public.customer c on c.id = j.bill_to_customer_id
  left join public.stripe_account a on a.company_id = i.company_id
  where sl.token = link_token and sl.revoked_at is null and sl.deleted_at is null
    and (sl.expires_at is null or sl.expires_at > now())
$$;

-- An invoice payment from a Checkout Session, with the same rules as deposits: a payment
-- never moves back to pending. Returns {payment, status, paid_now}.
create or replace function public.stripe_record_invoice_payment(
  target_invoice uuid, session_id text, intent_id text, amount integer, pay_method text,
  pay_status text)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  existing public.payment;
  result text;
  paid_now boolean;
begin
  select * into inv from public.invoice where id = target_invoice;
  if inv.id is null then
    raise exception 'Invoice % not found', target_invoice using errcode = 'invalid_parameter_value';
  end if;
  select * into existing from public.payment where stripe_checkout_session_id = session_id for update;
  if existing.id is null then
    insert into public.payment (company_id, invoice_id, amount_cents, method, status,
                                stripe_checkout_session_id, stripe_payment_intent_id, paid_at)
    values (inv.company_id, inv.id, amount, pay_method, pay_status, session_id, intent_id,
            case when pay_status = 'succeeded' then now() end);
    result := pay_status;
  elsif existing.status = 'pending' and pay_status <> 'pending' then
    update public.payment
    set status = pay_status, stripe_payment_intent_id = coalesce(intent_id, stripe_payment_intent_id),
        paid_at = case when pay_status = 'succeeded' then now() end
    where id = existing.id;
    result := pay_status;
  else
    result := existing.status;
  end if;
  paid_now := app.refresh_invoice(inv.id);
  return jsonb_build_object('payment', result,
                            'status', (select status from public.invoice where id = inv.id),
                            'paid_now', paid_now);
end
$$;

-- Who gets the invoice and receipt emails, and what they say. Members of the invoice's company
-- (sending from the office or phone) and the server (receipts after a webhook).
create or replace function public.invoice_mail_details(target_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
begin
  select * into inv from public.invoice where id = target_invoice and deleted_at is null;
  -- The 'role' setting is the caller's role even inside this security definer function.
  if inv.id is null or (current_setting('role', true) is distinct from 'service_role'
                       and not app.is_member(inv.company_id)) then
    raise exception 'Invoice not found' using errcode = 'insufficient_privilege';
  end if;
  return (
    select jsonb_build_object(
      'invoice_id', inv.id, 'job_id', inv.job_id, 'number', inv.number, 'status', inv.status,
      'total_cents', inv.total_cents, 'amount_paid_cents', inv.amount_paid_cents,
      'balance_cents', greatest(inv.total_cents - inv.amount_paid_cents, 0),
      'due_date', inv.due_date,
      'token', (select token from public.share_link where invoice_id = inv.id
                and revoked_at is null and deleted_at is null order by id limit 1),
      'company', jsonb_build_object('name', co.name, 'email', co.email, 'phone', co.phone),
      'customer', (select jsonb_build_object('name', c.name, 'email', c.email,
                                             'phone', c.phone, 'cc_emails', to_jsonb(c.cc_emails))
                   from public.customer c where c.id = j.bill_to_customer_id),
      'property', (select concat_ws(', ', p.address_line1, p.city) from public.property p
                   where p.id = j.property_id))
    from public.company co, public.job j
    where co.id = inv.company_id and j.id = inv.job_id);
end
$$;

revoke all on function public.create_invoice(uuid), public.send_invoice(uuid),
  public.void_invoice(uuid), public.record_invoice_payment(uuid, integer),
  public.invoice_for_token(text, boolean), public.invoice_checkout_details(text),
  public.stripe_record_invoice_payment(uuid, text, text, integer, text, text),
  public.invoice_mail_details(uuid) from public, anon, authenticated;
revoke all on function app.invoice_totals(uuid), app.refresh_invoice(uuid) from public;
grant execute on function public.create_invoice(uuid), public.send_invoice(uuid),
  public.void_invoice(uuid), public.record_invoice_payment(uuid, integer),
  public.invoice_mail_details(uuid) to authenticated;
grant execute on function public.invoice_for_token(text, boolean) to anon, authenticated;
grant execute on function public.invoice_checkout_details(text),
  public.stripe_record_invoice_payment(uuid, text, text, integer, text, text),
  public.invoice_mail_details(uuid) to service_role;
