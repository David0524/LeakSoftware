-- An Admin role between Owner and Tech (owner, 2026-10-18).
--
-- Owner: full access, plus shop-level control. Admin: office staff; everything an owner could
-- do before, except the owner-only items. Tech: unchanged. The stored values are 'owner',
-- 'admin', and 'tech'.
--
-- Owner-only (app.is_owner, here and in the website's server code):
--   Sundeck Pro billing (subscribing, the portal, demo codes), connecting or changing the
--   shop's Stripe account, deleting the shop, making someone an owner or admin, changing an
--   owner's or admin's role, turning an owner off, and the shop's security settings (what
--   techs may see and do).
-- Everything else owners could do, managers (owners and admins, app.is_manager) can.

-- ---------------------------------------------------------------------------
-- The role
-- ---------------------------------------------------------------------------

alter table public.membership drop constraint membership_role_check;
alter table public.membership add constraint membership_role_check
  check (role in ('owner', 'admin', 'tech'));
alter table public.invite drop constraint invite_role_check;
alter table public.invite add constraint invite_role_check
  check (role in ('owner', 'admin', 'tech'));

-- Owner or admin of the shop (and, as for every check, past two-step sign-in when it's on).
create or replace function app.is_manager(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.membership
    where company_id = target_company
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and status = 'active'
      and deleted_at is null
  ) and app.two_step_ok()
$$;

-- Once per query, like app.owner_companies() (20261012003200_fast_row_security.sql).
create or replace function app.manager_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.two_step_ok() then
    (select coalesce(array_agg(company_id), '{}') from public.membership
     where user_id = auth.uid() and role in ('owner', 'admin') and status = 'active'
       and deleted_at is null)
  else '{}'::uuid[] end
$$;

revoke all on function app.is_manager(uuid), app.manager_companies() from public;
grant execute on function app.is_manager(uuid), app.manager_companies() to authenticated, service_role;

-- Admins see every job and can always make jobs, as owners do.
create or replace function app.all_jobs_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.two_step_ok() then
    (select coalesce(array_agg(m.company_id), '{}')
     from public.membership m join public.company c on c.id = m.company_id
     where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
       and (m.role in ('owner', 'admin')
            or coalesce((c.settings ->> 'techs_see_all_jobs')::boolean, true)))
  else '{}'::uuid[] end
$$;

create or replace function app.job_maker_companies() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(m.company_id), '{}')
  from public.membership m join public.company c on c.id = m.company_id
  where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
    and (m.role in ('owner', 'admin') or coalesce((c.settings ->> 'techs_make_jobs')::boolean, true))
$$;

-- Managers see former teammates' names (20261012001100_owner_sees_former_members.sql).
create or replace function app.owns_member(other_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.membership mine
    join public.membership theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid() and mine.role in ('owner', 'admin') and mine.status = 'active'
      and mine.deleted_at is null and theirs.user_id = other_user
  ) and app.two_step_ok()
$$;

-- ---------------------------------------------------------------------------
-- Row rules: what owners could write, managers can
-- ---------------------------------------------------------------------------

-- The registry gets a 'manager' level; every table that was owners-only becomes managers.
alter table app.sync_table drop constraint sync_table_read_role_check;
alter table app.sync_table add constraint sync_table_read_role_check
  check (read_role in ('member', 'manager', 'owner'));
alter table app.sync_table drop constraint sync_table_write_role_check;
alter table app.sync_table add constraint sync_table_write_role_check
  check (write_role in ('member', 'manager', 'owner', 'none'));
update app.sync_table set read_role = 'manager' where read_role = 'owner';
update app.sync_table set write_role = 'manager' where write_role = 'owner';

-- The generated policies (20261012000600_access.sql, in their once-per-query form) and the
-- hand-made ones that followed the same pattern: the owner check becomes the manager check.
-- None of the owner-only items are row rules; they live in functions and the website.
do $$
declare
  p record;
  q text;
  w text;
begin
  for p in
    select pol.polname, n.nspname, c.relname,
           pg_get_expr(pol.polqual, pol.polrelid) as qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as chk
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'storage')
  loop
    q := replace(replace(p.qual, 'app.owner_companies()', 'app.manager_companies()'),
                 'app.is_owner(', 'app.is_manager(');
    w := replace(replace(p.chk, 'app.owner_companies()', 'app.manager_companies()'),
                 'app.is_owner(', 'app.is_manager(');
    if q is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.polname, p.nspname, p.relname, q);
    end if;
    if w is distinct from p.chk then
      execute format('alter policy %I on %I.%I with check (%s)', p.polname, p.nspname, p.relname, w);
    end if;
  end loop;
end
$$;

-- Teach the once-per-query rewrite the manager check, then run it over every policy.
create or replace function app.fast_check(expr text) returns text
language sql immutable as $$
  -- Already rewritten (it uses the per-query lookups): leave it, so running this twice is safe.
  select case when expr ~ 'app\.(member|owner|manager|all_jobs)_companies\(\)' then expr else
  regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(expr,
    'app\.is_member\(company_id\)', '(company_id = ANY ((SELECT app.member_companies())::uuid[]))', 'g'),
    'app\.is_owner\(company_id\)', '(company_id = ANY ((SELECT app.owner_companies())::uuid[]))', 'g'),
    'app\.is_manager\(company_id\)', '(company_id = ANY ((SELECT app.manager_companies())::uuid[]))', 'g'),
    'app\.job_row_visible\(company_id, ([a-z_]+), ([a-zA-Z_:]+)\)',
      '((company_id = ANY ((SELECT app.all_jobs_companies())::uuid[])) OR (\1 = (SELECT auth.uid())) OR (\2 = (SELECT auth.uid())))', 'g'),
    'app\.job_visible\(company_id, ([a-z_]+)\)',
      '((company_id = ANY ((SELECT app.all_jobs_companies())::uuid[])) OR app.job_visible(company_id, \1))', 'g'),
    'app\.linked_job_visible\(company_id, ([^)]+)\)',
      '((company_id = ANY ((SELECT app.all_jobs_companies())::uuid[])) OR app.linked_job_visible(company_id, \1))', 'g')
  end
