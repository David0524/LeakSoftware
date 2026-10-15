-- Phones keep recent work, not the shop's whole history (2026-10-15, owner: "Ok" to the
-- proposal in the speed work). A new phone of a three-year-old shop downloaded about 91 MB
-- (160,000 rows) before it was ready; most of it was checklists of jobs finished long ago.
--
-- A job is on phones while it is open (not done, paid, or canceled), and for 90 days after it
-- was last scheduled, finished, or changed. Its checklist, tests, findings, photos, reports,
-- quotes, invoices, signatures, links, messages, payments, and warranties go with it.
-- Customers, pools, plans, and settings stay on every phone (New Job works offline).
-- The website keeps everything. packages/core (phoneHistory.ts) holds the same rule, which
-- phones use to drop jobs that have aged out (with a week's margin).
--
-- Pulls stay incremental. A job only comes back onto phones when it changes (its updated_at
-- moves), and then a trigger records it in app.job_resend: the next pull sends its rows again,
-- even ones that did not change since phones last saw them.

create or replace function app.job_on_phones(
  status text, scheduled_start timestamptz, completed_at timestamptz, updated_at timestamptz)
returns boolean
language sql stable as $$
  select status not in ('done', 'paid', 'canceled')
      or greatest(scheduled_start, completed_at, updated_at) >= now() - interval '90 days'
$$;

/** Ids of the jobs phones keep, among those the caller can see (row security applies). */
create or replace function app.phone_job_ids() returns uuid[]
language sql stable security invoker set search_path = public, app, pg_temp as $$
  select coalesce(array_agg(j.id), '{}')
  from public.job j
  where app.job_on_phones(j.status, j.scheduled_start, j.completed_at, j.updated_at)
$$;

create table app.job_resend (
  id bigint generated always as identity primary key,
  job_id uuid not null,
  company_id uuid not null,
  sync_xid xid8 not null default pg_current_xact_id()
);
create index job_resend_xid on app.job_resend (sync_xid);

create or replace function app.note_job_back_on_phones() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if not app.job_on_phones(old.status, old.scheduled_start, old.completed_at, old.updated_at)
     and app.job_on_phones(new.status, new.scheduled_start, new.completed_at, new.updated_at) then
    insert into app.job_resend (job_id, company_id) values (new.id, new.company_id);
  end if;
  return null;
end
$$;

create trigger job_back_on_phones after update on public.job
  for each row execute function app.note_job_back_on_phones();

/** Jobs that came back onto phones in a pull's range, in the caller's shops. */
create or replace function app.resent_jobs(from_x xid8, high_x xid8)
returns table (job_id uuid, sync_xid xid8)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select r.job_id, r.sync_xid from app.job_resend r
  where r.sync_xid >= from_x and r.sync_xid < high_x
    and r.company_id = any (app.member_companies())
$$;

revoke all on function app.phone_job_ids(), app.resent_jobs(xid8, xid8),
  app.job_on_phones(text, timestamptz, timestamptz, timestamptz) from public;
grant execute on function app.phone_job_ids(), app.resent_jobs(xid8, xid8),
  app.job_on_phones(text, timestamptz, timestamptz, timestamptz) to authenticated;

-- How each synced table's rows belong to a job (null: not job work, always on phones). An
-- expression over the row `t`; rows whose job is null (a monthly invoice) stay on phones.
alter table app.sync_table add column job_ref text;
update app.sync_table set job_ref = 't.id' where table_name = 'job';
update app.sync_table set job_ref = 't.job_id'
  where table_name in ('job_component', 'checklist_item_result', 'test_result', 'finding',
                       'report', 'quote', 'invoice', 'media', 'signature', 'share_link');
update app.sync_table set job_ref = 't.repair_job_id' where table_name = 'warranty';
update app.sync_table set job_ref = '(select q.job_id from public.quote q where q.id = t.quote_id)'
  where table_name = 'quote_line_item';
update app.sync_table set job_ref = '(select i.job_id from public.invoice i where i.id = t.invoice_id)'
  where table_name = 'invoice_line_item';
update app.sync_table set job_ref =
    'coalesce((select q.job_id from public.quote q where q.id = t.quote_id),
              (select i.job_id from public.invoice i where i.id = t.invoice_id))'
  where table_name = 'payment';
