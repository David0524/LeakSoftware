-- Quotes and deposits (M8, BUILD_PLAN 6.4): sending, the customer quote page, acceptance
-- online or on site, the repair job it creates, and payments recorded from Stripe webhooks.
--
-- Totals are recomputed here when a quote is sent or accepted, with the same rules as
-- packages/core/src/quote.ts (supabase/tests/090_quotes.test.sql checks the same figures).

-- ---------------------------------------------------------------------------
-- Sent quotes are frozen
-- ---------------------------------------------------------------------------

-- Server functions set this for their own transaction to change a sent quote's status.
create or replace function app.quote_server_write() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.quote_server', true), '') = 'on'
$$;

create or replace function app.freeze_sent_quote() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' and not app.quote_server_write() then
    raise exception 'Quote % has been sent and cannot be changed', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger freeze_sent_quote before update on public.quote
  for each row execute function app.freeze_sent_quote();

create or replace function app.freeze_sent_quote_lines() returns trigger
language plpgsql as $$
declare
  st text;
begin
  select status into st from public.quote
  where id = case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  if st is not null and st <> 'draft' and not app.quote_server_write() then
    raise exception 'This quote has been sent; its lines cannot change'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger freeze_sent_quote_lines before insert or update or delete on public.quote_line_item
  for each row execute function app.freeze_sent_quote_lines();

-- ---------------------------------------------------------------------------
-- Totals
-- ---------------------------------------------------------------------------

-- {subtotal_cents, discount_cents, tax_cents, total_cents, deposit_cents} for a quote's live
-- lines and discount, using the company's tax rate and the given deposit rule.
create or replace function app.quote_totals(target_quote uuid, rule jsonb) returns jsonb
language plpgsql stable set search_path = public, app, pg_temp as $$
declare
  q public.quote;
  rate numeric;
  subtotal bigint;
  taxable_sum bigint;
  discount bigint;
  taxable_discount bigint;
  tax bigint;
  total bigint;
  deposit bigint;
begin
  select * into q from public.quote where id = target_quote;
  select coalesce((settings ->> 'tax_rate_bps')::numeric, 0) into rate
  from public.company where id = q.company_id;
  -- round() on numeric rounds half away from zero, like the TypeScript calculator.
  select coalesce(sum(round(round(quantity * 100) * unit_price_cents / 100.0)), 0),
         coalesce(sum(round(round(quantity * 100) * unit_price_cents / 100.0)) filter (where taxable), 0)
  into subtotal, taxable_sum
  from public.quote_line_item where quote_id = target_quote and deleted_at is null;
  discount := least(greatest(q.discount_cents, 0), subtotal);
  taxable_discount := case when subtotal = 0 then 0 else round(discount * taxable_sum / subtotal::numeric) end;
  tax := round((taxable_sum - taxable_discount) * rate / 10000);
  total := subtotal - discount + tax;
  if total <= 0 then
    deposit := 0;
  else
    deposit := case when rule ->> 'type' = 'fixed'
                    then coalesce((rule ->> 'value_cents')::bigint, 0)
                    else round(total * coalesce((rule ->> 'value_bps')::numeric, 0) / 10000) end;
    deposit := least(total, greatest(deposit, coalesce((rule ->> 'minimum_cents')::bigint, 0)));
  end if;
  return jsonb_build_object('subtotal_cents', subtotal, 'discount_cents', discount,
                            'tax_cents', tax, 'total_cents', total, 'deposit_cents', deposit);
end
$$;

-- Checks a draft and locks in its totals and deposit rule. Raises when it can't be sent.
create or replace function app.finalize_quote(target_quote uuid) returns public.quote
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  q public.quote;
  co public.company;
  rule jsonb;
  t jsonb;
  limit_bps int;
begin
  select * into q from public.quote where id = target_quote for update;
  select * into co from public.company where id = q.company_id;
  rule := coalesce(q.deposit_rule, co.settings -> 'deposit');
  t := app.quote_totals(q.id, rule);
  if (t ->> 'subtotal_cents')::bigint <= 0 then
    raise exception 'Add at least one line with a price' using errcode = 'check_violation';
  end if;
  limit_bps := coalesce((co.settings ->> 'tech_discount_limit_bps')::int, 0);
  if not app.is_owner(q.company_id)
     and ceil((t ->> 'discount_cents')::numeric * 10000 / (t ->> 'subtotal_cents')::numeric) > limit_bps then
    raise exception 'The discount is more than techs can give (% %%). Ask an owner.', limit_bps / 100.0
      using errcode = 'check_violation', hint = 'discount_limit';
  end if;
  perform set_config('app.quote_server', 'on', true);
  update public.quote
  set subtotal_cents = (t ->> 'subtotal_cents')::int,
      discount_cents = (t ->> 'discount_cents')::int,
      tax_cents = (t ->> 'tax_cents')::int,
      total_cents = (t ->> 'total_cents')::int,
      deposit_cents = (t ->> 'deposit_cents')::int,
      deposit_rule = rule,
      valid_until = coalesce(valid_until, (now() at time zone co.timezone)::date + 30)
  where id = q.id
  returning * into q;
  perform set_config('app.quote_server', 'off', true);
  return q;
