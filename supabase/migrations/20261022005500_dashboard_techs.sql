-- The Dashboard by tech (owner, 2026-11-24: "Tech specific stats in the dashboard"):
-- owner_dashboard also returns `techs`, one entry per tech over the same months, each job
-- counting for its assigned tech (not the second tech, so money isn't counted twice):
--   jobs_done        jobs finished in that time (not canceled or skipped)
--   jobs_open        jobs not yet finished in the field, as of now
--   invoiced_cents   invoices sent on their jobs (not void)
--   collected_cents  payments received on their jobs (deposits included)
--   thumbs_up/_down  customer feedback on their jobs
--   on_site_minutes  average start to finish on the jobs done (null when none)
-- Every active tech is listed, even with zeros; owners and turned-off techs only when they
-- have something. Most collected first.

create or replace function public.owner_dashboard(target_company uuid, months integer default 6)
returns jsonb
language plpgsql stable security invoker set search_path = public, app, pg_temp as $$
declare
  tz text;
  first_month date;
  since timestamptz;
  techs jsonb;
begin
  if not app.is_manager(target_company) then
    raise exception 'Owners only' using errcode = 'insufficient_privilege';
  end if;
  select timezone into tz from public.company where id = target_company;
  first_month := (date_trunc('month', now() at time zone tz)
                  - make_interval(months => greatest(least(months, 24), 1) - 1))::date;
  since := first_month::timestamp at time zone tz;

  -- By tech: each job counts for its assigned tech, over the same months.
  with jobs as (
    select id, assigned_user_id as uid, status, started_at, completed_at,
           completed_at >= since and status not in ('canceled', 'skipped') as done
    from public.job
    where company_id = target_company and deleted_at is null and not sample
      and assigned_user_id is not null),
  per_job as (
    select uid,
      count(*) filter (where done) as jobs_done,
      count(*) filter (where status in ('unscheduled', 'scheduled', 'in_progress')) as jobs_open,
      -- Start to finish on the jobs done. A job left running for 12 hours or more (overnight)
      -- isn't time on site, so it's left out.
      round(avg(extract(epoch from completed_at - started_at) / 60) filter (
        where done and completed_at > started_at
          and completed_at - started_at < interval '12 hours'))::int as on_site_minutes
    from jobs group by uid),
  per_invoice as (
    select j.uid, sum(i.total_cents) as invoiced_cents
    from public.invoice i join jobs j on j.id = i.job_id
    where i.company_id = target_company and i.deleted_at is null and i.status <> 'void'
      and i.sent_at >= since
    group by j.uid),
  per_payment as (
    -- A deposit is paid on the quote, the rest on the invoice; both belong to the job.
    select j.uid, sum(p.amount_cents) as collected_cents
    from public.payment p
    left join public.invoice i on i.id = p.invoice_id and i.company_id = target_company
    left join public.quote q on q.id = p.quote_id and q.company_id = target_company
    join jobs j on j.id = coalesce(i.job_id, q.job_id)
    where p.company_id = target_company and p.deleted_at is null
      and p.status = 'succeeded' and p.paid_at >= since
    group by j.uid),
  per_feedback as (
    select j.uid, count(*) filter (where f.rating = 'up') as thumbs_up,
           count(*) filter (where f.rating = 'down') as thumbs_down
    from public.customer_feedback f join jobs j on j.id = f.job_id
    where f.company_id = target_company and f.deleted_at is null and f.created_at >= since
    group by j.uid),
  rows as (
    select mb.user_id, coalesce(nullif(pr.full_name, ''), pr.email, 'Teammate') as name,
           mb.color, mb.status = 'active' as active,
           coalesce(a.jobs_done, 0) as jobs_done, coalesce(a.jobs_open, 0) as jobs_open,
           coalesce(b.invoiced_cents, 0) as invoiced_cents,
           coalesce(c.collected_cents, 0) as collected_cents,
           coalesce(d.thumbs_up, 0) as thumbs_up, coalesce(d.thumbs_down, 0) as thumbs_down,
           a.on_site_minutes
    from public.membership mb
    left join public.profile pr on pr.id = mb.user_id
    left join per_job a on a.uid = mb.user_id
    left join per_invoice b on b.uid = mb.user_id
    left join per_payment c on c.uid = mb.user_id
    left join per_feedback d on d.uid = mb.user_id
    where mb.company_id = target_company and mb.deleted_at is null
      -- Every active tech, even with nothing yet; anyone else (owners, turned-off techs) when
      -- they have something to show.
      and ((mb.status = 'active' and mb.role = 'tech')
           or coalesce(a.jobs_done, 0) + coalesce(a.jobs_open, 0) + coalesce(b.invoiced_cents, 0)
              + coalesce(c.collected_cents, 0) + coalesce(d.thumbs_up, 0)
              + coalesce(d.thumbs_down, 0) > 0))
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'name', name, 'color', color, 'active', active,
      'jobs_done', jobs_done, 'jobs_open', jobs_open, 'invoiced_cents', invoiced_cents,
      'collected_cents', collected_cents, 'thumbs_up', thumbs_up, 'thumbs_down', thumbs_down,
      'on_site_minutes', on_site_minutes)
    order by collected_cents desc, jobs_done desc, name), '[]'::jsonb)
  into techs from rows;

  return jsonb_build_object(
    'techs', techs,
    'statuses', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n from public.job
        where company_id = target_company and deleted_at is null and not sample
        group by status) s),
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
