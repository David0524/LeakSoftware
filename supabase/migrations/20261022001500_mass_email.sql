-- Email Customers (owner, 2026-10-22: "send mass email (with some filtering)"). Design:
-- docs/design/2026-10-22-mass-email.md.
--
-- A shop's owner or admin sends one email to the customers a filter picks. The website's server
-- sends it (its own pages and the apps' /api/mass-email calls):
--   1. email_audience_count() counts who it would go to, and who is left out (no email,
--      unsubscribed), for the live count on every platform.
--   2. start_email_campaign() writes the campaign and one row per recipient, each with its own
--      unsubscribe token, in one transaction, checked against the count the person confirmed.
--   3. finish_email_campaign() records how each send went and totals the campaign.
-- The customer's unsubscribe link (unsubscribe_shop / unsubscribe_email) sets the customer's
-- existing marketing_opt_out, which already stops reminder and review emails; reports, quotes,
-- invoices and receipts still go.
--
-- Both tables are server-only: owners and admins read them (the history), nobody writes them
-- directly, and phones never sync them.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.email_campaign (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  subject text not null check (length(btrim(subject)) between 1 and 150),
  body text not null check (length(btrim(body)) between 1 and 10000),
  -- The filter it was sent with: {show, city, days}.
  audience jsonb not null default '{}'::jsonb,
  sent_by uuid references auth.users (id) on delete set null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  sent_at timestamptz
);
select app.make_synced('public.email_campaign');

create table public.email_campaign_recipient (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  campaign_id uuid not null,
  customer_id uuid not null,
  email text not null check (length(email) between 3 and 320),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_id text,
  error text,
  sent_at timestamptz,
  unsubscribed_at timestamptz,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  foreign key (campaign_id, company_id) references public.email_campaign (id, company_id)
    on delete cascade,
  foreign key (customer_id, company_id) references public.customer (id, company_id),
  unique (campaign_id, customer_id)
);
select app.make_synced('public.email_campaign_recipient');
create index email_campaign_recipient_campaign_idx on public.email_campaign_recipient (campaign_id);

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values
  ('email_campaign', 'manager', 'none', null, null, false, 950),
  ('email_campaign_recipient', 'manager', 'none', null, null, false, 960);

-- Access, as the registry generates it (20261012000600_access.sql): managers read, nobody writes.
grant select on public.email_campaign, public.email_campaign_recipient to authenticated;
create policy email_campaign_select on public.email_campaign for select to authenticated
  using (app.is_manager(company_id));
create policy email_campaign_recipient_select on public.email_campaign_recipient
  for select to authenticated using (app.is_manager(company_id));

select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- Who a filter picks
-- ---------------------------------------------------------------------------

/**
 * The customers `audience` picks in the shop, each with why they'd be left out (null: they get
 * it). `audience` is {show, city, days}:
 *   show  'all' (default), 'plan' / 'no_plan' (a current maintenance plan, as the Customers
 *         list counts it: not deleted, not ended before the shop's today), or a customer kind;
 *   city  one of their pools is in this city (any case, extra spaces ignored);
 *   days  they had a job (at their pool or billed to them, not canceled) done or scheduled in
 *         the last N days, and not in the future.
 * Reasons: 'no_email', 'unsubscribed'. Internal; the public functions check the caller.
 */
create or replace function app.email_audience(target_company uuid, audience jsonb)
returns table (customer_id uuid, name text, kind text, email text, reason text)
language sql stable security definer set search_path = public, app, pg_temp as $$
  with f as (
    select coalesce(nullif(audience ->> 'show', ''), 'all') as show,
      nullif(lower(btrim(regexp_replace(coalesce(audience ->> 'city', ''), '\s+', ' ', 'g'))), '')
        as city,
      case when coalesce(audience ->> 'days', '') ~ '^\d{1,4}$'
           then (audience ->> 'days')::integer end as days,
      (now() at time zone coalesce(
        (select timezone from public.company where id = target_company), 'UTC'))::date as today
  )
  select c.id, c.name, c.kind, nullif(btrim(c.email), ''),
    case when nullif(btrim(c.email), '') is null
              or btrim(c.email) !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' then 'no_email'
         when c.marketing_opt_out then 'unsubscribed' end
  from public.customer c, f
  where c.company_id = target_company and c.deleted_at is null
    and (f.show in ('all', 'plan', 'no_plan') or c.kind = f.show)
    and (f.show not in ('plan', 'no_plan') or (f.show = 'plan') = exists (
      select 1 from public.service_plan p
      where p.customer_id = c.id and p.company_id = c.company_id and p.deleted_at is null
        and (p.ends_on is null or p.ends_on >= f.today)))
    and (f.city is null or exists (
      select 1 from public.property pr
      where pr.customer_id = c.id and pr.company_id = c.company_id and pr.deleted_at is null
        and lower(btrim(regexp_replace(coalesce(pr.city, ''), '\s+', ' ', 'g'))) = f.city))
    and (f.days is null or exists (
      select 1 from public.job j
      left join public.property pr on pr.id = j.property_id
      where j.company_id = c.company_id and j.deleted_at is null and j.status <> 'canceled'
        and (j.bill_to_customer_id = c.id or pr.customer_id = c.id)
        and coalesce(j.completed_at, j.scheduled_start) <= now()
        and coalesce(j.completed_at, j.scheduled_start) >= now() - make_interval(days => f.days)))
$$;
revoke all on function app.email_audience(uuid, jsonb) from public;

/**
 * The live count on the Email Customers page: {recipients, no_email, unsubscribed}. Owners and
 * admins only.
 */
create or replace function public.email_audience_count(target_company uuid, audience jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_manager(target_company) then
    raise exception 'Only owners and admins can email customers' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'recipients', count(*) filter (where reason is null),
      'no_email', count(*) filter (where reason = 'no_email'),
      'unsubscribed', count(*) filter (where reason = 'unsubscribed'))
    from app.email_audience(target_company, coalesce(audience, '{}'::jsonb)));