end
$$;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

-- Sends a draft quote (or returns the link of one already sent): totals locked, a customer
-- link, findings on it marked quoted, and the job moves to "quote sent" after its report.
-- Returns {token, quote_id, number}.
create or replace function public.send_quote(target_quote uuid) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  q public.quote;
  link text;
begin
  select * into q from public.quote where id = target_quote and deleted_at is null for update;
  if q.id is null or not app.is_member(q.company_id) then
    raise exception 'Quote not found' using errcode = 'insufficient_privilege';
  end if;
  if q.status not in ('draft', 'sent') then
    raise exception 'This quote is % and cannot be sent', q.status using errcode = 'check_violation';
  end if;
  if q.status = 'draft' then
    q := app.finalize_quote(q.id);
    perform set_config('app.quote_server', 'on', true);
    update public.quote set status = 'sent', sent_at = now() where id = q.id;
    perform set_config('app.quote_server', 'off', true);
    update public.finding set status = 'quoted'
    where id in (select finding_id from public.quote_line_item
                 where quote_id = q.id and deleted_at is null and finding_id is not null)
      and status = 'open';
    update public.job set status = 'quote_sent' where id = q.job_id and status = 'report_sent';
  end if;
  select token into link from public.share_link
  where quote_id = q.id and revoked_at is null and deleted_at is null order by id limit 1;
  if link is null then
    insert into public.share_link (company_id, job_id, quote_id)
    values (q.company_id, q.job_id, q.id) returning token into link;
  end if;
  return jsonb_build_object('token', link, 'quote_id', q.id, 'number', q.number);
end
$$;

-- ---------------------------------------------------------------------------
-- Acceptance and the repair job
-- ---------------------------------------------------------------------------

-- Accepts a quote (already checked by the caller) and creates the repair job for the same
-- property and customer, unscheduled, pointing back at the detection job.
create or replace function app.accept_quote(
  target_quote uuid, signer text, from_ip inet, agent text) returns public.quote
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  q public.quote;
  j public.job;
  repair uuid;
begin
  select * into q from public.quote where id = target_quote for update;
  select * into j from public.job where id = q.job_id;
  insert into public.job (company_id, type, property_id, bill_to_customer_id, parent_job_id,
                          status, summary_notes)
  values (q.company_id, 'repair', j.property_id, j.bill_to_customer_id, j.id, 'unscheduled',
          'Repair from quote #' || coalesce(q.number::text, '') || ' (job #'
          || coalesce(j.number::text, '') || ')')
  returning id into repair;
  perform set_config('app.quote_server', 'on', true);
  update public.quote
  set status = 'accepted', accepted_at = now(), accepted_by_name = signer,
      accepted_ip = from_ip, accepted_user_agent = agent, repair_job_id = repair
  where id = q.id
  returning * into q;
  perform set_config('app.quote_server', 'off', true);
  update public.job set status = 'quote_accepted' where id = j.id and status = 'quote_sent';
  return q;
end
$$;

-- The customer accepts on the quote page: typed name and the terms box. No sign-in.
create or replace function public.accept_quote_by_link(
  link_token text, signer_name text, agreed boolean,
  from_ip text default null, user_agent text default null)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  sl public.share_link;
  q public.quote;
  ip inet;
begin
  select * into sl from public.share_link
  where token = link_token and revoked_at is null and (expires_at is null or expires_at > now())
    and deleted_at is null;
  if sl.id is null or sl.quote_id is null then
    raise exception 'This link is not valid' using errcode = 'invalid_parameter_value';
  end if;
  select * into q from public.quote where id = sl.quote_id and deleted_at is null for update;
  if q.status = 'accepted' then
    return jsonb_build_object('status', 'accepted', 'already', true);
  end if;
  if q.status <> 'sent' then
    raise exception 'This quote can no longer be accepted' using errcode = 'check_violation';
  end if;
  if q.valid_until is not null and q.valid_until < (now() at time zone
       (select timezone from public.company where id = q.company_id))::date then
    raise exception 'This quote has expired. Contact the shop for a new one.'
      using errcode = 'check_violation', hint = 'expired';
  end if;
  if length(trim(coalesce(signer_name, ''))) = 0 then
    raise exception 'Type your name to accept' using errcode = 'check_violation';
  end if;
  if not coalesce(agreed, false) then
    raise exception 'Check the box to agree to the terms' using errcode = 'check_violation';
  end if;
  begin
    ip := from_ip::inet;
  exception when others then
    ip := null;
  end;
  q := app.accept_quote(q.id, trim(signer_name), ip, left(user_agent, 500));
  return jsonb_build_object('status', q.status, 'already', false);
