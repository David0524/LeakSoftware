-- Autopay and Pay Over Time (docs/design/2026-11-16-autopay.md).
--
--   * customer_payment_method: the card or bank account a customer saved with the shop, as a
--     summary only (Visa •••• 4242, expiry, bank name) and Stripe's ids. Stripe holds the card;
--     the server writes these rows after a webhook. Owners and admins read them (and their
--     phones keep them); nobody writes them through the API. One live method per customer: a
--     new one replaces the old.
--   * customer.autopay (server-written): the customer agreed to be charged automatically. It
--     turns on when they save a method with "Save for Autopay" or from a Request Card on File
--     link; the office turns it off (or back on) through the server.
--   * invoice.autopay_*: the latest automatic charge on an invoice (processing, succeeded,
--     failed), the method's label, the failure, how many tries, and when the next try is.
--   * app.stripe_customer: each customer's Stripe Customer on the shop's connected account.
--   * app.card_request: Request Card on File links (/card/<token>), 30 days.
--   * Settings (company.settings, owners and admins, synced): autopay (default on),
--     autopay_retries (0 to 3, default 2), autopay_retry_days (1 to 14, default 3),
--     pay_over_time (default on). Read by the server; nothing here enforces them.

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------

alter table public.customer add column autopay boolean not null default false;

alter table public.invoice
  add column autopay_status text check (autopay_status in ('processing', 'succeeded', 'failed')),
  add column autopay_method text check (autopay_method is null or length(autopay_method) <= 60),
  add column autopay_failure text check (autopay_failure is null or length(autopay_failure) <= 300),
  add column autopay_tries integer not null default 0 check (autopay_tries between 0 and 20),
  add column autopay_next_try date,
  add column autopay_at timestamptz;
create index invoice_autopay_retry_idx on public.invoice (autopay_next_try)
  where autopay_status = 'failed' and autopay_next_try is not null;

create table public.customer_payment_method (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  customer_id uuid not null,
  kind text not null check (kind in ('card', 'us_bank_account')),
  -- Stripe's card brand ("visa", "amex"), or null for a bank account.
  brand text check (brand is null or length(brand) <= 30),
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  exp_month integer check (exp_month between 1 and 12),
  exp_year integer check (exp_year between 2000 and 2200),
  bank_name text check (bank_name is null or length(bank_name) <= 80),
  stripe_account_id text not null,
  stripe_customer_id text not null,
  stripe_payment_method_id text not null unique,
  foreign key (customer_id, company_id) references public.customer (id, company_id)
);
select app.make_synced('public.customer_payment_method');
create unique index customer_payment_method_one_live on public.customer_payment_method (customer_id)
  where deleted_at is null;

-- Access: as the registry generates it (20261012000600_access.sql). Managers read; the server
-- writes (no insert or update columns).
insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values ('customer_payment_method', 'manager', 'none', null, null, true, 205);
grant select on public.customer_payment_method to authenticated;
create policy customer_payment_method_select on public.customer_payment_method for select
  to authenticated using (app.is_manager(company_id));
select app.speed_up_policies();

create table app.stripe_customer (
  customer_id uuid not null references public.customer (id) on delete cascade,
  stripe_account_id text not null,
  stripe_customer_id text not null,
  created_at timestamptz not null default now(),
  primary key (customer_id, stripe_account_id)
);

