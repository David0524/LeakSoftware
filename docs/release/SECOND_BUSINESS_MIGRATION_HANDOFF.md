# Apply the second business database change (Claude in Chrome)

**No longer needed (2026-11-28):** the migration was renumbered `20261022006200` and `pnpm db:deploy`
applies it with the rest. Kept for the record.

Paste everything below the line into Claude in Chrome. Have one tab signed in to Supabase first
(https://supabase.com/dashboard, the account that owns the **leakbook-dev** project). It takes a
few minutes and needs no secret values from you. When it finishes, paste its report back to
Claude Code.

Why (owner, 2026-11-26, Cole's two ideas): shops that do both pool care and leak detection can
add a second business name and logo, and reports can end with the tech's photo ("Your pool was
serviced by Brian"). The website, iPhone and Android code is ready; these screens appear once
this change is in. It is migration `supabase/migrations/20261022006200_second_business.sql`,
recorded the same way `pnpm db:deploy` records migrations, so a later deploy won't run it twice.
It only adds columns and wraps existing functions; no data changes.

---

You're applying one database change to my company's Supabase project, **leakbook-dev**
(project ref `evmxdfasurkaxbwkceti`). It is the live database behind sundeckpro.com, with real
customers' data, so work carefully.

## Rules

1. Work only in project `evmxdfasurkaxbwkceti`. Check the ref in the browser's address bar
   before every step. If you can't find that project, stop and tell me.
2. Run only the three SQL blocks below, exactly as written, in the **SQL Editor**. Don't edit
   them, don't run anything else, and don't change tables, settings, keys, or users in the
   dashboard.
3. Never reveal, copy, or put in your report any key or password (anon, service_role, database
   password, access token). Don't click "Reveal" on anything.
4. If the SQL Editor shows a warning such as "potentially destructive operation", that's expected
   for block 2 (it changes tables and functions). Confirm it for block 2 only.
5. If any block shows an error, stop. Don't retry and don't try to fix it. Copy the error
   message word for word into your report.

## Steps

1. Open https://supabase.com/dashboard/project/evmxdfasurkaxbwkceti/sql/new (or SQL Editor, then
   New query).
2. Run **block 1** (a check that changes nothing). Copy its result into your report.
   - If `already_applied` is `true`, stop here and tell me: the change is already in.
3. Clear the editor, paste **block 2**, and run it. It should finish with "Success. No rows
   returned". Copy the message into your report.
4. Clear the editor, paste **block 3** (a check that changes nothing), and run it. Copy its
   result into your report.

### Block 1: check first (changes nothing)

```sql
select
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261022006200')
    as already_applied,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'company' and column_name = 'second_name')
    as column_exists,
  (select max(version) from supabase_migrations.schema_migrations) as latest_applied;
```

Expected: `already_applied` false and `column_exists` false. `latest_applied` is probably
`20261022005800`; whatever it says, copy it into your report and carry on.

### Block 2: the change

```sql
begin;
-- A second business name, and the tech on reports (Cole via the owner, 2026-11-26: "for
-- companies who pay for both service and leak accounts, we can allow them the option to add a
-- secondary company name, logo, and info"; "At the bottom of the report, it should say 'your
-- pool was serviced by Brian' and then a picture of his face. Owner should have option to have
-- this on or off"). Plan: docs/design/2026-11-26-second-business-and-tech-photos.md. Rules as in
-- packages/core/src/business.ts.
--
--   company.second_*        the second business (Services = Both only): name, logo, phone,
--                           email, review link, main color, and the work it is for.
--   job.business            null (automatic), 'main' or 'second'.
--   membership.photo_path   the member's photo in this shop (company-assets/{company}/team/...),
--                           set through public.set_member_photo.
--   settings.tech_on_reports  reports end with the tech's photo and name (default off).
--
-- Every customer-facing function that names the shop now names the job's business: the report
-- snapshot (so a sent report keeps it), the quote and invoice pages, their link previews,
-- checkout, emails, reminders, review requests and the feedback page. Each is wrapped, as
-- 20261022005800_card_fee_on_receipts.sql wraps invoice_for_token.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.company
  add column second_name text check (second_name is null or length(btrim(second_name)) <= 120),
  add column second_phone text check (second_phone is null or length(second_phone) <= 40),
  add column second_email text check (second_email is null or length(second_email) <= 254),
  add column second_logo_path text,
  add column second_brand_primary text check (second_brand_primary ~ '^#[0-9A-Fa-f]{6}$'),
  add column second_review_url text check (second_review_url is null or length(second_review_url) <= 2000),
  add column second_for text not null default 'leak' check (second_for in ('leak', 'pool'));

alter table public.job
  add column business text check (business in ('main', 'second'));

alter table public.membership add column photo_path text;

-- Devices write the company's second business (owners and admins, the table's write role) and
-- a job's business (like the job's other columns). The photo goes through set_member_photo.
do $$
declare
  add_cols jsonb := $json${
    "company": {"insert": [], "update": ["second_name", "second_phone", "second_email",
      "second_logo_path", "second_brand_primary", "second_review_url", "second_for"]},
    "job": {"insert": ["business"], "update": ["business"]}
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

-- No new policies (the tables' write roles are unchanged); kept per the foundation's rule.
select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- Which business (core hasSecondBusiness, jobBusiness, businessIdentity)
-- ---------------------------------------------------------------------------

create function app.has_second_business(co public.company) returns boolean
language sql stable as $$
  select coalesce(co.settings ->> 'services', 'both') = 'both'
         and nullif(btrim(co.second_name), '') is not null
$$;

-- The business for a line of work ('leak' or 'pool'): things tied to no one job (autopay, card
-- requests) use pool care's.
create function app.work_business(target_company uuid, work text) returns text
language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce((select case when app.has_second_business(co) and co.second_for = work
                               then 'second' else 'main' end
                   from public.company co where co.id = target_company), 'main')
$$;

-- A job's business: its own choice, else its work, else (a repair) its source job's choice or
-- work, else the main one.
create function app.job_business(target_job uuid) returns text
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  j public.job;
  pj public.job;
  co public.company;
  work text;
begin
  select * into j from public.job where id = target_job;
  if j.id is null then
    return 'main';
  end if;
  select * into co from public.company where id = j.company_id;
  if not app.has_second_business(co) then
    return 'main';
  end if;
  if j.business is not null then
    return j.business;
  end if;
  work := case when j.type in ('detection', 'inspection') then 'leak'
               when j.type = 'maintenance' then 'pool' end;
  if work is null and j.type = 'repair' and j.parent_job_id is not null then
    select * into pj from public.job where id = j.parent_job_id;
    if pj.business is not null then
      return pj.business;
    end if;
    work := case when pj.type in ('detection', 'inspection') then 'leak'
                 when pj.type = 'maintenance' then 'pool' end;
  end if;
  return case when work is not null and co.second_for = work then 'second' else 'main' end;
end
$$;

-- What the second business shows in place of the shop's own fields; null for the main one.
-- Phone, email, review link and color fall back to the shop's; the logo does not.
create function app.business_fields(target_company uuid, which text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when which = 'second' and app.has_second_business(co) then jsonb_build_object(
    'name', btrim(co.second_name),
    'legal_name', null,
    'phone', coalesce(nullif(btrim(co.second_phone), ''), co.phone),
    'email', coalesce(nullif(btrim(co.second_email), ''), co.email),
    'logo_path', nullif(btrim(co.second_logo_path), ''),
    'brand_primary', coalesce(co.second_brand_primary, co.brand_primary),
    'review_url', coalesce(nullif(btrim(co.second_review_url), ''), co.review_url)) end
  from public.company co where co.id = target_company
$$;

-- A function's company object with the business's fields in place of the shop's, for the keys
-- it already has (so each page gets the shape it always had).
create function app.business_overlay(obj jsonb, target_company uuid, which text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when f is null or obj is null or jsonb_typeof(obj) <> 'object' then obj
              else obj || coalesce((select jsonb_object_agg(e.key, e.value)
                                    from jsonb_each(f) e where obj ? e.key), '{}'::jsonb) end
  from (select app.business_fields(target_company, which) as f) x
$$;

-- The business's name for a job (Stripe lines, checkout).
create function app.job_business_name(target_job uuid) returns text
language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(app.business_fields(j.company_id, app.job_business(j.id)) ->> 'name', co.name)
  from public.job j join public.company co on co.id = j.company_id
  where j.id = target_job
$$;

revoke all on function app.has_second_business(public.company),
  app.work_business(uuid, text), app.job_business(uuid), app.business_fields(uuid, text),
  app.business_overlay(jsonb, uuid, text), app.job_business_name(uuid) from public;

-- ---------------------------------------------------------------------------
-- The tech on reports
-- ---------------------------------------------------------------------------

-- {"techs": [{name, photo_path, color}]} for the job's tech and second tech, when the shop shows
-- the tech on reports; null otherwise.
create function app.tech_card(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when count(*) > 0 then jsonb_build_object('techs', jsonb_agg(jsonb_build_object(
      'name', coalesce(pr.full_name, pr.email), 'photo_path', m.photo_path, 'color', m.color)
      order by t.ord)) end
  from public.job j
  join public.company co on co.id = j.company_id
  cross join lateral (values (j.assigned_user_id, 1), (j.second_tech_id, 2)) t(uid, ord)
  join public.membership m on m.company_id = j.company_id and m.user_id = t.uid
  left join public.profile pr on pr.id = t.uid
  where j.id = target_job and t.uid is not null
    and (t.ord = 1 or t.uid is distinct from j.assigned_user_id)
    and co.settings -> 'tech_on_reports' = 'true'::jsonb
$$;
revoke all on function app.tech_card(uuid) from public;

-- A member's photo: owners and admins for anyone in the shop, everyone for themselves. Null
-- removes it. The file is uploaded first to company-assets/{company}/team/.
create function public.set_member_photo(target_member uuid, path text) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  m public.membership;
begin
  select * into m from public.membership where id = target_member and deleted_at is null;
  if m.id is null or not (app.is_manager(m.company_id)
                          or (m.user_id = auth.uid() and app.is_member(m.company_id))) then
    raise exception 'Only owners and admins can change someone else''s photo'
      using errcode = 'insufficient_privilege';
  end if;
  path := nullif(btrim(path), '');
  if path is not null and (app.object_company(path) is distinct from m.company_id
                           or (storage.foldername(path))[2] is distinct from 'team') then
    raise exception 'Not a team photo' using errcode = 'invalid_parameter_value';
  end if;
  update public.membership set photo_path = path where id = m.id;
end
$$;
revoke all on function public.set_member_photo(uuid, text) from public, anon;
grant execute on function public.set_member_photo(uuid, text) to authenticated;

-- Team photos: owners and admins upload anyone's; each member their own
-- ({company}/team/{their id}-...).
create policy company_assets_team_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-assets' and (storage.foldername(name))[2] = 'team'
    and (app.is_manager(app.object_company(name))
         or (app.is_member(app.object_company(name))
             and name like app.object_company(name)::text || '/team/' || auth.uid()::text || '-%')));

-- ---------------------------------------------------------------------------
-- Reports: the job's business and the tech card, frozen when sent
-- ---------------------------------------------------------------------------

alter function app.report_snapshot(uuid) rename to report_snapshot_before_business;
create function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when s is null then s else s || jsonb_build_object(
    'company', app.business_overlay(s -> 'company', j.company_id, b.which)
               || jsonb_build_object('business', b.which),
    'tech_card', app.tech_card(target_job)) end
  from app.report_snapshot_before_business(target_job) s
  left join public.job j on j.id = target_job
  cross join lateral (select app.job_business(target_job) as which) b
$$;
revoke all on function app.report_snapshot(uuid), app.report_snapshot_before_business(uuid)
  from public;

-- A monthly report: its latest visit's tech (its company is already the latest visit's).
alter function app.month_snapshot(uuid, uuid, date, uuid) rename to month_snapshot_before_tech;
create function app.month_snapshot(target_company uuid, target_customer uuid, month date,
                                   target_invoice uuid)
returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when s is null then s
              else s || jsonb_build_object('tech_card',
                                           app.tech_card((s -> 'job' ->> 'id')::uuid)) end
  from app.month_snapshot_before_tech(target_company, target_customer, month, target_invoice) s
$$;
revoke all on function app.month_snapshot(uuid, uuid, date, uuid),
  app.month_snapshot_before_tech(uuid, uuid, date, uuid) from public;

-- ---------------------------------------------------------------------------
-- Quote and invoice pages, checkout and emails
-- ---------------------------------------------------------------------------

alter function public.quote_for_token(text, boolean) rename to quote_for_token_before_business;
revoke all on function public.quote_for_token_before_business(text, boolean)
  from public, anon, authenticated;
create function public.quote_for_token(link_token text, count_view boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r jsonb := public.quote_for_token_before_business(link_token, count_view);
begin
  if r is null then
    return null;
  end if;
  return r || jsonb_build_object('company', app.business_overlay(
    r -> 'company', (r ->> 'company_id')::uuid, app.job_business((r ->> 'job_id')::uuid)));
end
$$;
revoke all on function public.quote_for_token(text, boolean) from public;
grant execute on function public.quote_for_token(text, boolean) to anon, authenticated;

alter function public.invoice_for_token(text, boolean) rename to invoice_for_token_before_business;
revoke all on function public.invoice_for_token_before_business(text, boolean)
  from public, anon, authenticated;
create function public.invoice_for_token(link_token text, count_view boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r jsonb := public.invoice_for_token_before_business(link_token, count_view);
begin
  if r is null then
    return null;
  end if;
  return r || jsonb_build_object('company', app.business_overlay(
    r -> 'company', (r ->> 'company_id')::uuid, app.job_business((r ->> 'job_id')::uuid)));
end
$$;
revoke all on function public.invoice_for_token(text, boolean) from public;
grant execute on function public.invoice_for_token(text, boolean) to anon, authenticated;

alter function public.quote_checkout_details(text) rename to quote_checkout_details_before_business;
revoke all on function public.quote_checkout_details_before_business(text)
  from public, anon, authenticated;
create function public.quote_checkout_details(link_token text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when r is null then null else r || jsonb_build_object(
    'company_name', coalesce(app.job_business_name((r ->> 'job_id')::uuid), r ->> 'company_name')) end
  from public.quote_checkout_details_before_business(link_token) r
$$;
revoke all on function public.quote_checkout_details(text) from public, anon, authenticated;
grant execute on function public.quote_checkout_details(text) to service_role;

alter function public.invoice_checkout_details(text) rename to invoice_checkout_details_before_business;
revoke all on function public.invoice_checkout_details_before_business(text)
  from public, anon, authenticated;
create function public.invoice_checkout_details(link_token text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when r is null then null else r || jsonb_build_object(
    'company_name', coalesce(app.job_business_name((r ->> 'job_id')::uuid), r ->> 'company_name')) end
  from public.invoice_checkout_details_before_business(link_token) r
$$;
revoke all on function public.invoice_checkout_details(text) from public, anon, authenticated;
grant execute on function public.invoice_checkout_details(text) to service_role;

alter function public.invoice_mail_details(uuid) rename to invoice_mail_details_before_business;
revoke all on function public.invoice_mail_details_before_business(uuid)
  from public, anon, authenticated;
create function public.invoice_mail_details(target_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  r jsonb := public.invoice_mail_details_before_business(target_invoice);
begin
  if r is null then
    return null;
  end if;
  return r || jsonb_build_object('company', app.business_overlay(
    r -> 'company', (select company_id from public.invoice where id = target_invoice),
    app.job_business((r ->> 'job_id')::uuid)));
end
$$;
revoke all on function public.invoice_mail_details(uuid) from public, anon, authenticated;
grant execute on function public.invoice_mail_details(uuid) to authenticated, service_role;

-- Autopay is for the service account: its invoice's job decides (a monthly invoice's anchor is
-- a pool visit).
alter function public.autopay_details(uuid) rename to autopay_details_before_business;
revoke all on function public.autopay_details_before_business(uuid)
  from public, anon, authenticated;
create function public.autopay_details(target_invoice uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  r jsonb := public.autopay_details_before_business(target_invoice);
begin
  if r is null then
    return null;
  end if;
  return r || jsonb_build_object('company_name',
    coalesce(app.job_business_name((r ->> 'job_id')::uuid), r ->> 'company_name'));
end
$$;
revoke all on function public.autopay_details(uuid) from public, anon, authenticated;
grant execute on function public.autopay_details(uuid) to authenticated, service_role;

-- Request Card on File: tied to no job, so pool care's business.
alter function public.card_request_details(text) rename to card_request_details_before_business;
revoke all on function public.card_request_details_before_business(text)
  from public, anon, authenticated;
create function public.card_request_details(link_token text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when r is null then null else r || jsonb_build_object('company', app.business_overlay(
    r -> 'company', (r ->> 'company_id')::uuid,
    app.work_business((r ->> 'company_id')::uuid, 'pool'))) end
  from public.card_request_details_before_business(link_token) r
$$;
revoke all on function public.card_request_details(text) from public, anon, authenticated;
grant execute on function public.card_request_details(text) to service_role;

alter function public.card_request_link(uuid) rename to card_request_link_before_business;
revoke all on function public.card_request_link_before_business(uuid)
  from public, anon, authenticated;
create function public.card_request_link(target_customer uuid) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  r jsonb := public.card_request_link_before_business(target_customer);
  co uuid := (select company_id from public.customer where id = target_customer);
begin
  return r || jsonb_build_object('company_name', coalesce(
    app.business_fields(co, app.work_business(co, 'pool')) ->> 'name', r ->> 'company_name'));
end
$$;
revoke all on function public.card_request_link(uuid) from public, anon, authenticated;
grant execute on function public.card_request_link(uuid) to authenticated;

-- Link previews: a quote's or invoice's job's business (a report's comes from its snapshot).
alter function public.link_preview_for_token(text) rename to link_preview_for_token_before_business;
revoke all on function public.link_preview_for_token_before_business(text)
  from public, anon, authenticated;
create function public.link_preview_for_token(link_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r jsonb := public.link_preview_for_token_before_business(link_token);
  sl public.share_link;
  target_job uuid;
  f jsonb;
begin
  if r is null or r ->> 'kind' = 'report' then
    return r;
  end if;
  select * into sl from public.share_link where token = link_token and deleted_at is null;
  target_job := coalesce((select job_id from public.quote where id = sl.quote_id),
                         (select job_id from public.invoice where id = sl.invoice_id));
  f := app.business_fields(sl.company_id, app.job_business(target_job));
  if f is null then
    return r;
  end if;
  r := r || jsonb_build_object('shop', f ->> 'name');
  if r ? 'logo_path' then
    r := r || jsonb_build_object('logo_path', f -> 'logo_path', 'brand_primary', f -> 'brand_primary');
  end if;
  return r;
end
$$;
revoke all on function public.link_preview_for_token(text) from public;
grant execute on function public.link_preview_for_token(text) to anon, authenticated;

-- Reminders and review requests: each one's job's business (and its review link).
alter function public.due_followups(timestamptz) rename to due_followups_before_business;
revoke all on function public.due_followups_before_business(timestamptz)
  from public, anon, authenticated;
create function public.due_followups(at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(jsonb_agg(e.f || jsonb_build_object('company', app.business_overlay(
      e.f -> 'company', (e.f ->> 'company_id')::uuid, app.job_business((e.f ->> 'job_id')::uuid)))
    order by e.ord), '[]'::jsonb)
  from jsonb_array_elements(public.due_followups_before_business(at)) with ordinality e(f, ord)
$$;
revoke all on function public.due_followups(timestamptz) from public, anon, authenticated;
grant execute on function public.due_followups(timestamptz) to service_role;

-- The feedback page ("How did we do?") and its review link.
alter function public.feedback_for_token(text) rename to feedback_for_token_before_business;
revoke all on function public.feedback_for_token_before_business(text)
  from public, anon, authenticated;
create function public.feedback_for_token(link_token text) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when r is null then null else r || coalesce((
    select jsonb_build_object('company', f ->> 'name',
                              'review_url', nullif(btrim(f ->> 'review_url'), ''))
    from (select app.business_fields((r ->> 'company_id')::uuid,
                                     app.job_business((r ->> 'job_id')::uuid)) as f) x
    where f is not null), '{}'::jsonb) end
  from public.feedback_for_token_before_business(link_token) r
$$;
revoke all on function public.feedback_for_token(text) from public, anon, authenticated;
grant execute on function public.feedback_for_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- Signed-out reads: the second logo on quote and invoice links, tech photos on reports
-- ---------------------------------------------------------------------------

-- As 20261022000100_document_logos.sql, plus a report's tech photos and the second logo.
create or replace function app.shared_object(bucket text, object_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.share_link sl
    join public.report r on r.id = sl.report_id
    where sl.revoked_at is null and sl.deleted_at is null
      and (sl.expires_at is null or sl.expires_at > now())
      and r.status in ('sent', 'superseded') and r.deleted_at is null
      and r.company_id = app.object_company(object_name)
      and case bucket
        when 'media' then
          r.data_snapshot -> 'media' @> jsonb_build_array(jsonb_build_object('storage_path', object_name))
          or r.data_snapshot -> 'signatures' @> jsonb_build_array(jsonb_build_object('image_path', object_name))
        when 'company-assets' then
          r.data_snapshot -> 'company' ->> 'logo_path' = object_name
          or coalesce(r.data_snapshot -> 'tech_card' -> 'techs', '[]'::jsonb)
             @> jsonb_build_array(jsonb_build_object('photo_path', object_name))
        when 'documents' then object_name = r.company_id || '/' || r.job_id || '/report-' || r.id || '.pdf'
        else false
      end
  )
  or (bucket = 'company-assets' and exists (
    select 1
    from public.company co
    join public.share_link sl on sl.company_id = co.id
    left join public.quote q on q.id = sl.quote_id
    left join public.invoice i on i.id = sl.invoice_id
    where co.id = app.object_company(object_name)
      and object_name in (co.logo_path, co.second_logo_path)
      and sl.revoked_at is null and sl.deleted_at is null
      and (sl.expires_at is null or sl.expires_at > now())
      and ((q.id is not null and q.status <> 'draft' and q.deleted_at is null)
        or (i.id is not null and i.status <> 'draft' and i.deleted_at is null))
  ))
$$;
revoke all on function app.shared_object(text, text) from public;
grant execute on function app.shared_object(text, text) to anon, authenticated;
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261022006200', 'second_business', array[]::text[]);
commit;
```

### Block 3: check after (changes nothing)

```sql
select
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261022006200')
    as recorded,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'company' and column_name = 'second_name')
    as column_exists,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'membership' and column_name = 'photo_path')
    as photo_column_exists,
  exists (select 1 from pg_proc where proname = 'set_member_photo') as function_exists;
```

Expected: all four true.

## Report

Reply with:
- Block 1's result.
- Block 2's message (or the error, word for word).
- Block 3's result.
- Anything that wasn't where these steps said, and where you found it.
