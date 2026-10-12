-- Offline sync (docs/BUILD_PLAN.md section 4).
--
-- Field clocks and the audit log are kept by triggers on every write, whatever the source
-- (phone sync, office web, server code), so last-writer-wins compares like with like:
--   * app.touch_row()  stamps field_hlc[col] for each written column, using the HLC the
--                      sync push supplied (session var leakbook.field_hlc) or the server clock.
--   * app.audit_row()  writes audit_log: one row per insert, one row per changed field.
--
-- HLC strings: '{unix_ms:13}-{counter:4}-{device}'. Compare them with collate "C".

create or replace function app.server_hlc(ahead interval default interval '0') returns text
language sql volatile as $$
  select lpad(floor(extract(epoch from clock_timestamp() + ahead) * 1000)::bigint::text, 13, '0')
         || '-0000-server'
$$;

create or replace function app.hlc_gt(a text, b text) returns boolean
language sql immutable as $$
  select (a collate "C") > (coalesce(b, '') collate "C")
$$;

create or replace function app.bookkeeping_columns() returns text[]
language sql immutable as $$
  select array['id', 'company_id', 'created_at', 'updated_at', 'sync_xid', 'field_hlc']
$$;

grant execute on function app.server_hlc(interval), app.hlc_gt(text, text), app.bookkeeping_columns()
  to authenticated, service_role;

create or replace function app.touch_row() returns trigger
language plpgsql as $$
declare
  new_j jsonb := to_jsonb(new);
  old_j jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  provided jsonb := coalesce(nullif(current_setting('leakbook.field_hlc', true), '')::jsonb, '{}'::jsonb);
  stamp text := app.server_hlc();
  cap text := app.server_hlc(interval '5 minutes');
  clocks jsonb := case when tg_op = 'UPDATE' then coalesce(old.field_hlc, '{}'::jsonb) else '{}'::jsonb end;
  col text;
  h text;
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;

  for col in select key from jsonb_each(new_j) loop
    continue when col = any (app.bookkeeping_columns());
    -- A row created by sync carries clocks only for the fields the device wrote; the rest
    -- were never written, so any later write to them wins. Other inserts stamp every column.
    continue when tg_op = 'INSERT' and provided <> '{}'::jsonb and not provided ? col;
    if tg_op = 'INSERT' or provided ? col or (new_j -> col) is distinct from (old_j -> col) then
      h := coalesce(provided ->> col, stamp);
      -- A device clock far in the future must not win every future conflict.
      if app.hlc_gt(h, cap) then
        h := stamp;
      end if;
      clocks := clocks || jsonb_build_object(col, h);
    end if;
  end loop;

  new.field_hlc := clocks;
  new.sync_xid := pg_current_xact_id();
  return new;
