-- Monthly visit reports, with the invoice (owner, 2026-10-24: "for maintenance reports, we should
-- have the option for them to go out either when ... the tech leaves the home, or on a monthly
-- basis, and it acts like side by side or with in hand with the invoice";
-- docs/design/2026-10-24-chemicals-added.md, approved with its recommendations).
--
-- company.settings.visit_reports gains 'monthly' (beside 'auto', 'manual', 'off'). In a Monthly
-- shop nothing goes when a visit is completed. When a customer's monthly invoice is sent, the
-- server freezes one report of that month's visits (template 'maintenance_month': each visit's
-- readings, chemicals added, what was done and photos) and the invoice's email or text carries
-- both links. A customer with no invoice that month gets the report on its own on the 1st (the
-- daily run). Techs can still send one visit's report by hand.

do $$
declare
  c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.report'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%template_key%';
  execute format('alter table public.report drop constraint %I', c);
end
$$;
alter table public.report add constraint report_template_key_check
  check (template_key in ('homeowner', 'partner', 'insurance', 'maintenance', 'maintenance_month'));

-- A monthly report's customer and month (server-set; null on every other report).
alter table public.report
  add column customer_id uuid,
  add column period_month date,
  add foreign key (customer_id, company_id) references public.customer (id, company_id);
create index report_month_idx on public.report (customer_id, period_month)
  where template_key = 'maintenance_month';

