-- Monthly invoices that send themselves on the invoice day (owner, 2026-11-16: "Add auto-send on
-- the invoice day too"; docs/design/2026-11-15-monthly-billing.md).
--
--   * company.settings.send_monthly_invoices (off by default) and send_monthly_invoices_from
--     (the day it was switched on): on, the daily run sends each customer's monthly draft on
--     their invoice day, by email or a text from the shop's number. Only drafts whose invoice
--     day is on or after the day it was switched on go by themselves, so switching it on never
--     sends a backlog.
--   * invoice.auto_send_tried_at / auto_send_error (server-only): each draft is tried once; one
--     that couldn't go stays a draft with the reason, shown on the month's page, for the office.
--   * send_invoice works for the server (service role) too, as invoice_mail_details already does.

alter table public.invoice
  add column auto_send_tried_at timestamptz,
  add column auto_send_error text check (auto_send_error is null or length(auto_send_error) <= 300);

-- The server sends as the shop: allow the service role where send_invoice asks for a member.
do $do$
declare
  def text := pg_get_functiondef('app.send_invoice_unchecked(uuid)'::regprocedure);
  gate text := 'if inv.id is null or not app.is_member(inv.company_id) then';
begin
  if position(gate in def) = 0 then
    raise exception 'auto-send: app.send_invoice_unchecked changed; review its access check';
  end if;
  execute replace(def, gate,
    'if inv.id is null or (current_setting(''role'', true) is distinct from ''service_role''
                       and not app.is_member(inv.company_id)) then');
end
$do$;

/** Does the shop send monthly invoices by themselves, and from which day? */
create or replace function app.auto_send_from(target_company uuid) returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select case when coalesce((c.settings ->> 'send_monthly_invoices')::boolean, false)
              then case when c.settings ->> 'send_monthly_invoices_from' ~ '^\d{4}-\d{2}-\d{2}$'
                        then (c.settings ->> 'send_monthly_invoices_from')::date
                        else '-infinity'::date end end
  from public.company c where c.id = target_company
$$;

/**
 * The daily run (service role): last month's drafts whose customer's invoice day has come, in
 * shops that send by themselves, not tried yet. Each is marked tried as it's handed out, so a
 * second run the same day never sends it again.
 */
create or replace function public.monthly_invoices_to_send(at timestamptz default now())
returns table (invoice_id uuid, company_id uuid, customer_id uuid, job_id uuid, customer text,
               email text, phone text)
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  return query
  with due as (
    select i.id
    from public.invoice i
    join public.company c on c.id = i.company_id
    where i.status = 'draft' and i.deleted_at is null and i.period_month is not null
      and i.auto_send_tried_at is null
      and app.auto_send_from(c.id) is not null
      and i.period_month
          = (date_trunc('month', (at at time zone c.timezone)::date) - interval '1 month')::date
      and app.customer_bill_date(c.id, i.customer_id, i.period_month)
          between app.auto_send_from(c.id) and (at at time zone c.timezone)::date
    for update of i skip locked
  ),
  marked as (
    update public.invoice i set auto_send_tried_at = now()
    from due where i.id = due.id
    returning i.id, i.company_id, i.customer_id, i.job_id
  )
  select m.id, m.company_id, m.customer_id, m.job_id, cu.name, cu.email, cu.phone
  from marked m join public.customer cu on cu.id = m.customer_id;
end
$$;

/** The daily run: why a draft couldn't go by itself (sent invoices never change). */
create or replace function public.record_auto_send(target_invoice uuid, failure text)
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.invoice set auto_send_error = left(failure, 300)
  where id = target_invoice and status = 'draft'
$$;

-- A month's page shows why a draft didn't go by itself. As 20261022003900_monthly_billing.sql,
-- with auto_send_error on each invoice.
create or replace function public.month_billing(target_company uuid, month date) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  m date := date_trunc('month', month)::date;
  tz text;
  today date;
  result jsonb;
begin
  if not app.is_manager(target_company) then
    raise exception 'Only owners and admins can bill the month'
      using errcode = 'insufficient_privilege';
  end if;
  select timezone into tz from public.company where id = target_company;
  today := (now() at time zone tz)::date;
  select jsonb_build_object(
    'month', m,
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'status', i.status, 'job_id', i.job_id,
        'customer_id', cu.id, 'customer', cu.name, 'email', cu.email, 'phone', cu.phone,
        'total_cents', case when i.status = 'draft'
                            then (app.invoice_totals(i.id) ->> 'total_cents')::bigint
                            else i.total_cents end,
        'amount_paid_cents', i.amount_paid_cents, 'sent_at', i.sent_at, 'due_date', i.due_date,
        'auto_send_error', case when i.status = 'draft' then i.auto_send_error end,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'description', l.description, 'quantity', l.quantity,
            'unit_price_cents', l.unit_price_cents, 'unit', l.unit, 'kind', l.kind,
            'taxable', l.taxable)
            order by l.sort_order, l.id)
          from public.invoice_line_item l
          where l.invoice_id = i.id and l.deleted_at is null), '[]'::jsonb))
        order by lower(cu.name), i.id)
      from public.invoice i join public.customer cu on cu.id = i.customer_id
      where i.company_id = target_company and i.period_month = m and i.status <> 'void'
        and i.deleted_at is null), '[]'::jsonb),
    'not_invoiced', (select count(*) from app.month_unbilled(target_company, m)),
    'waiting', coalesce((
      select jsonb_agg(jsonb_build_object('date', w.bill_date, 'customers', w.n)
                       order by w.bill_date)
      from (select u.bill_date, count(*) as n from app.month_unbilled(target_company, m) u
            where u.bill_date > today group by u.bill_date) w), '[]'::jsonb)
  ) into result;
  return result;
end
$$;

revoke all on function app.auto_send_from(uuid) from public;
revoke all on function public.monthly_invoices_to_send(timestamptz), public.record_auto_send(uuid, text)
  from public, anon, authenticated;
grant execute on function public.monthly_invoices_to_send(timestamptz),
  public.record_auto_send(uuid, text) to service_role;