create table app.card_request (
  token text primary key default encode(extensions.gen_random_bytes(16), 'hex'),
  company_id uuid not null references public.company (id) on delete cascade,
  customer_id uuid not null references public.customer (id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz
);
create index card_request_customer_idx on app.card_request (customer_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/** "Visa •••• 4242", "Chase •••• 6789", "Bank account •••• 6789" (core savedMethodLabel). */
create or replace function app.payment_method_label(m public.customer_payment_method) returns text
language sql immutable as $$
  select case
    when m.kind = 'card' then
      coalesce(case lower(m.brand)
        when 'visa' then 'Visa' when 'mastercard' then 'Mastercard'
        when 'amex' then 'American Express' when 'discover' then 'Discover'
        when 'diners' then 'Diners Club' when 'jcb' then 'JCB' when 'unionpay' then 'UnionPay'
        else null end, 'Card') || ' •••• ' || m.last4
    else coalesce(nullif(btrim(m.bank_name), ''), 'Bank account') || ' •••• ' || m.last4
  end
$$;

/** The service role, or a manager of the shop. */
create or replace function app.server_or_manager(target_company uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select current_setting('role', true) = 'service_role' or app.is_manager(target_company)
$$;

-- ---------------------------------------------------------------------------
-- What the server needs to charge an invoice
-- ---------------------------------------------------------------------------

/**
 * An invoice's autopay picture: who pays, what's owed, the saved method, the shop's account
 * and settings. The server (service role) for automatic charges; owners and admins for Charge
 * Card on File. Null when the invoice isn't found.
 */
create or replace function public.autopay_details(target_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  cust uuid;
  m public.customer_payment_method;
begin
  select * into inv from public.invoice where id = target_invoice and deleted_at is null;
  if inv.id is null or not app.server_or_manager(inv.company_id) then
    raise exception 'Invoice not found' using errcode = 'insufficient_privilege';
  end if;
  cust := coalesce(inv.customer_id, (select bill_to_customer_id from public.job where id = inv.job_id));
  select * into m from public.customer_payment_method
  where customer_id = cust and deleted_at is null;
  return (
    select jsonb_build_object(
      'invoice_id', inv.id, 'company_id', inv.company_id, 'job_id', inv.job_id,
      'number', inv.number, 'status', inv.status, 'monthly', inv.period_month is not null,
      'balance_cents', greatest(inv.total_cents - inv.amount_paid_cents, 0),
      'autopay_status', inv.autopay_status, 'autopay_tries', inv.autopay_tries,
      'payment_pending', exists (select 1 from public.payment p where p.invoice_id = inv.id
                                 and p.status = 'pending' and p.deleted_at is null),
      'company_name', co.name, 'settings', co.settings, 'timezone', co.timezone,
      'stripe_account_id', sa.stripe_account_id,
      'charges_enabled', coalesce(sa.charges_enabled, false),
      'customer', (select jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email,
                                             'autopay', c.autopay)
                   from public.customer c where c.id = cust),
      'method', case when m.id is null then null else jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'brand', m.brand, 'last4', m.last4,
        'exp_month', m.exp_month, 'exp_year', m.exp_year, 'bank_name', m.bank_name,
        'label', app.payment_method_label(m), 'stripe_account_id', m.stripe_account_id,
        'stripe_customer_id', m.stripe_customer_id,
        'stripe_payment_method_id', m.stripe_payment_method_id) end)
    from public.company co
    left join public.stripe_account sa on sa.company_id = co.id
    where co.id = inv.company_id);
end
$$;

/**
 * Records an automatic or office charge's outcome (service role). 'succeeded' and
 * 'processing' (bank payments) add the payment; 'failed' adds none. Each call is one try.
 * Returns {paid_now, status}.
 */
create or replace function public.autopay_record(
  target_invoice uuid, outcome text, intent_id text, amount integer, pay_method text,
  method_label text, failure text, next_try date, paid_account text)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
  paid_now boolean := false;
begin
  if outcome not in ('processing', 'succeeded', 'failed') then
    raise exception 'Unknown outcome %', outcome using errcode = 'invalid_parameter_value';
  end if;
  select * into inv from public.invoice where id = target_invoice for update;
  if inv.id is null then
    raise exception 'Invoice % not found', target_invoice using errcode = 'invalid_parameter_value';
  end if;
  -- Only a charge on the invoice's own shop's account counts (as Checkout payments).
  if outcome <> 'failed' and (paid_account is null or paid_account is distinct from (
       select stripe_account_id from public.stripe_account where company_id = inv.company_id)) then
    return jsonb_build_object('paid_now', false, 'status', inv.status);
  end if;
  if outcome <> 'failed' and intent_id is not null and amount > 0
     and not exists (select 1 from public.payment where stripe_payment_intent_id = intent_id) then
    insert into public.payment (company_id, invoice_id, amount_cents, method, status,
                                stripe_payment_intent_id, paid_at)
    values (inv.company_id, inv.id, amount, pay_method,
            case when outcome = 'succeeded' then 'succeeded' else 'pending' end, intent_id,
            case when outcome = 'succeeded' then now() end);
    paid_now := app.refresh_invoice(inv.id);
  end if;
  perform set_config('app.invoice_server', 'on', true);
  update public.invoice
  set autopay_status = outcome, autopay_method = left(method_label, 60),
      autopay_failure = case when outcome = 'failed' then left(failure, 300) end,
      autopay_tries = least(autopay_tries + 1, 20),
      autopay_next_try = case when outcome = 'failed' then next_try end,
      autopay_at = now()
  where id = inv.id;
  perform set_config('app.invoice_server', 'off', true);
  return jsonb_build_object('paid_now', paid_now,
                            'status', (select status from public.invoice where id = inv.id));
end
$$;

/**
 * A bank payment Stripe settled later (payment_intent.succeeded or .payment_failed on the
 * shop's account; service role). Returns {invoice_id, company_id, paid_now, changed}, or null
 * for an unknown intent. A payment never goes back from succeeded or failed.
 */
create or replace function public.autopay_settle(intent_id text, pay_status text,
  paid_account text, failure text, next_try date)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  p public.payment;
  paid_now boolean := false;
begin
  select * into p from public.payment where stripe_payment_intent_id = intent_id for update;
  if p.id is null or p.invoice_id is null or paid_account is distinct from (
       select stripe_account_id from public.stripe_account where company_id = p.company_id) then
    return null;
  end if;
  if p.status <> 'pending' or pay_status not in ('succeeded', 'failed') then
    return jsonb_build_object('invoice_id', p.invoice_id, 'company_id', p.company_id,
                              'paid_now', false, 'changed', false);
  end if;
  update public.payment
  set status = pay_status, paid_at = case when pay_status = 'succeeded' then now() end
  where id = p.id;
  paid_now := app.refresh_invoice(p.invoice_id);
  perform set_config('app.invoice_server', 'on', true);
  update public.invoice
  set autopay_status = pay_status,
      autopay_failure = case when pay_status = 'failed' then left(failure, 300) end,
      autopay_next_try = case when pay_status = 'failed' then next_try end
  where id = p.invoice_id and autopay_status = 'processing';
  perform set_config('app.invoice_server', 'off', true);
  return jsonb_build_object('invoice_id', p.invoice_id, 'company_id', p.company_id,
                            'paid_now', paid_now, 'changed', true);
end
$$;

/**
 * The daily run (service role): failed automatic charges whose next try has come, still owed,
 * with the customer's autopay and saved method still on. Each is handed out once a day: its
 * next try is cleared as it goes (the charge sets the one after).
 */
create or replace function public.autopay_retries_due(at timestamptz default now())
returns table (invoice_id uuid, company_id uuid)
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform set_config('app.invoice_server', 'on', true);
  return query
  with due as (
    select i.id
    from public.invoice i
    join public.company co on co.id = i.company_id
    join public.customer c on c.id = coalesce(i.customer_id,
                                              (select bill_to_customer_id from public.job j
                                               where j.id = i.job_id))
    where i.autopay_status = 'failed' and i.autopay_next_try is not null
      and i.autopay_next_try <= (at at time zone co.timezone)::date
      and i.status in ('sent', 'partially_paid') and i.deleted_at is null
      and c.autopay
      and exists (select 1 from public.customer_payment_method m
                  where m.customer_id = c.id and m.deleted_at is null)
    for update of i skip locked
  ),
  marked as (
    update public.invoice i set autopay_next_try = null
    from due where i.id = due.id
    returning i.id, i.company_id
  )
  select m.id, m.company_id from marked m;
  perform set_config('app.invoice_server', 'off', true);
end
$$;

/**
 * A payment from an autopay or office charge succeeded: claims its push, as
 * claim_payment_notification does for Checkout payments (20261022000200_feedback_loops.sql).
 */
create or replace function public.claim_intent_notification(intent_id text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  p public.payment;
  a public.activity;
begin
  select * into p from public.payment
  where stripe_payment_intent_id = intent_id and status = 'succeeded' and deleted_at is null;
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

-- ---------------------------------------------------------------------------
-- Saving a card or bank account
-- ---------------------------------------------------------------------------

/** The customer's Stripe Customer on this account, if made (service role). */
create or replace function public.stripe_customer_for(target_customer uuid, account text)
returns text
language sql stable security definer set search_path = public, app, pg_temp as $$
  select stripe_customer_id from app.stripe_customer
  where customer_id = target_customer and stripe_account_id = account
$$;

create or replace function public.stripe_save_customer(target_customer uuid, account text,
  stripe_customer text)
returns void
language sql security definer set search_path = public, app, pg_temp as $$
  insert into app.stripe_customer (customer_id, stripe_account_id, stripe_customer_id)
  values (target_customer, account, stripe_customer)
  on conflict (customer_id, stripe_account_id) do nothing
$$;

/**
 * A method the customer saved (webhook; service role). Only on the customer's own shop's
 * account. Replaces the live one (returned, for the server to detach in Stripe) and turns
 * autopay on when they agreed to it. Returns {replaced: [payment method ids], label}, or null
 * when it doesn't belong to the shop.
 */
create or replace function public.autopay_save_method(
  target_customer uuid, account text, stripe_customer text, payment_method text, method_kind text,
  card_brand text, last_four text, month integer, year integer, bank text, turn_on boolean)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c public.customer;
  replaced text[];
  saved public.customer_payment_method;
begin
  select * into c from public.customer where id = target_customer and deleted_at is null;
  if c.id is null or account is distinct from (
       select stripe_account_id from public.stripe_account where company_id = c.company_id) then
    return null;
  end if;
  select coalesce(array_agg(stripe_payment_method_id), '{}') into replaced
  from public.customer_payment_method
  where customer_id = c.id and deleted_at is null and stripe_payment_method_id <> payment_method;
  update public.customer_payment_method set deleted_at = now()
  where customer_id = c.id and deleted_at is null and stripe_payment_method_id <> payment_method;
  insert into public.customer_payment_method (company_id, customer_id, kind, brand, last4,
    exp_month, exp_year, bank_name, stripe_account_id, stripe_customer_id,
    stripe_payment_method_id)
  values (c.company_id, c.id, method_kind, lower(card_brand), last_four, month, year, bank,
          account, stripe_customer, payment_method)
  on conflict (stripe_payment_method_id) do update set deleted_at = null
  returning * into saved;
  if turn_on then
    update public.customer set autopay = true where id = c.id;
  end if;
  update app.card_request set used_at = now()
  where customer_id = c.id and used_at is null and expires_at > now();
  return jsonb_build_object('replaced', to_jsonb(replaced),
                            'label', app.payment_method_label(saved));
end
$$;

/** Turn Off / Turn On (owners and admins). On needs a saved method. */
create or replace function public.set_customer_autopay(target_customer uuid, turn_on boolean)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c public.customer;
begin
  select * into c from public.customer where id = target_customer and deleted_at is null;
  if c.id is null or not app.is_manager(c.company_id) then
    raise exception 'Only owners and admins can change autopay' using errcode = 'insufficient_privilege';
  end if;
  if turn_on and not exists (select 1 from public.customer_payment_method
                             where customer_id = c.id and deleted_at is null) then
    raise exception 'Save a card or bank account first' using errcode = 'check_violation';
  end if;
  update public.customer set autopay = turn_on where id = c.id;
end
$$;

/**
 * Remove Card (owners and admins): the saved method goes and autopay turns off. Returns
 * {stripe_account_id, stripe_payment_method_id} for the server to detach it in Stripe, or null
 * when there was none.
 */
create or replace function public.remove_payment_method(target_customer uuid) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c public.customer;
  m public.customer_payment_method;
begin
  select * into c from public.customer where id = target_customer and deleted_at is null;
  if c.id is null or not app.is_manager(c.company_id) then
    raise exception 'Only owners and admins can remove a saved card' using errcode = 'insufficient_privilege';
  end if;
  update public.customer set autopay = false where id = c.id;
  update public.customer_payment_method set deleted_at = now()
  where customer_id = c.id and deleted_at is null
  returning * into m;
  if m.id is null then
    return null;
  end if;
  return jsonb_build_object('stripe_account_id', m.stripe_account_id,
                            'stripe_payment_method_id', m.stripe_payment_method_id);
end
$$;

/**
 * Request Card on File (owners and admins): the customer's link, reusing an unused one with at
 * least a week left. Returns {token, name, email, phone, company_name}.
 */
create or replace function public.card_request_link(target_customer uuid) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c public.customer;
  t text;
begin
  select * into c from public.customer where id = target_customer and deleted_at is null;
  if c.id is null or not app.is_manager(c.company_id) then
    raise exception 'Only owners and admins can request a card' using errcode = 'insufficient_privilege';
  end if;
  select token into t from app.card_request
  where customer_id = c.id and used_at is null and expires_at > now() + interval '7 days'
  order by created_at desc limit 1;
  if t is null then
    insert into app.card_request (company_id, customer_id, created_by)
    values (c.company_id, c.id, auth.uid()) returning token into t;
  end if;
  return jsonb_build_object('token', t, 'customer_id', c.id, 'name', c.name, 'email', c.email,
    'phone', c.phone, 'company_name', (select name from public.company where id = c.company_id));
end
$$;

/** The Request Card on File page (service role): who, which shop, and what's saved now. */
create or replace function public.card_request_details(link_token text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object(
    'company_id', co.id, 'customer_id', c.id, 'customer_name', c.name, 'customer_email', c.email,
    'company', jsonb_build_object('name', co.name, 'phone', co.phone, 'email', co.email,
                                  'logo_path', co.logo_path, 'brand_primary', co.brand_primary,
                                  'settings', co.settings),
    'stripe_account_id', sa.stripe_account_id,
    'charges_enabled', coalesce(sa.charges_enabled, false),
    'saved', (select app.payment_method_label(m) from public.customer_payment_method m
              where m.customer_id = c.id and m.deleted_at is null),
    'autopay', c.autopay)
  from app.card_request r
  join public.customer c on c.id = r.customer_id and c.deleted_at is null
  join public.company co on co.id = r.company_id
  left join public.stripe_account sa on sa.company_id = co.id
  where r.token = link_token and r.expires_at > now()
$$;

/**
 * The customer's invoice page (anyone with the link): how autopay stands on it, and whether
 * the customer already pays automatically, so the page offers Save for Autopay only when it
 * would change something.
 */
create or replace function public.invoice_autopay_for_token(link_token text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select jsonb_build_object(
    'status', i.autopay_status, 'method', i.autopay_method,
    'customer_autopay', coalesce(c.autopay, false)
      and exists (select 1 from public.customer_payment_method m
                  where m.customer_id = c.id and m.deleted_at is null),
    'customer_id', c.id,
    'shop_autopay', coalesce((co.settings ->> 'autopay')::boolean, true))
  from public.share_link sl
  join public.invoice i on i.id = sl.invoice_id and i.deleted_at is null
  join public.company co on co.id = i.company_id
  left join public.customer c on c.id = coalesce(i.customer_id,
    (select bill_to_customer_id from public.job j where j.id = i.job_id))
  where sl.token = link_token and sl.revoked_at is null and sl.deleted_at is null
    and (sl.expires_at is null or sl.expires_at > now())
$$;

revoke all on function app.payment_method_label(public.customer_payment_method),
  app.server_or_manager(uuid) from public;
grant execute on function app.server_or_manager(uuid) to authenticated, service_role;
grant execute on function app.payment_method_label(public.customer_payment_method)
  to authenticated, service_role;
revoke all on function public.autopay_details(uuid),
  public.autopay_record(uuid, text, text, integer, text, text, text, date, text),
  public.autopay_settle(text, text, text, text, date),
  public.autopay_retries_due(timestamptz), public.claim_intent_notification(text),
  public.stripe_customer_for(uuid, text), public.stripe_save_customer(uuid, text, text),
  public.autopay_save_method(uuid, text, text, text, text, text, text, integer, integer, text, boolean),
  public.set_customer_autopay(uuid, boolean), public.remove_payment_method(uuid),
  public.card_request_link(uuid), public.card_request_details(text),
  public.invoice_autopay_for_token(text)
  from public, anon, authenticated;
grant execute on function public.autopay_details(uuid), public.set_customer_autopay(uuid, boolean),
  public.remove_payment_method(uuid), public.card_request_link(uuid) to authenticated;
grant execute on function public.invoice_autopay_for_token(text) to anon, authenticated;
grant execute on function public.autopay_details(uuid),
  public.autopay_record(uuid, text, text, integer, text, text, text, date, text),
  public.autopay_settle(text, text, text, text, date),
  public.autopay_retries_due(timestamptz), public.claim_intent_notification(text),
  public.stripe_customer_for(uuid, text), public.stripe_save_customer(uuid, text, text),
  public.autopay_save_method(uuid, text, text, text, text, text, text, integer, integer, text, boolean),
  public.card_request_details(text), public.invoice_autopay_for_token(text) to service_role;