-- The shop's choice: 'manual' (the default), 'auto', 'monthly', or 'off'.
create or replace function app.visit_report_mode(target_company uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when c.settings ->> 'visit_reports' in ('manual', 'auto', 'monthly', 'off')
              then c.settings ->> 'visit_reports' else 'manual' end
  from public.company c where c.id = target_company
$$;
revoke all on function app.visit_report_mode(uuid) from public;

-- ---------------------------------------------------------------------------
-- The month's report
-- ---------------------------------------------------------------------------

/** A customer's finished maintenance visits in a month (the shop's time zone), newest first. */
create or replace function app.month_visits(target_company uuid, target_customer uuid, month date)
returns setof public.job
language sql stable security definer set search_path = public, app, pg_temp as $$
  select j.* from public.job j join public.company c on c.id = j.company_id
  where j.company_id = target_company and j.bill_to_customer_id = target_customer
    and j.type = 'maintenance' and j.deleted_at is null and j.status in ('done', 'invoiced', 'paid')
    and app.visit_month(j, c.timezone) = date_trunc('month', month)::date
  order by j.plan_date desc nulls last, coalesce(j.completed_at, j.scheduled_start) desc nulls last,
           j.id desc
$$;

/**
 * The month's snapshot: the shop, customer and pool from the latest visit's, then every visit's
 * own snapshot (its readings, chemicals, checklist and photos) with its date, all the month's
 * media at the top (so the customer page may show them), and the invoice it went with.
 */
create or replace function app.month_snapshot(target_company uuid, target_customer uuid,
                                              month date, target_invoice uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  tz text;
  visits jsonb;
  latest jsonb;
  inv public.invoice;
  inv_token text;
begin
  select timezone into tz from public.company where id = target_company;
  select coalesce(jsonb_agg(app.visit_snapshot(j.id) - 'company' - 'customer'
           || jsonb_build_object('job_id', j.id, 'date',
                coalesce(j.plan_date, (coalesce(j.completed_at, j.scheduled_start, j.created_at)
                                       at time zone tz)::date))
           order by j.plan_date desc nulls last,
                    coalesce(j.completed_at, j.scheduled_start) desc nulls last, j.id desc),
         '[]'::jsonb)
  into visits
  from app.month_visits(target_company, target_customer, month) j;
  if jsonb_array_length(visits) = 0 then
    return null;
  end if;
  latest := app.visit_snapshot((visits -> 0 ->> 'job_id')::uuid);
  if target_invoice is not null then
    select * into inv from public.invoice where id = target_invoice;
    select l.token into inv_token from public.share_link l
    where l.invoice_id = target_invoice and l.revoked_at is null and l.deleted_at is null
    order by l.created_at desc limit 1;
  end if;
  return jsonb_build_object(
    'kind', 'month',
    'month', date_trunc('month', month)::date,
    'company', latest -> 'company',
    'customer', latest -> 'customer',
    'property', latest -> 'property',
    'job', latest -> 'job',
    'components', '[]'::jsonb,
    'signatures', '[]'::jsonb,
    'media', coalesce((select jsonb_agg(m) from jsonb_array_elements(visits) v,
                         jsonb_array_elements(v -> 'media') m), '[]'::jsonb),
    'charge_chemicals', app.charges_chemicals(target_company),
    'visits', visits,
    'invoice', case when inv.id is null then null else jsonb_build_object(
      'number', inv.number, 'total_cents', inv.total_cents, 'token', inv_token) end);
end
$$;

/**
 * Send a customer's monthly report: freeze it and make the customer link. With an invoice, it's
 * the one that invoice goes with. `automatic` is the daily run for customers with no invoice
 * that month: only once, and never when the month has an invoice (that one carries it).
 * Returns {token, report_id, version}, or {skipped: reason}.
 */
create or replace function public.send_month_report(target_customer uuid, month date,
                                                    target_invoice uuid default null,
                                                    automatic boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  cu public.customer;
  m date := date_trunc('month', month)::date;
  snap jsonb;
  anchor uuid;
  rep public.report;
  link text;
begin
  select * into cu from public.customer where id = target_customer and deleted_at is null;
  if cu.id is null or (current_setting('role', true) is distinct from 'service_role'
                       and not app.is_member(cu.company_id)) then
    raise exception 'Customer not found' using errcode = 'insufficient_privilege';
  end if;
  if app.visit_report_mode(cu.company_id) <> 'monthly' then
    return jsonb_build_object('skipped', 'not_monthly');
  end if;
  if automatic and (
    exists (select 1 from public.report r where r.customer_id = cu.id and r.period_month = m
            and r.template_key = 'maintenance_month' and r.status <> 'draft' and r.deleted_at is null)
    or exists (select 1 from public.invoice i where i.customer_id = cu.id and i.period_month = m
               and i.status <> 'void' and i.deleted_at is null)) then
    return jsonb_build_object('skipped', 'sent');
  end if;
  snap := app.month_snapshot(cu.company_id, cu.id, m, target_invoice);
  if snap is null then
    return jsonb_build_object('skipped', 'no_visits');
  end if;
  anchor := coalesce((select i.job_id from public.invoice i where i.id = target_invoice),
                     (snap -> 'visits' -> 0 ->> 'job_id')::uuid);

  -- One at a time per customer and month, so two sends can't both make version 1.
  perform pg_advisory_xact_lock(hashtext('month_report:' || cu.id::text || ':' || m::text));
  update public.report set status = 'superseded'
  where customer_id = cu.id and period_month = m and template_key = 'maintenance_month'
    and status = 'sent' and deleted_at is null;
  insert into public.report (company_id, job_id, template_key, version, status, sent_at,
                             data_snapshot, final_sections, customer_id, period_month)
  values (cu.company_id, anchor, 'maintenance_month',
          coalesce((select max(version) from public.report where customer_id = cu.id
                    and period_month = m and template_key = 'maintenance_month'), 0) + 1,
          'sent', now(), snap, '[]'::jsonb, cu.id, m)
  returning * into rep;
  insert into public.share_link (company_id, job_id, report_id)
  values (cu.company_id, anchor, rep.id)
  returning token into link;
  return jsonb_build_object('token', link, 'report_id', rep.id, 'version', rep.version,
                            'visits', jsonb_array_length(snap -> 'visits'));
end
$$;
revoke all on function public.send_month_report(uuid, date, uuid, boolean) from public, anon;
grant execute on function public.send_month_report(uuid, date, uuid, boolean)
  to authenticated, service_role;

/** The report a monthly invoice goes with, as it's sent (a Monthly shop only). */
create or replace function public.send_invoice_month_report(target_invoice uuid) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  inv public.invoice;
begin
  select * into inv from public.invoice where id = target_invoice and deleted_at is null;
  if inv.id is null or (current_setting('role', true) is distinct from 'service_role'
                        and not app.is_member(inv.company_id)) then
    raise exception 'Invoice not found' using errcode = 'insufficient_privilege';
  end if;
  if inv.period_month is null or inv.customer_id is null then
    return jsonb_build_object('skipped', 'not_monthly');
  end if;
  return public.send_month_report(inv.customer_id, inv.period_month, inv.id, false);
end
$$;
revoke all on function public.send_invoice_month_report(uuid) from public, anon;
grant execute on function public.send_invoice_month_report(uuid) to authenticated, service_role;

/**
 * The daily run: last month's reports for customers of Monthly shops with no invoice that month
 * (in the shop's time zone), not sent yet.
 */
create or replace function public.month_reports_due(at timestamptz default now())
returns table (company_id uuid, customer_id uuid, month date)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select distinct c.id, j.bill_to_customer_id,
         (date_trunc('month', (at at time zone c.timezone)::date) - interval '1 month')::date
  from public.company c
  join public.job j on j.company_id = c.id
  where app.visit_report_mode(c.id) = 'monthly'
    and j.type = 'maintenance' and j.deleted_at is null and j.status in ('done', 'invoiced', 'paid')
    and j.bill_to_customer_id is not null
    and app.visit_month(j, c.timezone)
        = (date_trunc('month', (at at time zone c.timezone)::date) - interval '1 month')::date
    and not exists (select 1 from public.invoice i where i.customer_id = j.bill_to_customer_id
                    and i.period_month = app.visit_month(j, c.timezone)
                    and i.status <> 'void' and i.deleted_at is null)
    and not exists (select 1 from public.report r where r.customer_id = j.bill_to_customer_id
                    and r.period_month = app.visit_month(j, c.timezone)
                    and r.template_key = 'maintenance_month' and r.status <> 'draft'
                    and r.deleted_at is null)
$$;
revoke all on function public.month_reports_due(timestamptz) from public, anon, authenticated;
grant execute on function public.month_reports_due(timestamptz) to service_role;

/**
 * On the invoice's customer page: the month's report it went with, if any:
 * {token, month, visits}.
 */
create or replace function public.month_report_link(link_token text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('token', rl.token, 'month', r.period_month,
                            'visits', jsonb_array_length(r.data_snapshot -> 'visits'))
  from public.share_link il
  join public.invoice i on i.id = il.invoice_id
  join public.report r on r.customer_id = i.customer_id and r.period_month = i.period_month
    and r.template_key = 'maintenance_month' and r.status = 'sent' and r.deleted_at is null
  join public.share_link rl on rl.report_id = r.id and rl.revoked_at is null
    and rl.deleted_at is null and (rl.expires_at is null or rl.expires_at > now())
  where il.token = link_token and il.revoked_at is null and il.deleted_at is null
    and i.period_month is not null and i.status <> 'void' and i.deleted_at is null
  order by r.version desc, rl.created_at desc
  limit 1
$$;
revoke all on function public.month_report_link(text) from public;
grant execute on function public.month_report_link(text) to anon, authenticated;

revoke all on function app.month_visits(uuid, uuid, date), app.month_snapshot(uuid, uuid, date, uuid)
  from public;

-- ---------------------------------------------------------------------------
-- A superseded monthly report points to the newest one for its customer and month
-- ---------------------------------------------------------------------------

-- As 20261012001200_reports.sql; a monthly report's newer version is found by customer and
-- month (its visit can change as later visits are finished).
create or replace function public.report_for_token(link_token text, count_view boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  sl public.share_link;
  rep public.report;
  newest text;
begin
  select * into sl from public.share_link
  where token = link_token and revoked_at is null and (expires_at is null or expires_at > now())
    and deleted_at is null;
  if sl.id is null or sl.report_id is null then
    return null;
  end if;
  select * into rep from public.report
  where id = sl.report_id and status in ('sent', 'superseded') and deleted_at is null;
  if rep.id is null then
    return null;
  end if;
  if count_view then
    update public.share_link
    set view_count = view_count + 1, last_viewed_at = now()
    where id = sl.id;
  end if;
  if rep.status = 'superseded' then
    select l.token into newest
    from public.report r join public.share_link l on l.report_id = r.id and l.revoked_at is null
    where r.template_key = rep.template_key and r.status = 'sent' and r.deleted_at is null
      and (case when rep.template_key = 'maintenance_month'
                then r.customer_id = rep.customer_id and r.period_month = rep.period_month
                else r.job_id = rep.job_id end)
    order by r.version desc, l.id desc limit 1;
  end if;
  return jsonb_build_object(
    'report_id', rep.id, 'company_id', rep.company_id, 'job_id', rep.job_id,
    'template_key', rep.template_key, 'version', rep.version,
    'status', rep.status, 'sent_at', rep.sent_at, 'final_sections', rep.final_sections,
    'snapshot', rep.data_snapshot, 'pdf_path', rep.pdf_path, 'newer_token', newest);
end
$$;
grant execute on function public.report_for_token(text, boolean) to anon, authenticated;