update app.sync_table set job_ref =
    'coalesce(t.job_id, (select q.job_id from public.quote q where q.id = t.quote_id),
              (select i.job_id from public.invoice i where i.id = t.invoice_id))'
  where table_name = 'message';

-- ---------------------------------------------------------------------------
-- Pull (as in 20261012000800, plus the window and the jobs sent again)
-- ---------------------------------------------------------------------------

create or replace function public.sync_pull(cursor jsonb default '{}'::jsonb, page_size integer default 500)
returns jsonb
language plpgsql security invoker set search_path = public, app, pg_temp as $$
declare
  from_x xid8 := coalesce(cursor ->> 'from', '0')::xid8;
  high_x xid8 := coalesce((cursor ->> 'high')::xid8, pg_snapshot_xmin(pg_current_snapshot()));
  after_x xid8 := (cursor -> 'after' ->> 0)::xid8;
  after_t text := cursor -> 'after' ->> 1;
  after_id uuid := (cursor -> 'after' ->> 2)::uuid;
  lim integer := least(greatest(coalesce(page_size, 500), 1), 2000);
  on_phones uuid[];
  union_sql text;
  page jsonb;
  n integer;
  last jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync' using errcode = 'insufficient_privilege';
  end if;
  on_phones := app.phone_job_ids();

  select string_agg(part, ' union all ' order by sort_order, kind)
  into union_sql
  from (
    -- Rows that changed in the range: all of them, or for job work, only jobs on phones.
    select sort_order, 1 as kind, format(
      'select %L::text as table_name, t.id, t.sync_xid, to_jsonb(t) - ''field_hlc'' - ''sync_xid'' as row
         from public.%I t where t.sync_xid >= $1 and t.sync_xid < $2%s',
      table_name, table_name,
      case when job_ref is null then ''
           else format(' and ((%s) is null or (%s) = any ($7))', job_ref, job_ref) end) as part
    from app.sync_table where device_sync
    union all
    -- Every row of a job that came back onto phones in the range, changed or not.
    select sort_order, 2, format(
      'select %L::text as table_name, t.id, r.sync_xid, to_jsonb(t) - ''field_hlc'' - ''sync_xid'' as row
         from public.%I t join app.resent_jobs($1, $2) r on r.job_id = (%s)',
      table_name, table_name, job_ref)
    from app.sync_table where device_sync and job_ref is not null
  ) parts;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''table'', table_name, ''xid'', sync_xid::text, ''row'', row)
                               order by sync_xid, table_name, id), ''[]'')
       from (select * from (%s) u
             where $3::xid8 is null or (u.sync_xid, u.table_name, u.id) > ($3, $4, $5)
             order by u.sync_xid, u.table_name, u.id
             limit $6) p',
    union_sql)
    into page using from_x, high_x, after_x, after_t, after_id, lim, on_phones;

  n := jsonb_array_length(page);
  if n < lim then
    return jsonb_build_object('rows', page, 'done', true, 'server_hlc', app.server_hlc(),
      'cursor', jsonb_build_object('from', high_x::text));
  end if;
  last := page -> (n - 1);
  return jsonb_build_object('rows', page, 'done', false, 'server_hlc', app.server_hlc(),
    'cursor', jsonb_build_object('from', from_x::text, 'high', high_x::text,
      'after', jsonb_build_array(last ->> 'xid', last ->> 'table', last -> 'row' ->> 'id')));
end
$$;

revoke all on function public.sync_pull(jsonb, integer) from public, anon;
grant execute on function public.sync_pull(jsonb, integer) to authenticated;
