-- Fixes from the full security audit (2026-10-17, Cloudflare security-audit skill, run 1).
-- Each section names the finding it closes. The web side of these fixes is in the same commit.

-- ---------------------------------------------------------------------------
-- 1. Stripe: a payment counts only when the shop's own connected account took it.
--    A shop controls its own (Standard) account and the metadata on its Checkout Sessions,
--    so metadata alone must never pick another shop's quote or invoice.
-- ---------------------------------------------------------------------------

create or replace function public.stripe_record_quote_payment(
  target_quote uuid, session_id text, intent_id text, amount integer, pay_method text,
  pay_status text, paid_account text)
returns text
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if paid_account is null or paid_account is distinct from (
    select sa.stripe_account_id from public.stripe_account sa
    join public.quote q on q.company_id = sa.company_id
    where q.id = target_quote) then
    return 'ignored';
  end if;
  return public.stripe_record_quote_payment(target_quote, session_id, intent_id, amount,
                                            pay_method, pay_status);
end
$$;

create or replace function public.stripe_record_invoice_payment(
  target_invoice uuid, session_id text, intent_id text, amount integer, pay_method text,
  pay_status text, paid_account text)
returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if paid_account is null or paid_account is distinct from (
    select sa.stripe_account_id from public.stripe_account sa
    join public.invoice i on i.company_id = sa.company_id
    where i.id = target_invoice) then
    return jsonb_build_object('payment', 'ignored', 'status', null, 'paid_now', false);
  end if;
  return public.stripe_record_invoice_payment(target_invoice, session_id, intent_id, amount,
                                              pay_method, pay_status);
end
$$;

