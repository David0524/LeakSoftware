-- Techs record payments (owner, 2026-10-22: "Techs should be able to record payments").
--
-- A tech can record cash, a check or another payment on an invoice of a job they can see, as
-- owners and admins can: public.record_invoice_payment still checks the job's visibility first
-- (app.require_visible_record, the wrapper from 20261022001600), so a tech who sees only their
-- own jobs (Settings › Team, "Techs see all jobs" off) can't record on anyone else's. Only the
-- role check changes: any active member, not only managers. Everything else stays the
-- managers': voiding (void_invoice), editing and sending invoices, refunds (in Stripe). The
-- Send Receipt that follows (log_receipt) was already for anyone who can see the invoice.

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
begin
  select * into inv from public.invoice where id = target_invoice and deleted_at is null for update;
  -- Anyone on the team (owners, admins, techs; a support session as the shop's admin).
  if inv.id is null or not app.is_member(inv.company_id) then
    raise exception 'Invoice not found' using errcode = 'insufficient_privilege';
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
