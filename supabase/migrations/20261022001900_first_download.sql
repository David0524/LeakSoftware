-- A new phone's first download, smaller and faster (owner, 2026-10-22: "There are issues
-- downloading my company on iOS. Either taking too long or not working at all. This has to get
-- fixed. Let run via the internet for the beginning").
--
-- Measured on the dev project's demo company: a first download was ~70,000 rows (job 4,253,
-- job_component 30,132, checklist_item_result 30,135, ...) of which only ~17% were live; demo
-- resets and tests soft-delete rows and every tombstone went to the new phone. Each page also
-- built the JSON of every row left in the range and sorted them all to send 500, so a page took
-- 1.5 to 6 seconds whatever its size (~140 pages). And the company row, which the app waits for
-- before it opens, had a recent sync_xid (a settings change), so it came near the very end.
--
-- 1. A first download skips soft-deleted rows. A pull from no cursor (`{}` or null) is a first
--    download; the server marks the cursors it hands back (`"first": true`) so every page of it,
--    and a download resumed after the app was killed, skips them too. A new phone has nothing to
--    delete. Rows deleted or changed while it runs have a sync_xid at or past the download's
--    `high`, so the incremental pulls after it deliver them as before (deletes included). A
--    scope restart (`{}`) also skips them; the phone keeps only what comes back (keepOnly).
--    Clients that need everything again from the start, tombstones included, pull from
--    `{"from": "0"}` (the phones' discard-a-rejected-change reset).
-- 2. A first download comes in a fixed order: the company and memberships first (the app opens
--    after the opening page), then shop settings and lists, then customers, pools, plans and
--    jobs, then everything under the jobs. The rank is a property of the table, so a row's place
--    never moves while the download runs (a job's date would: children don't change when their
--    job does).
-- 3. Each page picks its keys first (table, id, sync_xid; at most `page_size` per table, from
--    the sync_xid index) and builds JSON only for the rows it sends.
--
-- sync_pull and sync_pull_count keep their signatures, so older app builds work unchanged:
-- they pass the cursor back as it came, marker included.

-- Pages walk each table in (sync_xid, id) order, and a demo reset or an import writes tens of
-- thousands of rows in one transaction (one sync_xid), so the index carries id too: a page
-- starts where the last one stopped instead of sorting the whole transaction's rows again.
do $$
declare
  t record;
begin
  for t in
    select c.relname from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r' and a.attname = 'sync_xid' and not a.attisdropped
  loop
    execute format('drop index if exists public.%I', t.relname || '_sync_xid_idx');
    execute format('create index %I on public.%I (sync_xid, id)', t.relname || '_sync_xid_idx', t.relname);
  end loop;
end
$$;

-- New synced tables get the same index (as 20261022000700_admin_portal.sql, but (sync_xid, id)).
create or replace function app.make_synced(t regclass) returns void
language plpgsql as $$
declare
  rel text := (select relname from pg_class where oid = t);
begin
  execute format(
    'alter table %s
       add column if not exists created_at timestamptz not null default now(),
       add column if not exists updated_at timestamptz not null default now(),
       add column if not exists deleted_at timestamptz,
       add column if not exists field_hlc jsonb not null default %L::jsonb,
       add column if not exists sync_xid xid8 not null default pg_current_xact_id(),
       add constraint %I unique (id, company_id)',
    t, '{}', rel || '_id_company_key');
  execute format('create index %I on %s (company_id)', rel || '_company_idx', t);
  execute format('create index %I on %s (sync_xid, id)', rel || '_sync_xid_idx', t);
  execute format(
    'create trigger touch_row before insert or update on %s
       for each row execute function app.touch_row()', t);
  execute format(
    'create trigger audit_row after insert or update on %s
       for each row execute function app.audit_row()', t);
  execute format(
    'create trigger guard_support_view before insert or update or delete on %s
       for each row execute function app.guard_support_view()', t);
  execute format('alter table %s enable row level security', t);
end
$$;

alter table app.sync_table add column first_download_rank smallint not null default 3;
comment on column app.sync_table.first_download_rank is
  'Where a phone''s first download sends this table: 0 company and memberships, 1 settings and lists, 2 customers, pools, plans and jobs, 3 job work and the rest.';
update app.sync_table set first_download_rank = 0 where table_name in ('company', 'membership');
update app.sync_table set first_download_rank = 1
  where sort_order < 200 and table_name not in ('company', 'membership');
update app.sync_table set first_download_rank = 2
  where table_name in ('customer', 'property', 'service_plan', 'job');

create or replace function public.sync_pull(cursor jsonb default '{}'::jsonb, page_size integer default 500)
returns jsonb
language plpgsql security invoker set search_path = public, app, pg_temp as $$
declare
  c jsonb := coalesce(cursor, '{}'::jsonb);
  is_first boolean := (c ->> 'from') is null or coalesce((c ->> 'first')::boolean, false);
  from_x xid8 := coalesce(c ->> 'from', '0')::xid8;
  high_x xid8 := coalesce((c ->> 'high')::xid8, pg_snapshot_xmin(pg_current_snapshot()));
  after_x xid8 := (c -> 'after' ->> 0)::xid8;
  after_t text := c -> 'after' ->> 1;
  after_id uuid := (c -> 'after' ->> 2)::uuid;
  after_r integer := case when is_first then coalesce((c -> 'after' ->> 3)::integer, 0) else 0 end;
  lim integer := least(greatest(coalesce(page_size, 500), 1), 2000);
  on_phones uuid[];
  s record;
  r integer;
  after_cond text;
  parts text[] := '{}';
  keys jsonb;
  n integer;
  last jsonb;
  rows_sql text;
  page jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync' using errcode = 'insufficient_privilege';
  end if;
  on_phones := app.phone_job_ids();

  for s in select table_name, job_ref, first_download_rank from app.sync_table
           where device_sync order by sort_order
  loop
    r := case when is_first then s.first_download_rank else 0 end;
    -- The page key is (rank, sync_xid, table, id); with the table fixed, what is left after
    -- the cursor's key is a condition on (sync_xid, id). A table ranked before the cursor's
    -- is finished.
    if after_x is null or r > after_r then
      after_cond := '';
    elsif r < after_r then
      continue;
    elsif s.table_name > after_t then
      after_cond := ' and %1$s >= $3';
    elsif s.table_name < after_t then
      after_cond := ' and %1$s > $3';
    else
      after_cond := ' and %1$s >= $3 and (%1$s, t.id) > ($3, $5)';
    end if;

    -- Rows that changed in the range: all of them, or for job work, only jobs on phones. A
    -- first download leaves out deleted rows.
    parts := parts || format(
      '(select %L::text as table_name, t.id, t.sync_xid, %s as rank from public.%I t
         where t.sync_xid >= $1 and t.sync_xid < $2%s%s%s
         order by t.sync_xid, t.id limit $6)',
      s.table_name, r, s.table_name, format(after_cond, 't.sync_xid'),
      case when s.job_ref is null then ''
           else format(' and ((%s) is null or (%s) = any ($7))', s.job_ref, s.job_ref) end,
      case when is_first then ' and t.deleted_at is null' else '' end);

    -- Every row of a job that came back onto phones in the range, changed or not. A first
    -- download already holds every row of every job on phones.
    if not is_first and s.job_ref is not null then
      parts := parts || format(
        '(select %L::text as table_name, t.id, x.sync_xid, 0 as rank
            from public.%I t join app.resent_jobs($1, $2) x on x.job_id = (%s)
           where true%s
           order by x.sync_xid, t.id limit $6)',
        s.table_name, s.table_name, s.job_ref, format(after_cond, 'x.sync_xid'));
    end if;
  end loop;

  -- The page's keys, in order.
  if cardinality(parts) = 0 then
    keys := '[]'::jsonb;
  else
    execute format(
      'select coalesce(jsonb_agg(jsonb_build_array(table_name, id, sync_xid::text, rank)
                                 order by rank, sync_xid, table_name, id), ''[]'')
         from (select * from (%s) u order by u.rank, u.sync_xid, u.table_name, u.id limit $6) p',
      array_to_string(parts, ' union all '))
      into keys using from_x, high_x, after_x, after_t, after_id, lim, on_phones;
  end if;

  -- The rows themselves, read by id for the tables on the page, in the keys' order. A row gone
  -- since its key was read (row security changed) is left out; one changed since is sent as it
  -- is now, and comes again in a later pull.
  select string_agg(format(
      'select e.o, jsonb_build_object(''table'', %L, ''xid'', e.k ->> 2,
                                      ''row'', to_jsonb(t) - ''field_hlc'' - ''sync_xid'') as item
         from jsonb_array_elements($1) with ordinality e(k, o)
         join public.%I t on t.id = (e.k ->> 1)::uuid
        where e.k ->> 0 = %L', tbl, tbl, tbl), ' union all ')
  into rows_sql
  from (select distinct k ->> 0 as tbl from jsonb_array_elements(keys) k) d;
  if rows_sql is null then
    page := '[]'::jsonb;
  else
    execute format('select coalesce(jsonb_agg(item order by o), ''[]'') from (%s) x', rows_sql)
      into page using keys;
  end if;

  n := jsonb_array_length(keys);
  if n < lim then
    return jsonb_build_object('rows', page, 'done', true, 'server_hlc', app.server_hlc(),
      'cursor', jsonb_build_object('from', high_x::text));
  end if;
  last := keys -> (n - 1);
  if is_first then
    return jsonb_build_object('rows', page, 'done', false, 'server_hlc', app.server_hlc(),
      'cursor', jsonb_build_object('first', true, 'from', from_x::text, 'high', high_x::text,
        'after', jsonb_build_array(last ->> 2, last ->> 0, last ->> 1, (last ->> 3)::integer)));
  end if;
  return jsonb_build_object('rows', page, 'done', false, 'server_hlc', app.server_hlc(),
    'cursor', jsonb_build_object('from', from_x::text, 'high', high_x::text,
      'after', jsonb_build_array(last ->> 2, last ->> 0, last ->> 1)));
end
$$;

revoke all on function public.sync_pull(jsonb, integer) from public, anon;
grant execute on function public.sync_pull(jsonb, integer) to authenticated;

-- What a first download holds: live rows only, as sync_pull sends them.
create or replace function public.sync_pull_count()
returns jsonb
language plpgsql stable security invoker set search_path = public, app, pg_temp as $$
declare
  on_phones uuid[];
  t record;
  n bigint;
  counts jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync' using errcode = 'insufficient_privilege';
  end if;
  on_phones := app.phone_job_ids();
  for t in select table_name, job_ref from app.sync_table where device_sync order by sort_order
  loop
    execute format('select count(*) from public.%I t where t.deleted_at is null%s', t.table_name,
      case when t.job_ref is null then ''
           else format(' and ((%s) is null or (%s) = any ($1))', t.job_ref, t.job_ref) end)
      into n using on_phones;
    if n > 0 then counts := counts || jsonb_build_object(t.table_name, n); end if;
  end loop;
  return counts;
end
$$;

revoke all on function public.sync_pull_count() from public, anon;
grant execute on function public.sync_pull_count() to authenticated;
