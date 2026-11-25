# Apply the card fee database change (Claude in Chrome)

Paste everything below the line into Claude in Chrome. Have one tab signed in to Supabase first
(https://supabase.com/dashboard, the account that owns the **leakbook-dev** project). It takes a
few minutes and needs no secret values from you. When it finishes, paste its report back to
Claude Code.

Why (owner, 2026-11-24): receipts must show the card fee customers paid. The website already
shows it by asking Stripe each time a receipt opens. This change lets the database keep each
payment's fee, so the office's payment lines (website, iPhone, Android) show "Card fee $0.03"
and receipts stop asking Stripe every time. It is migration
`supabase/migrations/20261022005800_card_fee_on_receipts.sql`, recorded the same way
`pnpm db:deploy` records migrations, so a later deploy won't run it twice.

---

You're applying one database change to my company's Supabase project, **leakbook-dev**
(project ref `evmxdfasurkaxbwkceti`). It is the live database behind sundeckpro.com, with real
customers' data, so work carefully.

## Rules

1. Work only in project `evmxdfasurkaxbwkceti`. Check the ref in the browser's address bar
   before every step. If you can't find that project, stop and tell me.
2. Run only the three SQL blocks below, exactly as written, in the **SQL Editor**. Don't edit
   them, don't run anything else, and don't change tables, settings, keys, or users in the
   dashboard.
3. Never reveal, copy, or put in your report any key or password (anon, service_role, database
   password, access token). Don't click "Reveal" on anything.
4. If the SQL Editor shows a warning such as "potentially destructive operation" or "query has
   destructive operations", that's expected for block 2 (it changes a table and a function).
   Confirm it for block 2 only.
5. If any block shows an error, stop. Don't retry and don't try to fix it. Copy the error
   message word for word into your report.

## Steps

1. Open https://supabase.com/dashboard/project/evmxdfasurkaxbwkceti/sql/new (or SQL Editor, then
   New query).
2. Run **block 1** (a check that changes nothing). Copy its result into your report.
   - If `already_applied` is `true`, stop here and tell me: the change is already in.
3. Clear the editor, paste **block 2**, and run it. It should finish with "Success. No rows
   returned". Copy the message into your report.
4. Clear the editor, paste **block 3** (a check that changes nothing), and run it. Copy its
   result into your report.

### Block 1: check first (changes nothing)

```sql
select
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261022005800')
    as already_applied,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'payment' and column_name = 'fee_cents')
    as column_exists,
  (select max(version) from supabase_migrations.schema_migrations) as latest_applied;
```

Expected: `already_applied` false and `column_exists` false. `latest_applied` is probably
`20261022005700`; whatever it says, copy it into your report and carry on.

### Block 2: the change

```sql
begin;
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
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261022005800', 'card_fee_on_receipts', array[]::text[]);
commit;
```

### Block 3: check after (changes nothing)

```sql
select
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261022005800')
    as recorded,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'payment' and column_name = 'fee_cents')
    as column_exists,
  to_regprocedure('public.stripe_record_card_fee(text, text, integer, text)') is not null
    as function_exists,
  (select count(*) from public.payment where fee_cents is null) as card_payments_to_look_up;
```

Expected: `recorded`, `column_exists`, and `function_exists` all true. `card_payments_to_look_up`
is the number of card payments taken before today (a small number, at least 1). The website
fills each one in from Stripe the next time its receipt opens.

## Report

Reply with:
- Block 1's result.
- Block 2's message (or the error, word for word).
- Block 3's result.
- Anything that wasn't where these steps said, and where you found it.
