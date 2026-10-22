-- A first win within about 60 seconds (owner, 2026-10-22: "pre-fill one sample job for the day
-- (marked as a sample), open it to a finished report with their own logo, then prompt 'Send
-- yourself this report'"; docs/design/2026-10-22-first-win.md).
--
--   job.sample                 the shop's sample job: made once, by create_company, for leak
--                              detection shops (Leak Detection or Both). Set by the server
--                              only (no client grant), synced like every job column, so all
--                              four platforms see it and show the Sample pill.
--   app.config_default         'sample_job': the made-up customer, pool, verdicts, tests,
--                              findings and report text (config, not code).
--   app.create_sample_job      builds it on today's schedule for the owner, with its report
--                              finished (status sent, a link) so it opens finished.
--   public.delete_sample_job   removes it and everything made for it; a removed sample never
--                              comes back (a shop gets one, ever).
--
-- A sample is never counted: no Activity (app.record_activity skips it, so the weekly
-- summary's jobs done skip it too), no report-opened push, not in the Dashboard's statuses or the
-- weekly summary's coming week, and it has no fee, quote, invoice or payment. Its report follows
-- the shop's name, logo, colors and contact details from Settings (the only report allowed to
-- change after it's finished: it never went to a customer).

alter table public.job add column sample boolean not null default false;

-- ---------------------------------------------------------------------------
-- The sample's content
-- ---------------------------------------------------------------------------

insert into app.config_default (key, rows) values
('sample_job', $json$[{
  "customer": {"name": "Sample Customer"},
  "property": {"address_line1": "123 Sample Way", "pool_type": "gunite_plaster",
               "has_spa": true, "diagram_shape": "kidney", "approx_gallons": 18000,
               "access_notes": "Sample job: made up to show a finished report."},
  "start": "09:00",
  "hours": 2,
  "summary_notes": "Sample job. Customer reports losing about an inch a day. Return line fails a pressure test.",
  "verdicts": {
    "return": {"outcome": "leaking", "method": "Pressure test",
               "location": "Under the deck, about 6 ft from the return fitting"},
    "light": {"outcome": "attention", "method": "Dye test", "location": "Pool light niche"}
  },
  "not_applicable": ["vinyl_stretched", "vinyl_tears"],
  "tests": [
    {"type": "bucket", "outcome": "fail", "hours_before": 24,
     "data": {"pool_start_in": 10, "pool_end_in": 9.25, "bucket_start_in": 10,
              "bucket_end_in": 9.94, "duration_hours": 24},
     "computed": {"pool_loss_in": 0.75, "bucket_loss_in": 0.06, "unexplained_loss_in": 0.69,
                  "unexplained_in_per_day": 0.69}},
    {"type": "pressure", "component": "return", "outcome": "fail", "minutes_in": 30,
     "data": {"line_name": "Returns", "start_psi": 20, "end_psi": 12, "duration_min": 15},
     "computed": {"drop_psi": 8, "drop_psi_per_min": 0.533}},
    {"type": "dye", "component": "return", "outcome": "fail", "minutes_in": 60,
     "data": {"location": "Return fitting", "observation": "Dye drawn in (leak)"},
     "notes": "Steady draw at the fitting."}
  ],
  "findings": [
    {"component": "return", "title": "Return line break",
     "location": "Under the deck, about 6 ft from the return fitting", "severity": "major",
     "status": "open", "pin_x": 0.42, "pin_y": 0.18,
     "notes": "Lost 8 PSI in 15 minutes. Dye confirms the leak at the fitting."},
    {"component": "light", "title": "Light niche seal worn", "location": "Pool light niche",
     "severity": "minor", "status": "monitor", "pin_x": 0.81, "pin_y": 0.66,
     "notes": "No draw today. Recheck at the next visit."}
  ],
  "report": [
    {"key": "summary", "title": "Summary",
     "text": "This is a sample report: the customer, pool, and findings are made up to show what your customers receive. The pool was losing about 3/4 inch a day more than evaporation. We found a leak in the return line under the deck, about 6 feet from the return fitting, confirmed by a pressure test and a dye test. The rest of the plumbing and the shell held."},
    {"key": "findings", "title": "What we found",
     "text": "Return line: the line lost 8 PSI in 15 minutes under pressure, and dye drew in at the return fitting. This break is the main source of the water loss and should be repaired.\n\nPool light niche: the seal around the light niche is worn. It isn't leaking today, so we recommend watching it."},
    {"key": "next_steps", "title": "What happens next",
     "text": "Repair the return line: open the deck above the break, replace the damaged section, and pressure test the line again. We'll send a quote for the repair.\n\nWe'll recheck the light niche seal at the next visit. A bucket test after the repair confirms the water loss has stopped."}
  ],
  "unsigned_reason": "Sample report: there is no customer to sign it."
}]$json$);

-- ---------------------------------------------------------------------------
-- Making it
-- ---------------------------------------------------------------------------

-- The shop's sample job for `owner`, on today's schedule, with its report finished. Returns
-- the job, or null when the shop already had one (even a deleted one) or has no leak checklist.
create or replace function app.create_sample_job(target_company uuid, owner uuid)
returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  cfg jsonb := (select rows -> 0 from app.config_default where key = 'sample_job');
  tz text;
  starts timestamptz;
  cust uuid;
  prop uuid;
  new_job uuid;
  rep uuid;
  c record;
  comp uuid;
  comps jsonb := '{}'::jsonb;
  verdict jsonb;
  t jsonb;
  f jsonb;
  snap jsonb;
begin
  if cfg is null or exists (select 1 from public.job where company_id = target_company and sample) then
    return null;
  end if;
  if not exists (select 1 from public.component_type
                 where company_id = target_company and job_type = 'detection' and deleted_at is null) then
    return null;
  end if;
  select timezone into tz from public.company where id = target_company;
  starts := ((now() at time zone tz)::date + (cfg ->> 'start')::time) at time zone tz;

  insert into public.customer (company_id, kind, name)
  values (target_company, 'homeowner', cfg -> 'customer' ->> 'name')
  returning id into cust;
  insert into public.property
    (company_id, customer_id, address_line1, pool_type, has_pool, has_spa, diagram_shape,
     approx_gallons, access_notes, geocoded_address)
  values
    (target_company, cust, cfg -> 'property' ->> 'address_line1',
     cfg -> 'property' ->> 'pool_type', true, (cfg -> 'property' ->> 'has_spa')::boolean,
     cfg -> 'property' ->> 'diagram_shape', (cfg -> 'property' ->> 'approx_gallons')::integer,
     cfg -> 'property' ->> 'access_notes',
     -- Counted as looked up, so no phone or server spends a paid map lookup on a made-up address.
     cfg -> 'property' ->> 'address_line1')
  returning id into prop;

  insert into public.job
    (company_id, type, property_id, bill_to_customer_id, status, assigned_user_id,
     scheduled_start, scheduled_end, started_at, summary_notes, sample)
  values
    (target_company, 'detection', prop, cust, 'in_progress', owner,
     starts, starts + make_interval(hours => (cfg ->> 'hours')::integer), starts,
     cfg ->> 'summary_notes', true)
  returning id into new_job;
  -- No job number: the shop's first real job is still its first number.
  update public.job set number = null where id = new_job;
  delete from app.company_counter where company_id = target_company and kind = 'job';

  -- The checklist: the shop's own leak items, each with its verdict.
  for c in
    select ct.id, ct.key, ct.name, ct.sort_order from public.component_type ct
    where ct.company_id = target_company and ct.job_type = 'detection' and ct.deleted_at is null
    order by ct.sort_order
  loop
    insert into public.job_component
      (company_id, job_id, component_type_id, instance_number, label, sort_order)
    values (target_company, new_job, c.id, 1, c.name, c.sort_order * 1000 + 1)
    returning id into comp;
    comps := comps || jsonb_build_object(c.key, comp);
    verdict := cfg -> 'verdicts' -> c.key;
    if cfg -> 'not_applicable' ? c.key then
      insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
      values (target_company, new_job, comp, 'excluded');
    else
      insert into public.checklist_item_result
        (company_id, job_id, job_component_id, status, method, outcome, location_text,
         inspected_at, inspected_by)
      values (target_company, new_job, comp, 'inspected', verdict ->> 'method',
              coalesce(verdict ->> 'outcome', 'ok'), verdict ->> 'location',
              starts + interval '30 minutes', owner);
    end if;
  end loop;

  for t in select * from jsonb_array_elements(cfg -> 'tests') loop
    insert into public.test_result
      (company_id, job_id, job_component_id, test_type_id, schema_version, data, computed,
       outcome, performed_at, notes)
    select target_company, new_job, (comps ->> (t ->> 'component'))::uuid, tt.id,
           tt.schema_version, t -> 'data', coalesce(t -> 'computed', '{}'::jsonb), t ->> 'outcome',
           starts + make_interval(mins => coalesce((t ->> 'minutes_in')::integer, 0))
                  - make_interval(hours => coalesce((t ->> 'hours_before')::integer, 0)),
           t ->> 'notes'
    from public.test_type tt
    where tt.company_id = target_company and tt.key = t ->> 'type' and tt.deleted_at is null;
  end loop;

  for f in select * from jsonb_array_elements(cfg -> 'findings') loop
    insert into public.finding
      (company_id, job_id, job_component_id, title, location_text, severity_key, pin_x, pin_y,
       status, notes)
    values (target_company, new_job, (comps ->> (f ->> 'component'))::uuid, f ->> 'title',
            f ->> 'location', f ->> 'severity', (f ->> 'pin_x')::numeric,
            (f ->> 'pin_y')::numeric, f ->> 'status', f ->> 'notes');
  end loop;

  -- The report, finished as send_report finishes one (app.send_report_unchecked), with the
  -- reason nobody signed and the job marked as a sample in its snapshot.
  insert into public.report (company_id, job_id, template_key, version, final_sections)
  values (target_company, new_job, 'homeowner', 1, cfg -> 'report')
  returning id into rep;
  snap := app.report_snapshot(new_job);
  snap := snap
    || jsonb_build_object('job', coalesce(snap -> 'job', '{}'::jsonb) || '{"sample": true}'::jsonb,
                          'sign_off', jsonb_build_object('unsigned_reason', cfg ->> 'unsigned_reason'));
  update public.report set status = 'sent', sent_at = now(), data_snapshot = snap where id = rep;
  insert into public.share_link (company_id, job_id, report_id) values (target_company, new_job, rep);
  update public.job set status = 'report_sent' where id = new_job;
  return new_job;
end
$$;
revoke all on function app.create_sample_job(uuid, uuid) from public;

-- create_company as 20261012005300_trial_30_days.sql, with the sample for leak detection
-- shops. Made before the subscription row, so a shop that must add a card first still gets
-- it, and never in a way that stops a shop from being created.
create or replace function public.create_company(
  company_name text, company_timezone text default null, company_services text default 'both')
returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  caller uuid := auth.uid();
  new_company uuid;
begin
  if caller is null then
    raise exception 'Sign in before creating a company' using errcode = 'insufficient_privilege';
  end if;
  if company_timezone is not null and not exists (
    select 1 from pg_timezone_names where name = company_timezone) then
    raise exception 'Unknown time zone %', company_timezone using errcode = 'invalid_parameter_value';
  end if;
  if company_services not in ('pool', 'leak', 'both') then
    raise exception 'Unknown services %', company_services using errcode = 'invalid_parameter_value';
  end if;

  insert into public.company (name, timezone)
  values (trim(company_name), coalesce(company_timezone, 'America/New_York'))
  returning id into new_company;
  update public.company
  set settings = settings || jsonb_build_object('services', company_services)
  where id = new_company;

  insert into public.membership (company_id, user_id, role) values (new_company, caller, 'owner');
  perform app.seed_company_defaults(new_company, company_services);
  if company_services in ('leak', 'both') then
    begin
      perform app.create_sample_job(new_company, caller);
    exception when others then
      raise warning 'sample job not made: %', sqlerrm;
    end;
  end if;
  insert into public.subscription (company_id, status, trial_ends_at, card_required)
  values (new_company, 'trialing', now() + interval '30 days',
          coalesce((select (value)::text::boolean from app.platform_setting
                    where key = 'card_required_at_signup'), false));

  return new_company;
end
$$;

-- ---------------------------------------------------------------------------
-- Deleting it
-- ---------------------------------------------------------------------------

-- Removes the shop's sample job and what was made for it: its checklist, tests, findings,
-- report and link, and its made-up customer and pool. Any member who can see it may. Returns
-- whether there was one to delete.
create or replace function public.delete_sample_job(target_job uuid) returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  j public.job;
begin
  select * into j from public.job where id = target_job and sample and deleted_at is null;
  if j.id is null or not app.is_member(j.company_id)
     or not app.job_visible(j.company_id, j.id) then
    return false;
  end if;
  update public.share_link set revoked_at = coalesce(revoked_at, now()), deleted_at = now()
  where job_id = j.id and deleted_at is null;
  update public.report set deleted_at = now() where job_id = j.id and deleted_at is null;
  update public.finding set deleted_at = now() where job_id = j.id and deleted_at is null;
  update public.test_result set deleted_at = now() where job_id = j.id and deleted_at is null;
  update public.checklist_item_result set deleted_at = now() where job_id = j.id and deleted_at is null;
  update public.job_component set deleted_at = now() where job_id = j.id and deleted_at is null;
  update public.job set deleted_at = now() where id = j.id;
  -- Its made-up pool and customer, unless the shop has used them for something real since.
  update public.property p set deleted_at = now()
  where p.id = j.property_id and p.deleted_at is null
    and not exists (select 1 from public.job o where o.property_id = p.id and o.id <> j.id
                    and o.deleted_at is null);
  update public.customer c set deleted_at = now()
  where c.id = j.bill_to_customer_id and c.deleted_at is null
    and not exists (select 1 from public.job o where o.bill_to_customer_id = c.id and o.id <> j.id
                    and o.deleted_at is null)
    and not exists (select 1 from public.property p where p.customer_id = c.id
                    and p.deleted_at is null);
  return true;
end
$$;
revoke all on function public.delete_sample_job(uuid) from public;
grant execute on function public.delete_sample_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Its report: finished, but following the shop's details
-- ---------------------------------------------------------------------------

-- As 20261012000400_documents_and_money.sql, except a sample job's report: it never went to a
-- customer, so its snapshot may follow the shop (name, logo, colors) and it may be deleted with
-- the sample. Its text stays as it is.
create or replace function app.freeze_sent_report() returns trigger
language plpgsql as $$
begin
  if old.status in ('sent', 'superseded') then
    if new.status = 'superseded' and old.status = 'sent'
       and (to_jsonb(new) - array['status', 'updated_at', 'sync_xid', 'field_hlc'])
           = (to_jsonb(old) - array['status', 'updated_at', 'sync_xid', 'field_hlc']) then
      return new;
    end if;
    if new.status = old.status
       and (to_jsonb(new) - array['data_snapshot', 'deleted_at', 'updated_at', 'sync_xid', 'field_hlc'])
           = (to_jsonb(old) - array['data_snapshot', 'deleted_at', 'updated_at', 'sync_xid', 'field_hlc'])
       and exists (select 1 from public.job j where j.id = old.job_id and j.sample) then
      return new;
    end if;
    raise exception 'Report % has been sent and cannot be changed', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- The shop's name, logo, colors, contact details or disclaimer changed in Settings: the sample's
-- report shows them (owner: "with their own logo").
create or replace function app.sample_report_follows_shop() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  r record;
  shop jsonb;
begin
  for r in
    select rp.id, rp.job_id, rp.data_snapshot from public.report rp
    join public.job j on j.id = rp.job_id
    where j.company_id = new.id and j.sample and j.deleted_at is null
      and rp.deleted_at is null and rp.status = 'sent'
  loop
    shop := app.report_snapshot(r.job_id) -> 'company';
    if shop is not null and shop is distinct from r.data_snapshot -> 'company' then
      update public.report set data_snapshot = data_snapshot || jsonb_build_object('company', shop)
      where id = r.id;
    end if;
  end loop;
  return null;
end
$$;
revoke all on function app.sample_report_follows_shop() from public;
create trigger sample_report_follows_shop
  after update of name, legal_name, phone, email, address_line1, address_line2, city, state,
    postal_code, logo_path, brand_primary, brand_secondary, timezone, settings
  on public.company
  for each row execute function app.sample_report_follows_shop();

-- ---------------------------------------------------------------------------
-- Never counted
-- ---------------------------------------------------------------------------

-- As 20261022000200_feedback_loops.sql, but a sample job makes no Activity.
create or replace function app.record_activity(
  target_company uuid, event_kind text, target_job uuid, target_conversation uuid,
  subject uuid, actor uuid, customer text, amount integer default null,
  assignee uuid default null, scheduled timestamptz default null, text_preview text default null)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if target_job is not null
     and exists (select 1 from public.job where id = target_job and sample) then
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

-- As 20261022000200_feedback_loops.sql, but the sample's report (opened by the owner from the
-- email they sent themselves) is never "opened by the customer".
create or replace function public.record_report_opened(link_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  sl public.share_link;
  rep public.report;
  who text;
  new_id uuid;
begin
  select * into sl from public.share_link
  where token = link_token and revoked_at is null and deleted_at is null
    and (expires_at is null or expires_at > now());
  if sl.id is null or sl.report_id is null then
    return null;
  end if;
  select * into rep from public.report
  where id = sl.report_id and status in ('sent', 'superseded') and deleted_at is null;
  if rep.id is null or rep.template_key = 'maintenance'
     or exists (select 1 from public.job where id = rep.job_id and sample) then
    return null;
  end if;
  who := app.job_customer_name(rep.job_id);
  insert into public.activity (company_id, kind, job_id, subject_id, customer_name, job_number,
    created_at, notified_at)
  values (rep.company_id, 'report_opened', rep.job_id, rep.id, nullif(btrim(who), ''),
    (select number from public.job where id = rep.job_id), clock_timestamp(), clock_timestamp())
  on conflict (kind, subject_id)
    where kind in ('quote_accepted', 'payment_received', 'report_signed', 'report_sent',
                   'report_opened', 'text_received')
    do nothing
  returning id into new_id;
  if new_id is null then
    return null;
  end if;
  return jsonb_build_object('company_id', rep.company_id, 'job_id', rep.job_id,
    'report_id', rep.id, 'customer_name', who);
end
$$;

-- The Dashboard's job counts leave the sample out (as 20261012005200_admin_role.sql otherwise).
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