revoke all on function
  public.stripe_record_quote_payment(uuid, text, text, integer, text, text, text),
  public.stripe_record_invoice_payment(uuid, text, text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.stripe_record_quote_payment(uuid, text, text, integer, text, text, text),
  public.stripe_record_invoice_payment(uuid, text, text, integer, text, text, text)
  to service_role;
-- The unbound versions stay for the checks above (they run as the function owner).
revoke all on function
  public.stripe_record_quote_payment(uuid, text, text, integer, text, text),
  public.stripe_record_invoice_payment(uuid, text, text, integer, text, text)
  from service_role;

-- ---------------------------------------------------------------------------
-- 2. Demo codes: limited, and only for a shop that is still setting up. VIP26 is in this
--    public repository, so it is capped; new codes go into the deployed database only.
-- ---------------------------------------------------------------------------

alter table app.access_code
  add column max_redemptions integer check (max_redemptions is null or max_redemptions >= 0),
  add column expires_at timestamptz;
update app.access_code set max_redemptions = 25 where code = 'VIP26';

create or replace function public.redeem_access_code(target_company uuid, code text)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c app.access_code;
  s public.subscription;
begin
  if not app.is_owner(target_company) then
    raise exception 'Only the shop''s owner can use a code' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.subscription where company_id = target_company for update;
  select * into c from app.access_code a where a.code = upper(trim(redeem_access_code.code))
  for update;
  if c.code is null or not c.active
     or (c.expires_at is not null and c.expires_at <= now())
     or (c.max_redemptions is not null and (
           select count(*) from public.subscription x where x.access_code = c.code) >= c.max_redemptions)
     -- Codes start a shop; they don't revive a canceled or overdue one or replace a paid plan.
     or s.company_id is null or s.stripe_subscription_id is not null
     or s.status in ('canceled', 'past_due') then
    raise exception 'That code isn''t valid.' using errcode = 'invalid_parameter_value';
  end if;
  update public.subscription
  set plan = c.plan, status = 'active', card_required = false, access_code = c.code,
      updated_at = now()
  where company_id = target_company;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. A card is required at sign-up whenever the server bills, including for shops made by
--    calling create_company directly. The server turns this on (public.require_card_at_signup)
--    when Stripe billing is configured.
-- ---------------------------------------------------------------------------

create table app.platform_setting (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app.platform_setting enable row level security;

create or replace function public.require_card_at_signup(required boolean) returns void
language sql security definer set search_path = public, app, pg_temp as $$
  insert into app.platform_setting (key, value) values ('card_required_at_signup', to_jsonb(required))
  on conflict (key) do update set value = excluded.value, updated_at = now()
$$;
revoke all on function public.require_card_at_signup(boolean) from public, anon, authenticated;
grant execute on function public.require_card_at_signup(boolean) to service_role;

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
  insert into public.subscription (company_id, status, trial_ends_at, card_required)
  values (new_company, 'trialing', now() + interval '14 days',
          coalesce((select (value)::text::boolean from app.platform_setting
                    where key = 'card_required_at_signup'), false));

  return new_company;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Read-only shops: the texting tables get the same lock as every other synced table
--    (they were added after the billing migration's one-time loop).
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['phone_line', 'conversation', 'text_message', 'call_log'] loop
    execute format('drop trigger if exists guard_writable on public.%I', t);
    execute format(
      'create trigger guard_writable before insert or update or delete on public.%I
         for each row execute function app.guard_writable()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Server-counted daily allowances for Tidemark-paid services (email, AI drafts,
--    transcription, texts and calls). Only the server counts, after it has checked who is
--    asking.
-- ---------------------------------------------------------------------------

create table app.daily_usage (
  company_id uuid not null references public.company (id) on delete cascade,
  day date not null default current_date,
  kind text not null check (kind in ('email', 'narrative', 'transcribe', 'text', 'call')),
  used integer not null default 0 check (used >= 0),
  primary key (company_id, day, kind)
);
alter table app.daily_usage enable row level security;

create or replace function public.use_allowance(target_company uuid, use_kind text,
                                                how_many integer, day_limit integer)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  before integer;
begin
  if how_many is null or how_many <= 0 or how_many > 1000 then
    raise exception 'Invalid count' using errcode = 'invalid_parameter_value';
  end if;
  select used into before from app.daily_usage
  where company_id = target_company and day = current_date and kind = use_kind for update;
  if coalesce(before, 0) + how_many > day_limit then
    return false;
  end if;
  insert into app.daily_usage (company_id, day, kind, used)
  values (target_company, current_date, use_kind, how_many)
  on conflict (company_id, day, kind) do update set used = daily_usage.used + how_many;
  return true;
end
$$;
revoke all on function public.use_allowance(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.use_allowance(uuid, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Routing allowance: members can only count calls up, never reset the counter.
-- ---------------------------------------------------------------------------

update app.routing_usage set calls = 0 where calls < 0;
alter table app.routing_usage add constraint routing_usage_calls_nonnegative check (calls >= 0);

create or replace function public.routing_use(target_company uuid, use_kind text,
                                              how_many integer, day_limit integer)
returns boolean
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  used integer;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  if how_many is null or how_many <= 0 or how_many > 1000 then
    raise exception 'Invalid count' using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(sum(calls), 0) into used from app.routing_usage
  where company_id = target_company and day = current_date;
  if used + how_many > day_limit then
    return false;
  end if;
  insert into app.routing_usage (company_id, day, kind, calls)
  values (target_company, current_date, use_kind, how_many)
  on conflict (company_id, day, kind) do update set calls = routing_usage.calls + how_many;
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Limited techs: a row's second parent (a signature's quote or report, a picture's
--    finding, test or item, a quote line's finding) must be on the same job, so a row on a
--    tech's own job can't reach into a job hidden from them. On-site quote acceptance only
--    accepts the signed job's own quote.
-- ---------------------------------------------------------------------------

create or replace function app.same_job_refs() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  bad boolean := false;
begin
  -- Members only; the server and seeds are trusted.
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if tg_table_name = 'signature' then
    bad := (new.quote_id is not null and not exists (
              select 1 from public.quote where id = new.quote_id and job_id = new.job_id))
        or (new.report_id is not null and not exists (
              select 1 from public.report where id = new.report_id and job_id = new.job_id));
  elsif tg_table_name = 'media' then
    bad := (new.finding_id is not null and not exists (
              select 1 from public.finding where id = new.finding_id and job_id = new.job_id))
        or (new.test_result_id is not null and not exists (
              select 1 from public.test_result where id = new.test_result_id and job_id = new.job_id))
        or (new.job_component_id is not null and not exists (
              select 1 from public.job_component where id = new.job_component_id and job_id = new.job_id));
  elsif tg_table_name = 'quote_line_item' then
    bad := new.finding_id is not null and not exists (
             select 1 from public.finding f join public.quote q on q.job_id = f.job_id
             where f.id = new.finding_id and q.id = new.quote_id);
  end if;
  if bad then
    raise exception 'That belongs to a different job' using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;

drop trigger if exists same_job_refs on public.signature;
create trigger same_job_refs before insert or update of job_id, quote_id, report_id
  on public.signature for each row execute function app.same_job_refs();
drop trigger if exists same_job_refs on public.media;
create trigger same_job_refs before insert or update of job_id, finding_id, test_result_id, job_component_id
  on public.media for each row execute function app.same_job_refs();
drop trigger if exists same_job_refs on public.quote_line_item;
create trigger same_job_refs before insert or update of quote_id, finding_id
  on public.quote_line_item for each row execute function app.same_job_refs();

create or replace function app.accept_quote_on_site() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  q public.quote;
begin
  if new.purpose <> 'quote_acceptance' or new.quote_id is null or new.deleted_at is not null then
    return null;
  end if;
  select * into q from public.quote
  where id = new.quote_id and job_id = new.job_id and company_id = new.company_id
    and deleted_at is null;
  if q.id is null or q.status not in ('draft', 'sent') then
    return null;
  end if;
  begin
    if q.status = 'draft' then
      q := app.finalize_quote(q.id);
      perform set_config('app.quote_server', 'on', true);
      update public.quote set status = 'sent', sent_at = coalesce(sent_at, now()) where id = q.id;
      perform set_config('app.quote_server', 'off', true);
      update public.finding set status = 'quoted'
      where id in (select finding_id from public.quote_line_item
                   where quote_id = q.id and deleted_at is null and finding_id is not null)
        and status = 'open';
      update public.job set status = 'quote_sent' where id = q.job_id and status = 'report_sent';
    end if;
    perform app.accept_quote(q.id, new.signer_name, null, 'Signed on site');
    if not exists (select 1 from public.share_link where quote_id = q.id and revoked_at is null) then
      insert into public.share_link (company_id, job_id, quote_id) values (q.company_id, q.job_id, q.id);
    end if;
  exception when others then
    raise warning 'On-site acceptance of quote % failed: %', q.id, sqlerrm;
  end;
  return null;
end
$$;

-- Turning a link off is a change to its job, so a limited tech can only do it on their jobs.
create or replace function public.turn_off_share_link(link_id uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  co uuid;
  jb uuid;
begin
  select company_id, job_id into co, jb from public.share_link where id = link_id;
  if co is null or not app.is_member(co) or not app.job_visible(co, jb) then
    raise exception 'Link not found' using errcode = 'no_data_found';
  end if;
  update public.share_link set revoked_at = coalesce(revoked_at, now()) where id = link_id;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Phones drop conversations a limited tech loses: every input of conversation
--    visibility restarts their sync, not only a job changing hands.
-- ---------------------------------------------------------------------------

create or replace function app.job_hands_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.assigned_user_id is distinct from old.assigned_user_id
     or new.second_tech_id is distinct from old.second_tech_id
     or new.property_id is distinct from old.property_id
     or new.bill_to_customer_id is distinct from old.bill_to_customer_id
     or new.deleted_at is distinct from old.deleted_at then
    perform app.bump_visibility_epoch(new.company_id);
  end if;
  return new;
end
$$;

drop trigger if exists job_hands_changed on public.job;
create trigger job_hands_changed
  after update of assigned_user_id, second_tech_id, property_id, bill_to_customer_id, deleted_at
  on public.job for each row execute function app.job_hands_changed();

create or replace function app.customer_link_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.customer_id is distinct from old.customer_id
     or (tg_table_name = 'property' and new.deleted_at is distinct from old.deleted_at) then
    perform app.bump_visibility_epoch(new.company_id);
  end if;
  return new;
end
$$;

drop trigger if exists customer_link_changed on public.property;
create trigger customer_link_changed after update of customer_id, deleted_at
  on public.property for each row execute function app.customer_link_changed();
drop trigger if exists customer_link_changed on public.conversation;
create trigger customer_link_changed after update of customer_id
  on public.conversation for each row execute function app.customer_link_changed();

-- ---------------------------------------------------------------------------
-- 9. Text pictures follow conversation visibility, like the media and documents buckets.
--    Pictures the team sends live under {company}/out/: limited techs see their own.
-- ---------------------------------------------------------------------------

create policy texts_conversation_visible on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'texts'
         or app.object_company(name) = any ((select app.all_jobs_companies())::uuid[])
         or ((storage.foldername(name))[2] = 'out' and owner = auth.uid())
         or app.conversation_on_my_jobs(app.object_company(name),
                                        app.try_uuid((storage.foldername(name))[2])));

-- ---------------------------------------------------------------------------
-- 10. Customer links: the opt-out page honors expiry and deletion like the other link pages,
--     and reminders never carry a link that has already expired.
-- ---------------------------------------------------------------------------

create or replace function public.opt_out_for_token(link_token text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sl public.share_link;
  cust uuid;
  shop text;
begin
  select * into sl from public.share_link
  where token = link_token and revoked_at is null and deleted_at is null
    and (expires_at is null or expires_at > now());
  if sl.id is null then
    return null;
  end if;
  select coalesce(j.bill_to_customer_id, p.customer_id), co.name into cust, shop
  from public.job j
  left join public.property p on p.id = j.property_id
  join public.company co on co.id = j.company_id
  where j.id = sl.job_id;
  update public.customer set marketing_opt_out = true where id = cust;
  return jsonb_build_object('company', shop);
end
$$;

create or replace function public.shop_for_token(link_token text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select co.name from public.share_link sl
  join public.company co on co.id = sl.company_id
  where sl.token = link_token and sl.revoked_at is null and sl.deleted_at is null
    and (sl.expires_at is null or sl.expires_at > now())
$$;
