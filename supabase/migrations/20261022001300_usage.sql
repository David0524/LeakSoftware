-- Usage in the Admin portal (owner, 2026-10-22: "track screen time, how users use the app,
-- things like that"; per person, kept in our own database). The website and both apps send
-- which screen is open and for how long (only while in front and in use), their platform and
-- version, and errors people hit. What people do comes from the audit log, which already names
-- who made each change. Only the server writes or reads any of it; staff see it in the portal.
-- Raw events are kept 180 days (app.prune_usage, from the daily cron).

create table public.usage_event (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The shop they were in (company_ref like the other staff tables: Sundeck Pro's records about
  -- a shop, never synced to devices).
  company_ref uuid references public.company (id) on delete cascade,
  platform text not null check (platform in ('web', 'ios', 'android')),
  app_version text check (length(app_version) <= 40),
  kind text not null check (kind in ('screen', 'error')),
  -- Normalized ("/jobs/:id"), packages/core normalizeScreen.
  screen text not null check (screen ~ '^/[a-z0-9:_/-]{0,200}$'),
  duration_ms integer not null default 0 check (duration_ms between 0 and 1800000),
  detail text check (length(detail) <= 200),
  session_id uuid not null,
  at timestamptz not null
);
alter table public.usage_event enable row level security;
revoke all on public.usage_event from public, anon, authenticated;
create index usage_event_user_at_idx on public.usage_event (user_id, at);
create index usage_event_company_at_idx on public.usage_event (company_ref, at);
create index usage_event_at_idx on public.usage_event (at);

-- Who did what, per person, from the audit log (feature use).
create index if not exists audit_log_user_created_idx on public.audit_log (user_id, created_at)
  where user_id is not null;

-- Saves a batch the server has checked and cleaned (packages/core cleanUsageEvents). At most
-- 5,000 events per person per day are kept, so a stuck app can't fill the table. Returns how
-- many were kept.
create or replace function public.record_usage(
  target_user uuid, target_company uuid, from_platform text, version text, events jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  room integer;
  kept integer;
begin
  room := 5000 - (select count(*) from public.usage_event
                  where user_id = target_user and at > now() - interval '1 day');
  if room <= 0 then
    return 0;
  end if;
  insert into public.usage_event
    (user_id, company_ref, platform, app_version, kind, screen, duration_ms, detail, session_id, at)
  select target_user, target_company, from_platform, nullif(left(version, 40), ''),
         e ->> 'kind', e ->> 'screen', coalesce((e ->> 'ms')::integer, 0),
         nullif(left(e ->> 'detail', 200), ''), (e ->> 'session')::uuid, (e ->> 'at')::timestamptz
  from jsonb_array_elements(events) e
  limit room;
  get diagnostics kept = row_count;
  return kept;
end
$$;

-- Raw events older than 180 days go (the daily cron).
create or replace function public.prune_usage() returns integer
language sql security definer set search_path = public, pg_temp as $$
  with gone as (delete from public.usage_event where at < now() - interval '180 days' returning 1)
  select count(*)::integer from gone
$$;

-- One feature key per audit row a person made, or null (labels: packages/core FEATURE_LABELS).
create or replace function app.feature_of(a public.audit_log) returns text
language sql immutable as $$
  select case
    when a.table_name = 'job' and a.field is null then 'job_created'
    when a.table_name = 'job' and a.field = 'status' and a.new_value #>> '{}' = 'in_progress' then 'job_started'
    when a.table_name = 'job' and a.field = 'completed_at' and a.new_value <> 'null'::jsonb then 'job_completed'
    when a.table_name = 'job' and a.field in ('scheduled_start', 'assigned_user_id') then 'job_scheduled'
    when a.table_name = 'customer' and a.field is null then 'customer_added'
    when a.table_name = 'property' and a.field is null then 'pool_added'
    when a.table_name = 'media' and a.field is null then
      case a.new_value ->> 'kind' when 'video' then 'video_added' when 'audio' then 'voice_note_added'
                                  else 'photo_added' end
    when a.table_name = 'checklist_item_result' and a.field = 'status' then 'checklist_item'
    when a.table_name = 'test_result' and a.field is null then 'test_recorded'
    when a.table_name = 'finding' and a.field is null then 'finding_added'
    when a.table_name = 'chemical_reading' and a.field is null then 'chemicals_logged'
    when a.table_name = 'signature' and a.field is null then 'signature'
    when a.table_name = 'quote' and a.field is null then 'quote_made'
    when a.table_name = 'invoice' and a.field is null then 'invoice_made'
    when a.table_name = 'report' and a.field = 'status' and a.new_value #>> '{}' = 'sent' then 'report_sent'
    when a.table_name = 'service_plan' and a.field is null then 'plan_started'
    when a.table_name = 'text_message' and a.field is null then 'text_sent'
    when a.table_name = 'price_book_item' then 'price_book_edited'
  end
$$;

-- Everything the portal shows about use, for the last `days` days, across all shops, one shop
-- (target_company) or one person (target_user).
create or replace function public.admin_usage(
  days integer default 30, target_company uuid default null, target_user uuid default null)
returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  with since as (select now() - make_interval(days => greatest(1, least(days, 180))) as t),
  ev as (
    select e.* from public.usage_event e, since
    where e.at >= since.t
      and (target_company is null or e.company_ref = target_company)
      and (target_user is null or e.user_id = target_user)),
  acts as (
    select a.user_id, a.company_id, a.created_at, app.feature_of(a) as feature
    from public.audit_log a, since
    where a.user_id is not null and a.created_at >= since.t
      and (target_company is null or a.company_id = target_company)
      and (target_user is null or a.user_id = target_user)
      -- Only people's own changes: not the server's, and not sync bookkeeping.
      and a.table_name in ('job', 'customer', 'property', 'media', 'checklist_item_result',
                           'test_result', 'finding', 'chemical_reading', 'signature', 'quote',
                           'invoice', 'report', 'service_plan', 'text_message', 'price_book_item')),
  feats as (select * from acts where feature is not null),
  days_series as (
    select generate_series(date_trunc('day', (select t from since)), date_trunc('day', now()),
                           interval '1 day')::date as day)
  select jsonb_build_object(
    'days', greatest(1, least(days, 180)),
    'people_active', (select count(distinct user_id) from ev),
    'sessions', (select count(distinct session_id) from ev),
    'screen_ms', (select coalesce(sum(duration_ms), 0) from ev where kind = 'screen'),
    'person_days', (select count(*) from (select distinct user_id, at::date from ev where kind = 'screen') x),
    'by_day', (select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'people', (select count(distinct user_id) from ev where at::date = d.day),
        'ms', (select coalesce(sum(duration_ms), 0) from ev where kind = 'screen' and at::date = d.day))
        order by d.day) from days_series d),
    'platforms', (select coalesce(jsonb_agg(p order by p.ms desc), '[]'::jsonb) from (
        select platform, count(distinct user_id) as people, coalesce(sum(duration_ms), 0) as ms
        from ev group by platform) p),
    'versions', (select coalesce(jsonb_agg(v order by v.platform, v.last_at desc), '[]'::jsonb) from (
        select platform, coalesce(app_version, '—') as version, count(distinct user_id) as people,
               max(at) as last_at
        from ev where platform <> 'web' group by platform, coalesce(app_version, '—')) v),
    'screens', (select coalesce(jsonb_agg(s order by s.ms desc), '[]'::jsonb) from (
        select screen, coalesce(sum(duration_ms), 0) as ms, count(*) as views,
               count(distinct user_id) as people
        from ev where kind = 'screen' group by screen order by 2 desc limit 40) s),
    'features', (select coalesce(jsonb_agg(f order by f.n desc), '[]'::jsonb) from (
        select feature, count(*) as n, count(distinct user_id) as people,
               count(distinct company_id) as shops, max(created_at) as last_at
        from feats group by feature) f),
    'errors', (select coalesce(jsonb_agg(r order by r.last_at desc), '[]'::jsonb) from (
        select screen, detail, platform, count(*) as n, count(distinct user_id) as people,
               max(at) as last_at
        from ev where kind = 'error' group by screen, detail, platform
        order by max(at) desc limit 40) r),
    'people', (select coalesce(jsonb_agg(p order by p.ms desc), '[]'::jsonb) from (
        select u.id as user_id, u.email, pr.full_name as name,
               coalesce(sum(e.duration_ms) filter (where e.kind = 'screen'), 0) as ms,
               count(distinct e.at::date) as active_days,
               count(distinct e.session_id) as sessions,
               max(e.at) as last_at,
               (select array_agg(distinct platform) from ev x where x.user_id = u.id) as platforms,
               (select count(*) from feats f where f.user_id = u.id) as actions,
               (select string_agg(distinct c.name, ', ') from public.company c
                where c.id in (select company_ref from ev x where x.user_id = u.id)) as shops
        from ev e join auth.users u on u.id = e.user_id
        left join public.profile pr on pr.id = u.id
        group by u.id, u.email, pr.full_name
        order by 4 desc limit 100) p))
$$;

revoke all on function public.record_usage(uuid, uuid, text, text, jsonb), public.prune_usage(),
  public.admin_usage(integer, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_usage(uuid, uuid, text, text, jsonb), public.prune_usage(),
  public.admin_usage(integer, uuid, uuid) to service_role;
