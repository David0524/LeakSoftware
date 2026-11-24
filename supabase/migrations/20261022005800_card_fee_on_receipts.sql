-- The card fee on receipts (owner, 2026-11-24: "On the receipt, it does not show the credit card
-- processing fee, but it was charged. This has to show this so that customers can see it.").
--
-- A card payment's fee is the shop's to keep, never part of the payment on the invoice
-- (stripe.ts), so until now it was dropped once Stripe had charged it. payment.fee_cents keeps
-- it beside the payment: 0 for no fee, null for a card payment taken through Stripe before this
-- migration (the server reads those from Stripe once, the first time the receipt is opened).

alter table public.payment
  add column fee_cents integer default 0 check (fee_cents is null or fee_cents >= 0);

-- Card payments taken through Stripe before today: the fee isn't known here.
update public.payment set fee_cents = null
where method = 'card'
  and (stripe_checkout_session_id is not null or stripe_payment_intent_id is not null);

-- The fee on a Stripe payment (service role: the webhook, autopay, and the receipt's one-time
-- look-up). Only on the payment's own shop's account, and never more than 3% of the charge.
-- Returns the fee saved, or null when no payment matches.
create or replace function public.stripe_record_card_fee(
  session_id text, intent_id text, fee integer, paid_account text)
returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  p public.payment;
  charged integer;
begin
  select * into p from public.payment
  where (session_id is not null and stripe_checkout_session_id = session_id)
     or (intent_id is not null and stripe_payment_intent_id = intent_id)
  limit 1 for update;
  if p.id is null then
    return null;
  end if;
  if paid_account is null or not exists (select 1 from public.stripe_account a
      where a.company_id = p.company_id and a.stripe_account_id = paid_account) then
    raise exception 'That payment isn''t on this account.' using errcode = 'insufficient_privilege';
  end if;
  charged := case when p.status = 'refunded' then p.amount_cents
                  else p.amount_cents + p.refunded_cents end;
  fee := least(greatest(coalesce(fee, 0), 0), ceil(charged * 300 / 10000.0)::integer);
  if p.fee_cents is distinct from fee then
    update public.payment set fee_cents = fee, updated_at = now() where id = p.id;
  end if;
  return fee;
end
$$;
revoke all on function public.stripe_record_card_fee(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.stripe_record_card_fee(text, text, integer, text) to service_role;

-- The customer's invoice and receipt: each payment's card fee (null while not yet known).
alter function public.invoice_for_token(text, boolean) rename to invoice_for_token_before_fees;
revoke all on function public.invoice_for_token_before_fees(text, boolean)
  from public, anon, authenticated;
create function public.invoice_for_token(link_token text, count_view boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r jsonb := public.invoice_for_token_before_fees(link_token, count_view);
begin
  if r is null then
    return null;
  end if;
  return r || jsonb_build_object('payments', coalesce((
    select jsonb_agg(e.p || jsonb_build_object('fee_cents', pm.fee_cents) order by e.ord)
    from jsonb_array_elements(r -> 'payments') with ordinality as e(p, ord)
    left join public.payment pm on pm.id = (e.p ->> 'id')::uuid), '[]'::jsonb));
end
$$;
revoke all on function public.invoice_for_token(text, boolean) from public;
grant execute on function public.invoice_for_token(text, boolean) to anon, authenticated;