end
$$;

/**
 * What the page needs besides the count: the cities of the shop's pools (A to Z, each once) and
 * how many emails the shop has sent today (its daily allowance, public.use_allowance).
 */
create or replace function public.email_campaign_setup(target_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_manager(target_company) then
    raise exception 'Only owners and admins can email customers' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'cities', coalesce((
      select jsonb_agg(city order by lower(city))
      from (
        select distinct on (lower(btrim(regexp_replace(pr.city, '\s+', ' ', 'g'))))
          btrim(regexp_replace(pr.city, '\s+', ' ', 'g')) as city
        from public.property pr
        join public.customer c on c.id = pr.customer_id and c.deleted_at is null
        where pr.company_id = target_company and pr.deleted_at is null
          and nullif(btrim(pr.city), '') is not null
        order by lower(btrim(regexp_replace(pr.city, '\s+', ' ', 'g'))),
          btrim(regexp_replace(pr.city, '\s+', ' ', 'g'))
      ) cities), '[]'::jsonb),
    'used_today', coalesce((
      select used from app.daily_usage
      where company_id = target_company and day = current_date and kind = 'email'), 0));
end
$$;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

/**
 * Starts a mass email: the campaign and its recipients in one go. `expected` is the count the
 * person confirmed; a different count now means the list changed, and nothing is written.
 * Returns {id, recipients: [{id, customer_id, name, kind, email, token}]}.
 */
create or replace function public.start_email_campaign(
  target_company uuid, subject text, body text, audience jsonb, expected integer)
returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  campaign uuid;
  n integer;
begin
  -- The shop's own owners and admins: Sundeck Pro staff helping in a support session see the
  -- page and history, but never email a shop's customers for it.
  if not (app.is_manager(target_company) and exists (
      select 1 from public.membership
      where company_id = target_company and user_id = auth.uid() and role in ('owner', 'admin')
        and status = 'active' and deleted_at is null)) then
    raise exception 'Only owners and admins can email customers' using errcode = '42501';
  end if;
  select count(*) into n from app.email_audience(target_company, coalesce(audience, '{}'::jsonb))
  where reason is null;
  if n = 0 then
    raise exception 'nobody: no customers to send to';
  end if;
  if expected is distinct from n then
    raise exception 'list_changed: % now, % confirmed', n, expected;
  end if;
  insert into public.email_campaign (company_id, subject, body, audience, sent_by, recipient_count)
  values (target_company, btrim(subject), btrim(body), coalesce(audience, '{}'::jsonb), auth.uid(), n)
  returning id into campaign;
  insert into public.email_campaign_recipient (company_id, campaign_id, customer_id, email)
  select target_company, campaign, a.customer_id, a.email
  from app.email_audience(target_company, coalesce(audience, '{}'::jsonb)) a
  where a.reason is null;
  return jsonb_build_object('id', campaign, 'recipients', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'customer_id', r.customer_id, 'name', c.name, 'kind', c.kind,
      'email', r.email, 'token', r.token) order by c.name, r.id), '[]'::jsonb)
    from public.email_campaign_recipient r
    join public.customer c on c.id = r.customer_id
    where r.campaign_id = campaign));
