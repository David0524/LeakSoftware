-- Owner dashboard (M10, basic): jobs by status now, and for each of the last few months
-- (the shop's time zone): quotes sent and how many of those were accepted, invoices sent,
-- money collected, and what is still owed on that month's invoices. Runs as the caller;
-- owners only.

create or replace function public.owner_dashboard(target_company uuid, months integer default 6)
returns jsonb
language plpgsql stable security invoker set search_path = public, app, pg_temp as $$
declare
  tz text;
  first_month date;
begin
  if not app.is_owner(target_company) then
    raise exception 'Owners only' using errcode = 'insufficient_privilege';
  end if;
  select timezone into tz from public.company where id = target_company;
  first_month := (date_trunc('month', now() at time zone tz)
                  - make_interval(months => greatest(least(months, 24), 1) - 1))::date;

  return jsonb_build_object(
    'statuses', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n from public.job
        where company_id = target_company and deleted_at is null group by status) s),
    'outstanding_cents', (
      select coalesce(sum(total_cents - amount_paid_cents), 0) from public.invoice
      where company_id = target_company and deleted_at is null
        and status in ('sent', 'partially_paid')),
    'months', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'quotes_sent', (
          select count(*) from public.quote q
          where q.company_id = target_company and q.deleted_at is null and q.sent_at is not null
            and date_trunc('month', q.sent_at at time zone tz) = m),
        'quotes_accepted', (
          select count(*) from public.quote q
          where q.company_id = target_company and q.deleted_at is null and q.status = 'accepted'
            and date_trunc('month', q.sent_at at time zone tz) = m),
        'invoiced_cents', (
          select coalesce(sum(i.total_cents), 0) from public.invoice i
          where i.company_id = target_company and i.deleted_at is null and i.status <> 'void'
            and i.sent_at is not null and date_trunc('month', i.sent_at at time zone tz) = m),
        'outstanding_cents', (
          select coalesce(sum(i.total_cents - i.amount_paid_cents), 0) from public.invoice i
          where i.company_id = target_company and i.deleted_at is null
            and i.status in ('sent', 'partially_paid')
            and date_trunc('month', i.sent_at at time zone tz) = m),
        'collected_cents', (
          select coalesce(sum(p.amount_cents), 0) from public.payment p
          where p.company_id = target_company and p.deleted_at is null
            and p.status = 'succeeded' and p.paid_at is not null
            and date_trunc('month', p.paid_at at time zone tz) = m)
      ) order by m), '[]'::jsonb)
      from generate_series(first_month::timestamp,
                           date_trunc('month', now() at time zone tz), interval '1 month') m)
  );
end
$$;

revoke all on function public.owner_dashboard(uuid, integer) from public, anon;
grant execute on function public.owner_dashboard(uuid, integer) to authenticated;
