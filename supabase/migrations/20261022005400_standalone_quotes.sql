-- Standalone quotes (owner, 2026-11-24: "instead of creating a full job, we should be able to
-- just create a quote for a new/existing customer"; docs/design/2026-11-24-standalone-quotes.md).
--
-- New Quote makes a quote-only job: type 'repair', status 'quote', the customer in
-- bill_to_customer_id, the pool optional. It never shows in Jobs, Schedule, Today, Needs a
-- Time, Plan Week, the dashboard's job counts, search's jobs, or a customer's visits: every
-- list leaves out status 'quote'. It takes no job number until it becomes a job. When the
-- customer accepts, the same job becomes the unscheduled repair job (no second job is made).
-- Accepted with no pool, and the customer has none, it waits under Quotes; adding the pool
-- makes it the repair job.

-- 1. The status. A quote job starts as 'quote' and only the server moves it on.
insert into app.job_status_transition (from_status, to_status) values
  ('quote', 'unscheduled');

create or replace function app.job_initial_statuses() returns text[]
language sql immutable as $$ select array['unscheduled', 'scheduled', 'in_progress', 'quote'] $$;

create or replace function app.check_job_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not (new.status = any (app.job_initial_statuses())) then
      raise exception 'A job cannot start as %', new.status using errcode = 'check_violation';
    end if;
    if new.status = 'quote' and new.type <> 'repair' then
      raise exception 'A quote job is a repair' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not exists (
      select 1 from app.job_status_transition
      where from_status = old.status and to_status = new.status)
    then
      raise exception 'Job status cannot change from % to %', old.status, new.status
        using errcode = 'check_violation';
    end if;
    if current_user in ('authenticated', 'anon')
       and (new.status = any (app.job_server_statuses()) or old.status = 'quote') then
      raise exception 'Job status % is set by the server', new.status
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;

-- 2. The pool is optional on a quote job only.
alter table public.job alter column property_id drop not null;
alter table public.job add constraint job_property_needed
  check (property_id is not null or status = 'quote');

-- 3. No job number until it is a job (numbers are what the office reads as "Job #1042").
create or replace function app.assign_job_number() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  -- On update, only a quote job becoming a job (the sample job keeps no number).
  if new.number is null and new.status <> 'quote'
     and (tg_op = 'INSERT' or old.status = 'quote') then
    new.number := app.next_number(new.company_id, 'job');
  end if;
  return new;
end
$$;
drop trigger assign_number on public.job;
create trigger assign_number before insert or update of status on public.job
  for each row execute function app.assign_job_number();

-- 4. Accepting. A quote job becomes the repair job itself: its pool (or the customer's
-- newest), unscheduled, numbered. Other quotes make a repair job as before.
create or replace function app.accept_quote(
  target_quote uuid, signer text, from_ip inet, agent text) returns public.quote
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  q public.quote;
  j public.job;
  repair uuid;
  pool uuid;
begin
  select * into q from public.quote where id = target_quote for update;
  select * into j from public.job where id = q.job_id for update;
  if j.status = 'quote' then
    repair := j.id;
    pool := coalesce(j.property_id, (
      select p.id from public.property p
      where p.customer_id = j.bill_to_customer_id and p.company_id = j.company_id
        and p.deleted_at is null
      order by p.created_at desc limit 1));
    if pool is not null then
      update public.job
      set property_id = pool, status = 'unscheduled',
          summary_notes = coalesce(nullif(btrim(summary_notes), '') || E'\n', '')
            || 'Repair from quote #' || coalesce(q.number::text, '')
      where id = j.id;
    end if;
  else
    insert into public.job (company_id, type, property_id, bill_to_customer_id, parent_job_id,
                            status, summary_notes)
    values (q.company_id, 'repair', j.property_id, j.bill_to_customer_id, j.id, 'unscheduled',
            'Repair from quote #' || coalesce(q.number::text, '') || ' (job #'
            || coalesce(j.number::text, '') || ')')
    returning id into repair;
  end if;
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

-- An accepted quote job that waited for its pool becomes the repair job when one is added.
create or replace function app.quote_job_gets_pool() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.status = 'quote' and new.property_id is not null and old.property_id is null
     and exists (select 1 from public.quote q
                 where q.job_id = new.id and q.status = 'accepted' and q.deleted_at is null) then
    new.status := 'unscheduled';
    new.number := coalesce(new.number, app.next_number(new.company_id, 'job'));
  end if;
  return new;
end
$$;
create trigger a_quote_job_gets_pool before update of property_id on public.job
  for each row execute function app.quote_job_gets_pool();

-- 5. Activity: a quote job's own events stay quiet until it is a job; its acceptance shows.
create or replace function app.record_activity(
  target_company uuid, event_kind text, target_job uuid, target_conversation uuid,
  subject uuid, actor uuid, customer text, amount integer default null,
  assignee uuid default null, scheduled timestamptz default null, text_preview text default null)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if target_job is not null
     and exists (select 1 from public.job where id = target_job
                 and (sample or (status = 'quote' and event_kind <> 'quote_accepted'))) then
    return;
  end if;
  insert into public.activity (company_id, kind, job_id, conversation_id, subject_id, actor_id,
    customer_name, job_number, amount_cents, assignee_id, scheduled_at, preview, created_at)
  values (target_company, event_kind, target_job, target_conversation, subject, actor,
    nullif(btrim(customer), ''),
    (select number from public.job where id = target_job),
    amount, assignee, scheduled, text_preview,
    clock_timestamp())
  on conflict (kind, subject_id)
    where kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
                   'report_opened', 'text_received')
    do nothing;
