-- Text and Call Customers, per person (owner, 2026-11-23: "some of the less trustworthy techs
-- shouldn't have access to messaging and calling customers, but some should ... the owner/admin
-- be able to customize it per each tech"). docs/DECISIONS.md 2026-11-23; packages/core contact.ts.
--
--   membership.can_contact_customers  On (the default; everyone keeps what they had): the
--                                     shared inbox, and texting and calling customers. Owners
--                                     and admins set it for techs on Settings › Team; owners and
--                                     admins always have it, whatever it says.
--
-- "Fully off" (owner, 2026-11-23): off, a tech can't read the inbox (conversations, texts,
-- calls, and their Activity rows), their phone gets customers' phone numbers and emails blank
-- (sync_pull), and their phone starts its sync over (sync_scope changes), which drops the rows
-- it had and replaces the rest. They can't change a customer's phone or email either. The
-- server refuses their texts and calls (apps/web/src/server/texting.ts) and doesn't ring them;
-- the website blanks the same fields before a page is drawn.

alter table public.membership
  add column can_contact_customers boolean not null default true;

-- ---------------------------------------------------------------------------
-- Access, from the registry (as 20261021000100_schedule_order.sql): devices write it, managers
-- only (the table's write role), like membership.color.
-- ---------------------------------------------------------------------------

do $$
declare
  add_cols jsonb := $json${
    "membership": {"insert": [], "update": ["can_contact_customers"]}
  }$json$;
  t text;
  ins text[];
  upd text[];
begin
  for t in select jsonb_object_keys(add_cols) loop
    ins := array(select jsonb_array_elements_text(add_cols -> t -> 'insert'));
    upd := array(select jsonb_array_elements_text(add_cols -> t -> 'update'));
    update app.sync_table
    set insert_columns = case when insert_columns is null then null else insert_columns || ins end,
        update_columns = case when update_columns is null then null else update_columns || upd end
    where table_name = t;
    if cardinality(ins) > 0 and (select insert_columns is not null from app.sync_table where table_name = t) then
      execute format('grant insert (%s) on public.%I to authenticated', array_to_string(ins, ', '), t);
    end if;
    if cardinality(upd) > 0 then
      execute format('grant update (%s) on public.%I to authenticated', array_to_string(upd, ', '), t);
    end if;
  end loop;
end
$$;

-- Only owners and admins change it (the row rules already keep techs off membership; this says
-- so in plain words, and holds if those ever widen): a tech can't turn their own back on.
create or replace function app.guard_contact_permission() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if new.can_contact_customers is distinct from old.can_contact_customers
     and not app.is_manager(old.company_id) then
    raise exception 'Only owners and admins can do this' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
revoke all on function app.guard_contact_permission() from public;

create trigger guard_contact_permission before update of can_contact_customers
  on public.membership for each row execute function app.guard_contact_permission();

-- ---------------------------------------------------------------------------
-- Who may contact customers: once per query, like app.manager_companies()
-- ---------------------------------------------------------------------------

-- The shops where the signed-in person may read the inbox and contact customers: owners and
-- admins, techs with the switch on, and Sundeck Pro support sessions (they work as an admin).
create or replace function app.contact_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.two_step_ok() then
    (select coalesce(array_agg(company_id), '{}') from public.membership
     where user_id = auth.uid() and status = 'active' and deleted_at is null
       and (role in ('owner', 'admin') or can_contact_customers))
  else '{}'::uuid[] end || app.support_companies()
$$;

revoke all on function app.contact_companies() from public;
grant execute on function app.contact_companies() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The inbox: restrictive rules AND-ed with the member rules (as
-- 20261012004100_conversation_visibility.sql), in the once-per-query form.
-- ---------------------------------------------------------------------------

create policy conversation_contact_allowed on public.conversation as restrictive for all
  to authenticated
  using (company_id = any ((select app.contact_companies())::uuid[]))
  with check (company_id = any ((select app.contact_companies())::uuid[]));

create policy text_message_contact_allowed on public.text_message as restrictive for all
  to authenticated
  using (company_id = any ((select app.contact_companies())::uuid[]))
  with check (company_id = any ((select app.contact_companies())::uuid[]));

create policy call_log_contact_allowed on public.call_log as restrictive for all
  to authenticated
  using (company_id = any ((select app.contact_companies())::uuid[]))
  with check (company_id = any ((select app.contact_companies())::uuid[]));

-- Activity's texts (a customer texted) open a conversation: not for them either.
create policy activity_contact_allowed on public.activity as restrictive for all
  to authenticated
  using (conversation_id is null
         or company_id = any ((select app.contact_companies())::uuid[]));

select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- Phones: turning it off or on starts that person's sync over
-- ---------------------------------------------------------------------------

-- As 20261012002300_job_visibility.sql, plus ":no-contact" for a shop where the person may not
-- contact customers. Everyone else's scope reads as before, so their phones don't start over.
-- When it changes, the phone pulls everything again and drops the inbox rows it no longer gets
-- (packages/sync engine.ts; SundeckSync on the iPhone).
create or replace function public.sync_scope() returns text
language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(string_agg(
           m.company_id::text || ':' ||
           case when app.sees_all_jobs(m.company_id) then 'all'
                else 'own' || coalesce((select e.epoch from app.visibility_epoch e
                                        where e.company_id = m.company_id), 0)::text end ||
           case when m.role in ('owner', 'admin') or m.can_contact_customers then ''
                else ':no-contact' end,
           ',' order by m.company_id), '')
  from public.membership m
  where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
$$;

revoke all on function public.sync_scope() from public, anon;
grant execute on function public.sync_scope() to authenticated;

-- ---------------------------------------------------------------------------
-- Customers' phone numbers and emails: blank on the phones of people without it
-- ---------------------------------------------------------------------------

-- The contact columns of a synced table, as the blank values sync_pull sends in their place;
-- null for a table with none. Customers' numbers and emails, and the address a message (a
-- sent report or invoice) went to.
create or replace function app.contact_blanks(tbl text) returns jsonb
language sql immutable as $$
  select case tbl
    when 'customer' then '{"phone": null, "email": null, "cc_emails": []}'::jsonb
    when 'message' then '{"recipient": ""}'::jsonb
  end