end
$$;

-- On site: a synced quote_acceptance signature accepts its quote, as long as it is still a
-- draft or sent. Never raises, so the signature itself always syncs.
create or replace function app.accept_quote_on_site() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  q public.quote;
begin
  if new.purpose <> 'quote_acceptance' or new.quote_id is null or new.deleted_at is not null then
    return null;
  end if;
  select * into q from public.quote where id = new.quote_id and deleted_at is null;
  if q.id is null or q.status not in ('draft', 'sent') then
    return null;
  end if;
  begin
    if q.status = 'draft' then
      q := app.finalize_quote(q.id);
      perform set_config('app.quote_server', 'on', true);
      update public.quote set status = 'sent', sent_at = coalesce(sent_at, now()) where id = q.id;
      perform set_config('app.quote_server', 'off', true);
      update public.finding set status = 'quoted'
      where id in (select finding_id from public.quote_line_item
                   where quote_id = q.id and deleted_at is null and finding_id is not null)
        and status = 'open';
      update public.job set status = 'quote_sent' where id = q.job_id and status = 'report_sent';
    end if;
    perform app.accept_quote(q.id, new.signer_name, null, 'Signed on site');
    if not exists (select 1 from public.share_link where quote_id = q.id and revoked_at is null) then
      insert into public.share_link (company_id, job_id, quote_id) values (q.company_id, q.job_id, q.id);
    end if;
  exception when others then
    -- Leave the quote for the office to resolve (for example, a discount over the limit).
    raise warning 'On-site acceptance of quote % failed: %', q.id, sqlerrm;
  end;
  return null;
end
$$;

create trigger accept_quote_on_site after insert on public.signature
  for each row execute function app.accept_quote_on_site();

-- ---------------------------------------------------------------------------
-- Customer page (/q/{token})
-- ---------------------------------------------------------------------------

create or replace function public.quote_for_token(link_token text, count_view boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  sl public.share_link;
  q public.quote;
  co public.company;
  j public.job;
  expired boolean;
begin
  select * into sl from public.share_link
  where token = link_token and revoked_at is null and (expires_at is null or expires_at > now())
    and deleted_at is null;
  if sl.id is null or sl.quote_id is null then
    return null;
  end if;
  select * into q from public.quote
  where id = sl.quote_id and status <> 'draft' and deleted_at is null;
  if q.id is null then
    return null;
  end if;
  if count_view then
    update public.share_link set view_count = view_count + 1, last_viewed_at = now() where id = sl.id;
  end if;
  select * into co from public.company where id = q.company_id;
  select * into j from public.job where id = q.job_id;
  expired := q.status = 'sent' and q.valid_until is not null
             and q.valid_until < (now() at time zone co.timezone)::date;
  return jsonb_build_object(
    'quote_id', q.id, 'company_id', q.company_id, 'job_id', q.job_id, 'number', q.number,
    'status', case when expired then 'expired' else q.status end,
    'subtotal_cents', q.subtotal_cents, 'discount_cents', q.discount_cents,
    'tax_cents', q.tax_cents, 'total_cents', q.total_cents,
    'deposit_cents', q.deposit_cents, 'deposit_rule', q.deposit_rule,
    'valid_until', q.valid_until, 'notes', q.notes, 'sent_at', q.sent_at,
    'accepted_at', q.accepted_at, 'accepted_by_name', q.accepted_by_name,
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
        'id', l.id, 'description', l.description, 'quantity', l.quantity,
        'unit_price_cents', l.unit_price_cents, 'taxable', l.taxable,
        'warranty_months', l.warranty_months,
        'finding', (select f.title from public.finding f where f.id = l.finding_id))
        order by l.sort_order, l.id)
      from public.quote_line_item l where l.quote_id = q.id and l.deleted_at is null), '[]'),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('amount_cents', p.amount_cents, 'method', p.method,
                                          'status', p.status, 'paid_at', p.paid_at)
                       order by p.id)
      from public.payment p where p.quote_id = q.id and p.deleted_at is null), '[]'),
    'can_pay', exists (select 1 from public.stripe_account a
                       where a.company_id = q.company_id and a.charges_enabled));
end
$$;

-- ---------------------------------------------------------------------------
-- Stripe (called by the server with the service role only)
-- ---------------------------------------------------------------------------