exception when others then
  raise warning 'activity: % not recorded: %', event_kind, sqlerrm;
end
$$;
-- 6. The dashboard counts jobs, not quotes waiting to become jobs.
create or replace function public.owner_dashboard(target_company uuid, months integer default 6)
returns jsonb
language plpgsql stable security invoker set search_path = public, app, pg_temp as $$
declare
  tz text;
  first_month date;
begin
  if not app.is_manager(target_company) then
    raise exception 'Owners only' using errcode = 'insufficient_privilege';
  end if;
  select timezone into tz from public.company where id = target_company;
  first_month := (date_trunc('month', now() at time zone tz)
                  - make_interval(months => greatest(least(months, 24), 1) - 1))::date;

  return jsonb_build_object(
    'statuses', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n from public.job
        where company_id = target_company and deleted_at is null and not sample
          and status <> 'quote'
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

-- 7. Search finds a quote job's quote, not the job.
create or replace function public.search_candidates(target_company uuid, words text[],
  digits text default null)
returns jsonb
language plpgsql stable security invoker set search_path = public, app, extensions, pg_temp as $$
declare
  -- Letters and digits only, so each is safe inside a pattern.
  ws text[] := array(select w from unnest(coalesce(words, '{}')) w
                     where w ~ '^[a-z0-9]+$' limit 8);
  -- The words that aren't numbers name a customer; numbers can also be a job's number.
  names text[] := array(select w from unnest(ws) w where w !~ '^[0-9]+$');
  nums text[] := array(select w from unnest(ws) w where w ~ '^[0-9]{1,9}$');
  -- The longest word narrows through the trigram index; every word is checked after.
  longest text := (select w from unnest(ws) w order by length(w) desc limit 1);
  longest_name text := (select w from unnest(names) w order by length(w) desc limit 1);
  wanted_phone text := case when digits ~ '^[0-9]{4,15}$' then digits end;
  cap constant integer := 100;
  named uuid[] := '{}';
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this shop' using errcode = 'insufficient_privilege';
  end if;
  if cardinality(ws) = 0 and wanted_phone is null then
    return jsonb_build_object('customers', '[]'::jsonb, 'pools', '[]'::jsonb,
      'jobs', '[]'::jsonb, 'quotes', '[]'::jsonb, 'invoices', '[]'::jsonb);
  end if;

  -- Customers whose name every non-number word starts a word of (for jobs, quotes, invoices).
  if longest_name is not null then
    named := array(
      select c.id from public.customer c
      where c.company_id = target_company and c.deleted_at is null
        and app.fold(coalesce(c.name, '') || ' ' || coalesce(c.company_name, '') || ' '
                     || coalesce(c.email, '')) like '%' || longest_name || '%'
        and not exists (select 1 from unnest(names) w
                        where app.fold(c.name) !~ ('(^|[^a-z0-9])' || w))
      limit 500);
  end if;

  return jsonb_build_object(
    'customers', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb) from (
        select c.id, c.name, c.company_name, c.phone, c.email, c.updated_at
        from public.customer c
        where c.company_id = target_company and c.deleted_at is null
          and ((longest is not null
                and app.fold(coalesce(c.name, '') || ' ' || coalesce(c.company_name, '') || ' '
                             || coalesce(c.email, '')) like '%' || longest || '%'
                and not exists (
                  select 1 from unnest(ws) w
                  where app.fold(coalesce(c.name, '') || ' ' || coalesce(c.company_name, '')
                                 || ' ' || coalesce(c.email, '')) !~ ('(^|[^a-z0-9])' || w)))
               or (wanted_phone is not null
                   and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')
                       like '%' || wanted_phone || '%'))
        order by c.name
        limit cap) r),
    'pools', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.address_line1), '[]'::jsonb) from (
        select p.id, p.customer_id, p.address_line1, p.city, p.state, p.postal_code,
               c.name as customer_name
        from public.property p
        left join public.customer c on c.id = p.customer_id
        where p.company_id = target_company and p.deleted_at is null
          and longest is not null
          and app.fold(coalesce(p.address_line1, '') || ' ' || coalesce(p.city, ''))
              like '%' || longest || '%'
          and not exists (
            select 1 from unnest(ws) w
            where app.fold(coalesce(p.address_line1, '') || ' ' || coalesce(p.city, ''))
                  !~ ('(^|[^a-z0-9])' || w))
        order by p.address_line1
        limit cap) r),
    'jobs', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'exact' order by r.exact desc,
                                r.scheduled_start desc nulls last, r.created_at desc), '[]'::jsonb)
      from (
        select j.id, j.number, j.type, j.status, j.scheduled_start, j.created_at,
               coalesce(b.name, o.name) as customer_name,
               j.number::text = any (nums) as exact
        from public.job j
        left join public.customer b on b.id = j.bill_to_customer_id
        left join public.property p on p.id = j.property_id
        left join public.customer o on o.id = p.customer_id
        where j.company_id = target_company and j.deleted_at is null and j.status <> 'quote'
          and (exists (select 1 from unnest(nums) n where j.number::text like n || '%')
               or j.bill_to_customer_id = any (named)
               or p.customer_id = any (named))
        order by exact desc, j.scheduled_start desc nulls last, j.created_at desc
        limit cap) r),
    'quotes', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'exact' order by r.exact desc, r.created_at desc),
                      '[]'::jsonb)
      from (
        select q.id, q.job_id, q.number, q.status, q.total_cents, q.created_at,
               coalesce(b.name, o.name) as customer_name,
               q.number::text = any (nums) as exact
        from public.quote q
        join public.job j on j.id = q.job_id
        left join public.customer b on b.id = j.bill_to_customer_id
        left join public.property p on p.id = j.property_id
        left join public.customer o on o.id = p.customer_id
        where q.company_id = target_company and q.deleted_at is null and j.deleted_at is null
          and (exists (select 1 from unnest(nums) n where q.number::text like n || '%')
               or j.bill_to_customer_id = any (named)
               or p.customer_id = any (named))
        order by exact desc, q.created_at desc
        limit cap) r),
    'invoices', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'exact' order by r.exact desc, r.created_at desc),
                      '[]'::jsonb)
      from (
        select i.id, i.job_id, i.number, i.status, i.total_cents, i.amount_paid_cents,
               i.created_at, coalesce(b.name, o.name) as customer_name,
               i.number::text = any (nums) as exact
        from public.invoice i
        join public.job j on j.id = i.job_id
        left join public.customer b on b.id = j.bill_to_customer_id
        left join public.property p on p.id = j.property_id
        left join public.customer o on o.id = p.customer_id
        where i.company_id = target_company and i.deleted_at is null and j.deleted_at is null
          and (exists (select 1 from unnest(nums) n where i.number::text like n || '%')
               or j.bill_to_customer_id = any (named)
               or p.customer_id = any (named))
        order by exact desc, i.created_at desc
        limit cap) r)
  );
end
$$;

revoke all on function public.search_candidates(uuid, text[], text) from public, anon;
grant execute on function public.search_candidates(uuid, text[], text) to authenticated;