end
$$;

/**
 * How each send went: `results` is [{id, sent: bool, provider_id?, error?}] for recipients of
 * this campaign. Totals the campaign: sent once every recipient has a result ('failed' when none
 * went). Returns {sent, failed}.
 */
create or replace function public.finish_email_campaign(target_campaign uuid, results jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, app, pg_temp as $$
declare
  co uuid;
  s integer;
  f integer;
  q integer;
begin
  select company_id into co from public.email_campaign where id = target_campaign;
  if co is null or not app.is_manager(co) then
    raise exception 'Only owners and admins can email customers' using errcode = '42501';
  end if;
  update public.email_campaign_recipient r
  set status = case when (x ->> 'sent')::boolean then 'sent' else 'failed' end,
      provider_id = left(x ->> 'provider_id', 200),
      error = left(x ->> 'error', 500),
      sent_at = case when (x ->> 'sent')::boolean then now() end
  from jsonb_array_elements(coalesce(results, '[]'::jsonb)) x
  where r.campaign_id = target_campaign and r.id = app.try_uuid(x ->> 'id')
    and r.status = 'queued';
  select count(*) filter (where status = 'sent'), count(*) filter (where status = 'failed'),
         count(*) filter (where status = 'queued')
  into s, f, q
  from public.email_campaign_recipient where campaign_id = target_campaign;
  update public.email_campaign
  set sent_count = s, failed_count = f,
      status = case when q > 0 then 'sending' when s = 0 then 'failed' else 'sent' end,
      sent_at = case when q = 0 then coalesce(sent_at, now()) end
  where id = target_campaign;
  return jsonb_build_object('sent', s, 'failed', f);
end
$$;

revoke all on function public.email_audience_count(uuid, jsonb),
  public.email_campaign_setup(uuid),
  public.start_email_campaign(uuid, text, text, jsonb, integer),
  public.finish_email_campaign(uuid, jsonb) from public, anon;
grant execute on function public.email_audience_count(uuid, jsonb),
  public.email_campaign_setup(uuid),
  public.start_email_campaign(uuid, text, text, jsonb, integer),
  public.finish_email_campaign(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Unsubscribe (the customer's link; no sign-in)
-- ---------------------------------------------------------------------------

/** The shop's name for the unsubscribe page, or null for a link that doesn't work. */
create or replace function public.unsubscribe_shop(link_token text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select co.name from public.email_campaign_recipient r
  join public.company co on co.id = r.company_id
  where r.token = link_token and r.deleted_at is null
$$;

/**
 * The customer unsubscribes: no more mass, reminder or review emails from this shop
 * (customer.marketing_opt_out). Returns the shop's name, or null for a link that doesn't work.
 * Saying it twice is fine.
 */
create or replace function public.unsubscribe_email(link_token text) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r public.email_campaign_recipient;
begin
  select * into r from public.email_campaign_recipient
  where token = link_token and deleted_at is null;
  if r.id is null then
    return null;
  end if;
  update public.email_campaign_recipient set unsubscribed_at = coalesce(unsubscribed_at, now())
  where id = r.id;
  update public.customer set marketing_opt_out = true
  where id = r.customer_id and company_id = r.company_id and not marketing_opt_out;
  return (select name from public.company where id = r.company_id);
end
$$;

revoke all on function public.unsubscribe_shop(text), public.unsubscribe_email(text) from public;
grant execute on function public.unsubscribe_shop(text), public.unsubscribe_email(text)
  to anon, authenticated, service_role;