$$;
revoke all on function app.fast_check(text) from public;

select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- Functions: manager actions accept admins; owner-only ones stay with owners
-- ---------------------------------------------------------------------------

-- These were owners-only only because there was no admin: the owner check becomes the manager
-- check, the rest of each function is as it was (latest definitions, rewritten in place).
do $$
declare
  f text;
  def text;
begin
  foreach f in array array[
    'app.sees_all_jobs(uuid)',
    'app.finalize_quote(uuid)',
    'app.record_invoice_payment_unchecked(uuid, integer)',
    'app.void_invoice_unchecked(uuid)',
    'public.add_package_defaults(uuid, text)',
    'public.create_monthly_invoices(uuid, date)',
    'public.create_service_plan(uuid, jsonb, uuid, jsonb, uuid, jsonb)',
    'public.delete_customer(uuid)',
    'public.import_customers(uuid, jsonb)',
    'public.owner_dashboard(uuid, integer)',
    'public.set_next_job_number(uuid, integer)',
    'public.unbilled_maintenance(uuid)'
  ] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('app.is_owner(' in def) = 0 then
      raise exception 'admin role: % no longer checks for an owner; review it', f;
    end if;
    execute replace(replace(def, 'app.is_owner(', 'app.is_manager('),
                    'Only owners can', 'Only owners and admins can');
  end loop;
end
$$;

-- Invites: managers invite techs; only owners invite owners and admins.
create or replace function public.create_invite(target_company uuid, invite_email text,
  invite_role text default 'tech') returns text
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  new_token text;
begin
  if invite_role not in ('owner', 'admin', 'tech') then
    raise exception 'Unknown role %', invite_role using errcode = 'invalid_parameter_value';
  end if;
  if not app.is_manager(target_company) then
    raise exception 'Only owners and admins can invite' using errcode = 'insufficient_privilege';
  end if;
  if invite_role <> 'tech' and not app.is_owner(target_company) then
    raise exception 'Only the shop owner can invite owners and admins'
      using errcode = 'insufficient_privilege';
  end if;

  -- One open invite per email: revoke earlier ones.
  update public.invite set revoked_at = now()
  where company_id = target_company and lower(email) = lower(trim(invite_email))
    and accepted_at is null and revoked_at is null;

  insert into public.invite (company_id, email, role, created_by)
  values (target_company, lower(trim(invite_email)), invite_role, auth.uid())
  returning token into new_token;
  return new_token;
end
$$;

create or replace function public.revoke_invite(invite_id uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  target uuid;
  invited_as text;
begin
  select company_id, role into target, invited_as from public.invite where id = invite_id;
  if target is null or not app.is_manager(target) then
    raise exception 'Only owners and admins can revoke invites' using errcode = 'insufficient_privilege';
  end if;
  if invited_as <> 'tech' and not app.is_owner(target) then
    raise exception 'Only the shop owner can revoke an owner''s or admin''s invite'
      using errcode = 'insufficient_privilege';
  end if;
  update public.invite set revoked_at = now()
  where id = invite_id and accepted_at is null and revoked_at is null;
end
$$;

-- ---------------------------------------------------------------------------
-- Owner-only changes to people and to the shop's security settings
-- ---------------------------------------------------------------------------

-- Only an owner changes anyone's role or turns an owner off. Admins can turn techs and
-- admins off and on. (The last active owner is still protected by app.protect_last_owner.)
create or replace function app.guard_member_changes() returns trigger
language plpgsql as $$
begin
  -- Signed-in people only; the server and the database's own functions are trusted.
  if auth.uid() is null or coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if app.is_owner(old.company_id) then
    return new;
  end if;
  if new.role is distinct from old.role
     or (old.role = 'owner' and new.status is distinct from old.status) then
    raise exception 'Only the shop owner can do this' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger guard_member_changes before update on public.membership
  for each row execute function app.guard_member_changes();

-- What techs may see and do (Settings › Team) is a security setting: owners only.
create or replace function app.guard_security_settings() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if ((new.settings -> 'techs_see_all_jobs') is distinct from (old.settings -> 'techs_see_all_jobs')
      or (new.settings -> 'techs_make_jobs') is distinct from (old.settings -> 'techs_make_jobs'))
     and not app.is_owner(old.id) then
    raise exception 'Only the shop owner can do this' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger guard_security_settings before update on public.company
  for each row execute function app.guard_security_settings();

revoke all on function app.guard_member_changes(), app.guard_security_settings() from public;

-- ---------------------------------------------------------------------------
-- Nothing left unclassified
-- ---------------------------------------------------------------------------

-- Every function that still checks for an owner is a reviewed owner-only one.
do $$
declare
  left_over text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ') into left_over
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and p.prosrc like '%app.is_owner(%'
    and n.nspname || '.' || p.proname not in (
      'public.redeem_access_code',     -- Sundeck Pro billing (demo codes)
      'public.create_invite',          -- owners and admins as invitees
      'public.revoke_invite',
      'app.guard_member_changes',      -- roles, turning owners off
      'app.guard_security_settings');  -- what techs may see and do
  if left_over is not null then
    raise exception 'admin role: owner checks not yet classified: %', left_over;
  end if;
end
$$;