$$;
revoke all on function app.contact_blanks(text) from public;
grant execute on function app.contact_blanks(text) to authenticated;

-- A phone that never received them can't wipe them: a change to a customer's phone or emails
-- from someone without Text and Call Customers keeps what was there. (A new customer they add
-- keeps what they typed.)
create or replace function app.keep_customer_contact() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if not (old.company_id = any (app.contact_companies())) then
    new.phone := old.phone;
    new.email := old.email;
    new.cc_emails := old.cc_emails;
  end if;
  return new;
end
$$;
revoke all on function app.keep_customer_contact() from public;

create trigger keep_customer_contact before update on public.customer
  for each row execute function app.keep_customer_contact();

-- As 20261022001900_first_download.sql, with the contact columns blanked.
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
  -- Customers' phone numbers and emails go only to people with Text and Call Customers
  -- (20261022005000_contact_customers.sql): for anyone else they come down blank.
  select string_agg(format(
      'select e.o, jsonb_build_object(''table'', %L, ''xid'', e.k ->> 2,
                                      ''row'', to_jsonb(t) - ''field_hlc'' - ''sync_xid''%s) as item
         from jsonb_array_elements($1) with ordinality e(k, o)
         join public.%I t on t.id = (e.k ->> 1)::uuid
        where e.k ->> 0 = %L', tbl,
      case when app.contact_blanks(tbl) is null then ''
           else format(' || case when t.company_id = any ((select app.contact_companies())::uuid[])
                                 then ''{}''::jsonb else %L::jsonb end', app.contact_blanks(tbl))
      end, tbl, tbl), ' union all ')
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

-- For the website's phone API: whether the signed-in person may contact this shop's customers.
create or replace function public.may_contact_customers(target_company uuid) returns boolean
language sql stable security invoker set search_path = public, app, pg_temp as $$
  select target_company = any (app.contact_companies())
$$;
revoke all on function public.may_contact_customers(uuid) from public, anon;
grant execute on function public.may_contact_customers(uuid) to authenticated;