end
$$;

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  new_j jsonb := to_jsonb(new) - app.bookkeeping_columns();
  old_j jsonb;
  device text := nullif(current_setting('leakbook.device_id', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (company_id, user_id, device_id, table_name, row_id, new_value)
    values (new.company_id, auth.uid(), device, tg_table_name, new.id, new_j);
  else
    old_j := to_jsonb(old) - app.bookkeeping_columns();
    insert into public.audit_log
      (company_id, user_id, device_id, table_name, row_id, field, old_value, new_value, hlc)
    select new.company_id, auth.uid(), device, tg_table_name, new.id, e.key, old_j -> e.key,
           e.value, new.field_hlc ->> e.key
    from jsonb_each(new_j) e
    where e.value is distinct from (old_j -> e.key);
  end if;
  return null;
end
$$;

-- Attach the audit trigger to every synced table, now and in future make_synced() calls.
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
  execute format('create index %I on %s (sync_xid)', rel || '_sync_xid_idx', t);
  execute format(
    'create trigger touch_row before insert or update on %s
       for each row execute function app.touch_row()', t);
  execute format(
    'create trigger audit_row after insert or update on %s
       for each row execute function app.audit_row()', t);
  execute format('alter table %s enable row level security', t);
end
$$;

do $$
declare
  t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'field_hlc'
  loop
    execute format(
      'create trigger audit_row after insert or update on public.%I
         for each row execute function app.audit_row()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Idempotency: a mutation id is applied at most once.
-- ---------------------------------------------------------------------------

create or replace function app.claim_mutation(mutation uuid, target_company uuid) returns boolean
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  claimed uuid;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  insert into app.applied_mutation (mutation_id, company_id, user_id)
  values (mutation, target_company, auth.uid())
  on conflict (mutation_id) do nothing
  returning mutation_id into claimed;
  return claimed is not null;
end
$$;
revoke all on function app.claim_mutation(uuid, uuid) from public;
grant execute on function app.claim_mutation(uuid, uuid) to authenticated;
grant select on app.sync_table to authenticated;

-- ---------------------------------------------------------------------------
-- Push
--
-- mutations: [{ "id": uuid, "table": text, "row_id": uuid, "company_id": uuid,
--               "fields": { col: { "v": value, "hlc": text } } }]
-- Runs as the caller, so RLS, column grants, and triggers all apply to the data writes.
-- Each mutation is applied in its own subtransaction; one bad mutation does not stop the batch.
-- Result status per mutation:
--   applied    every field won
--   partial    some fields lost to newer writes (listed in "lost")
--   stale      every field lost to newer writes
--   duplicate  this mutation id was applied before
--   rejected   not allowed or invalid ("code", "error"); the client keeps it and shows a problem
-- ---------------------------------------------------------------------------

create or replace function public.sync_push(mutations jsonb, device_id text default null)
returns jsonb
language plpgsql security invoker set search_path = public, app, pg_temp as $$
declare
  m jsonb;
  results jsonb := '[]'::jsonb;
  reg app.sync_table;
  tbl text;
  rid uuid;
  cid uuid;
  fields jsonb;
  current_row jsonb;
  cap text := app.server_hlc(interval '5 minutes');
  incoming jsonb;
  winners jsonb;
  lost text[];
  vals jsonb;
  insert_cols text[];
  update_cols text[];
  col text;
  h text;
  status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(mutations) is distinct from 'array' or jsonb_array_length(mutations) > 500 then
    raise exception 'mutations must be an array of at most 500' using errcode = 'invalid_parameter_value';
  end if;
  if device_id is not null and device_id !~ '^[A-Za-z0-9]{1,64}$' then
    raise exception 'invalid device id' using errcode = 'invalid_parameter_value';
  end if;
  perform set_config('leakbook.device_id', coalesce(device_id, ''), true);

  for m in select value from jsonb_array_elements(mutations) loop
    begin
      tbl := m ->> 'table';
      rid := (m ->> 'row_id')::uuid;
      cid := (m ->> 'company_id')::uuid;
      fields := m -> 'fields';
      lost := '{}';

      if (m ->> 'id') is null or rid is null or cid is null
         or jsonb_typeof(fields) is distinct from 'object' or fields = '{}'::jsonb then
        raise exception 'mutation needs id, table, row_id, company_id, and fields'
          using errcode = 'invalid_parameter_value';
      end if;

      select * into reg from app.sync_table
      where table_name = tbl and device_sync and write_role <> 'none';
      if not found then
        raise exception 'table % cannot be written by sync', tbl using errcode = 'insufficient_privilege';
      end if;

      if not app.claim_mutation((m ->> 'id')::uuid, cid) then
        results := results || jsonb_build_object('id', m ->> 'id', 'status', 'duplicate');
        continue;
      end if;

      -- Validate fields and clamp clocks that run ahead of the server.
      incoming := '{}'::jsonb;
      vals := '{}'::jsonb;
      for col in select key from jsonb_object_keys(fields) as key loop
        if not (col = any (coalesce(reg.insert_columns, '{}') || coalesce(reg.update_columns, '{}'))) then
          raise exception 'field %.% is not writable', tbl, col using errcode = 'insufficient_privilege';
        end if;
        h := fields -> col ->> 'hlc';
        if h is null or h !~ '^\d{13}-\d{4}-[A-Za-z0-9]+$' then
          raise exception 'field %.% has an invalid hlc', tbl, col using errcode = 'invalid_parameter_value';
        end if;
        if app.hlc_gt(h, cap) then
          h := cap;
        end if;
        incoming := incoming || jsonb_build_object(col, h);
        vals := vals || jsonb_build_object(col, fields -> col -> 'v');
      end loop;

      execute format('select to_jsonb(t) from public.%I t where id = $1 %s', tbl,
        case when reg.update_columns is not null then 'for update' else '' end)
        into current_row using rid;

      if current_row is null then
        -- New row: insert the insertable fields, then apply any update-only ones (deleted_at).
        if reg.insert_columns is null then
          raise exception 'rows in % are created by the server', tbl using errcode = 'insufficient_privilege';
        end if;
        insert_cols := array(select k from jsonb_object_keys(vals) k where k = any (reg.insert_columns));
        update_cols := array(select k from jsonb_object_keys(vals) k where not (k = any (reg.insert_columns)));
        perform set_config('leakbook.field_hlc', incoming::text, true);
        execute format(
          'insert into public.%I (id, company_id%s) select $1, $2%s from jsonb_populate_record(null::public.%I, $3) r',
          tbl,
          (select coalesce(string_agg(', ' || format('%I', c), ''), '') from unnest(insert_cols) c),
          (select coalesce(string_agg(', r.' || format('%I', c), ''), '') from unnest(insert_cols) c),
          tbl)
          using rid, cid, vals;
        if cardinality(update_cols) > 0 then
          execute format(
            'update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $2) r) where t.id = $1',
            tbl,
            (select string_agg(format('%I', c), ', ') from unnest(update_cols) c),
            (select string_agg('r.' || format('%I', c), ', ') from unnest(update_cols) c),
            tbl)
            using rid, vals;
        end if;
        status := 'applied';
      else
        if (current_row ->> 'company_id')::uuid is distinct from cid then
          raise exception 'row belongs to another company' using errcode = 'insufficient_privilege';
        end if;
        winners := '{}'::jsonb;
        for col in select key from jsonb_object_keys(incoming) as key loop
          if app.hlc_gt(incoming ->> col, current_row -> 'field_hlc' ->> col) then
            winners := winners || jsonb_build_object(col, incoming ->> col);
          else
            lost := lost || col;
          end if;
        end loop;

        if winners = '{}'::jsonb then
          status := 'stale';
        else
          update_cols := array(select k from jsonb_object_keys(winners) k);
          perform set_config('leakbook.field_hlc', winners::text, true);
          execute format(
            'update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $2) r) where t.id = $1',
            tbl,
            (select string_agg(format('%I', c), ', ') from unnest(update_cols) c),
            (select string_agg('r.' || format('%I', c), ', ') from unnest(update_cols) c),
            tbl)
            using rid, vals;
          status := case when cardinality(lost) = 0 then 'applied' else 'partial' end;
        end if;
      end if;

      perform set_config('leakbook.field_hlc', '', true);
      results := results || jsonb_build_object('id', m ->> 'id', 'status', status, 'lost', to_jsonb(lost));
    exception when others then
      results := results || jsonb_build_object(
        'id', m ->> 'id', 'status', 'rejected', 'code', sqlstate, 'error', sqlerrm);
    end;
  end loop;

  perform set_config('leakbook.field_hlc', '', true);
  perform set_config('leakbook.device_id', '', true);
  return jsonb_build_object('server_hlc', app.server_hlc(), 'results', results);
end
$$;

-- ---------------------------------------------------------------------------
-- Pull
--
-- cursor: { "from": xid8 text, "high": xid8 text | null, "after": [xid8, table, id] | null }
-- Returns rows with from <= sync_xid < high, where high = the oldest transaction still
-- running when this pull started. Every transaction below it has finished, so no committed
-- row is ever skipped. Page with "after"; when done, the next pull starts at "high".
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
  union_sql text;
  page jsonb;
  n integer;
  last jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to sync' using errcode = 'insufficient_privilege';
  end if;

  select string_agg(format(
    'select %L::text as table_name, t.id, t.sync_xid, to_jsonb(t) - ''field_hlc'' - ''sync_xid'' as row
       from public.%I t where t.sync_xid >= $1 and t.sync_xid < $2',
    table_name, table_name), ' union all ' order by sort_order)
  into union_sql
  from app.sync_table where device_sync;

  execute format(
    'select coalesce(jsonb_agg(jsonb_build_object(''table'', table_name, ''xid'', sync_xid::text, ''row'', row)
                               order by sync_xid, table_name, id), ''[]'')
       from (select * from (%s) u
             where $3::xid8 is null or (u.sync_xid, u.table_name, u.id) > ($3, $4, $5)
             order by u.sync_xid, u.table_name, u.id
             limit $6) p',
    union_sql)
    into page using from_x, high_x, after_x, after_t, after_id, lim;

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

revoke all on function public.sync_push(jsonb, text), public.sync_pull(jsonb, integer) from public, anon;
grant execute on function public.sync_push(jsonb, text), public.sync_pull(jsonb, integer) to authenticated;
