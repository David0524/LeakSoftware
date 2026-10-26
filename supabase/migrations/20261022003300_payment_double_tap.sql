-- A payment recorded twice by a double tap (owner, 2026-10-26: "taps submit twice").
--
-- The Record Payment button on every platform disables itself while the request runs, but a
-- request sent again after a slow answer (the phone asks once more when the first reply never
-- arrived) reached this function twice and made two payments: for a partial payment nothing
-- stopped the second, and for the full balance the second answered "Enter an amount up to the
-- balance due" although the first had worked. The same invoice, amount, method and check number
-- recorded within the last 30 seconds is now the payment already recorded: the same payment id
-- comes back (with paid_now false and duplicate true) and nothing is added. Recording the same
-- amount on purpose a minute later works as before.
--
-- Everything else is app.record_invoice_payment_unchecked as 20261022001800_tech_payments.sql
-- has it; the new check sits before the status and balance checks, since a duplicate of the
-- payment that settled the invoice would fail both.

create or replace function app.record_invoice_payment_unchecked(target_invoice uuid, amount integer,
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
  prior uuid;
begin
  select * into inv from public.invoice where id = target_invoice and deleted_at is null for update;
  -- Anyone on the team (owners, admins, techs; a support session as the shop's admin).
  if inv.id is null or not app.is_member(inv.company_id) then
    raise exception 'Invoice not found' using errcode = 'insufficient_privilege';
  end if;
  if how <> 'check' then
    num := null;
  end if;
  -- The same payment a moment ago: this is that one again.
  select id into prior from public.payment
  where invoice_id = inv.id and deleted_at is null and status = 'succeeded'
    and amount_cents = amount and method = how and check_number is not distinct from num
    and created_at > now() - interval '30 seconds'
  order by created_at desc limit 1;
  if prior is not null then
    return jsonb_build_object('status', inv.status, 'paid_now', false, 'payment_id', prior,
                              'duplicate', true);
  end if;
  if inv.status not in ('sent', 'partially_paid') then
    raise exception 'Send the invoice before recording a payment' using errcode = 'check_violation';
  end if;
  if how not in ('cash', 'check', 'other') then
    raise exception 'Pick Cash, Check, or Other' using errcode = 'check_violation';
  end if;
  if num is not null and length(num) > 20 then
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