-- Webhook event ids already handled. Stripe retries and can resend; each id applies once.
create table app.stripe_event (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- Records an event id; false when it was already handled.
create or replace function public.stripe_claim_event(event_id text, event_type text) returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  insert into app.stripe_event (id, type) values (event_id, event_type) on conflict do nothing;
  return found;
end
$$;

create or replace function public.stripe_event_seen(event_id text) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (select 1 from app.stripe_event where id = event_id)
$$;

-- What the server needs to start a deposit checkout for a quote link.
create or replace function public.quote_checkout_details(link_token text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'quote_id', q.id, 'company_id', q.company_id, 'job_id', q.job_id, 'number', q.number,
    'status', q.status, 'deposit_cents', q.deposit_cents, 'company_name', co.name,
    'customer_email', c.email,
    'stripe_account_id', a.stripe_account_id, 'charges_enabled', coalesce(a.charges_enabled, false),
    'deposit_paid', exists (select 1 from public.payment p where p.quote_id = q.id
                            and p.status in ('pending', 'succeeded') and p.deleted_at is null))
  from public.share_link sl
  join public.quote q on q.id = sl.quote_id and q.deleted_at is null
  join public.company co on co.id = q.company_id
  join public.job j on j.id = q.job_id
  left join public.customer c on c.id = j.bill_to_customer_id
  left join public.stripe_account a on a.company_id = q.company_id
  where sl.token = link_token and sl.revoked_at is null and sl.deleted_at is null
    and (sl.expires_at is null or sl.expires_at > now())
$$;

-- A deposit payment from a Checkout Session. Card payments arrive paid; ACH arrives pending
-- and later succeeds or fails. A payment never moves back from succeeded or failed to
-- pending, so events arriving out of order change nothing.
create or replace function public.stripe_record_quote_payment(
  target_quote uuid, session_id text, intent_id text, amount integer, pay_method text,
  pay_status text)
returns text
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  q public.quote;
  existing public.payment;
begin
  select * into q from public.quote where id = target_quote;
  if q.id is null then
    raise exception 'Quote % not found', target_quote using errcode = 'invalid_parameter_value';
  end if;
  select * into existing from public.payment where stripe_checkout_session_id = session_id for update;
  if existing.id is null then
    insert into public.payment (company_id, quote_id, amount_cents, method, status,
                                stripe_checkout_session_id, stripe_payment_intent_id, paid_at)
    values (q.company_id, q.id, amount, pay_method, pay_status, session_id, intent_id,
            case when pay_status = 'succeeded' then now() end);
    return pay_status;
  end if;
  if existing.status = 'pending' and pay_status <> 'pending' then
    update public.payment
    set status = pay_status, stripe_payment_intent_id = coalesce(intent_id, stripe_payment_intent_id),
        paid_at = case when pay_status = 'succeeded' then now() end
    where id = existing.id;
    return pay_status;
  end if;
  return existing.status;
end
$$;

-- A connected account's state from account.updated (or after onboarding).
create or replace function public.stripe_save_account(
  target_company uuid, account_id text, charges boolean, payouts boolean, submitted boolean)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if target_company is null then
    update public.stripe_account
    set charges_enabled = charges, payouts_enabled = payouts, details_submitted = submitted,
        updated_at = now()
    where stripe_account_id = account_id;
  else
    insert into public.stripe_account (company_id, stripe_account_id, charges_enabled,
                                       payouts_enabled, details_submitted)
    values (target_company, account_id, charges, payouts, submitted)
    on conflict (company_id) do update
    set stripe_account_id = excluded.stripe_account_id, charges_enabled = excluded.charges_enabled,
        payouts_enabled = excluded.payouts_enabled, details_submitted = excluded.details_submitted,
        updated_at = now();
  end if;
end
$$;

revoke all on function public.send_quote(uuid), public.accept_quote_by_link(text, text, boolean, text, text),
  public.quote_for_token(text, boolean), public.stripe_claim_event(text, text),
  public.stripe_event_seen(text), public.quote_checkout_details(text),
  public.stripe_record_quote_payment(uuid, text, text, integer, text, text),
  public.stripe_save_account(uuid, text, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.send_quote(uuid) to authenticated;
grant execute on function public.accept_quote_by_link(text, text, boolean, text, text),
  public.quote_for_token(text, boolean) to anon, authenticated;
grant execute on function public.stripe_claim_event(text, text), public.stripe_event_seen(text),
  public.quote_checkout_details(text),
  public.stripe_record_quote_payment(uuid, text, text, integer, text, text),
  public.stripe_save_account(uuid, text, boolean, boolean, boolean) to service_role;
