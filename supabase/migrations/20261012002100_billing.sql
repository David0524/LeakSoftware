-- Tidemark billing (M10): each shop has a subscription row (made at signup with a 30-day
-- trial; Stripe Billing on the platform account keeps it current through webhooks). When
-- the trial has ended without a subscription, the subscription is canceled, or a payment
-- has been past due for more than 7 days, the shop is read-only: members can still see
-- everything, nothing is deleted, and writes are refused until it is paid. Customers
-- (accepting quotes, paying) and the server (webhooks, cron) are never blocked.
--
-- A new synced table gets the same guard: add it to the loop at the end (or re-run it).

create or replace function app.company_locked(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.subscription s
    where s.company_id = target_company
      and ((s.status = 'trialing' and s.trial_ends_at < now() and s.stripe_subscription_id is null)
           or s.status = 'canceled'
           or (s.status = 'past_due'
               and coalesce(s.current_period_end, now()) < now() - interval '7 days')))
$$;

create or replace function app.guard_writable() returns trigger
language plpgsql as $$
declare
  co uuid;
begin
  -- Only signed-in members (directly or through their RPCs) are held to it.
  if auth.uid() is null or coalesce(current_setting('role', true), '') <> 'authenticated' then
    return coalesce(new, old);
  end if;
  co := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  if app.company_locked(co) then
    raise exception 'This shop is read-only until its Tidemark subscription is paid. Nothing has been deleted.'
      using errcode = 'TL423';
  end if;
  return coalesce(new, old);
end
$$;

do $$
declare
  t text;
begin
  for t in select table_name from app.sync_table loop
    execute format('drop trigger if exists guard_writable on public.%I', t);
    execute format(
      'create trigger guard_writable before insert or update or delete on public.%I
         for each row execute function app.guard_writable()', t);
  end loop;
end
$$;

-- What every member's screen needs to know: trial, paid, or read-only.
create or replace function public.company_access(target_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  s public.subscription;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.subscription where company_id = target_company;
  return jsonb_build_object(
    'status', coalesce(s.status, 'active'),
    'plan', s.plan,
    'trial_ends_at', s.trial_ends_at,
    'current_period_end', s.current_period_end,
    'subscribed', s.stripe_subscription_id is not null,
    'locked', app.company_locked(target_company));
end
$$;

revoke all on function public.company_access(uuid) from public, anon;
grant execute on function public.company_access(uuid) to authenticated;
grant execute on function app.company_locked(uuid) to authenticated, service_role;

-- The demo shop never runs out of trial.
update public.subscription s set status = 'active', plan = 'demo'
from public.membership m join auth.users u on u.id = m.user_id
where m.company_id = s.company_id and m.role = 'owner'
  and u.email = 'owner@demo.leakbook.test' and s.stripe_subscription_id is null;
