-- A failed payment makes the shop read-only after a week (security review, 2026-10-25).
--
-- The rule (DECISIONS, billing): a shop is read-only when "a payment has been past due for more
-- than 7 days". app.company_locked measured that from subscription.current_period_end, but
-- Stripe moves a subscription's period forward when the renewal invoice is made, before it is
-- paid: a failed renewal leaves current_period_end about a month ahead, and the next renewal
-- moves it again. A shop whose payments kept failing (Stripe's "leave past due" or "mark
-- unpaid" setting) was never locked.
--
-- Now the database notes when the subscription went past due (past_due_since, kept by a
-- trigger whatever writes the status: the Stripe webhook or the daily sync) and locks the shop
-- 7 days after that. The old check stays, so nothing that locked before unlocks now.

alter table public.subscription add column past_due_since timestamptz;

comment on column public.subscription.past_due_since is
  'When the subscription last went past due; null otherwise. Set by app.track_past_due.';

create or replace function app.track_past_due() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'past_due' then
    if tg_op = 'INSERT' then
      new.past_due_since := coalesce(new.past_due_since, now());
    elsif old.status is distinct from 'past_due' then
      new.past_due_since := now();
    else
      new.past_due_since := coalesce(new.past_due_since, old.past_due_since, now());
    end if;
  else
    new.past_due_since := null;
  end if;
  return new;
end
$$;
revoke all on function app.track_past_due() from public;

create trigger track_past_due before insert or update on public.subscription
  for each row execute function app.track_past_due();

-- Shops past due today get the week's grace from now.
update public.subscription set past_due_since = now() where status = 'past_due';

create or replace function app.company_locked(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.subscription s
    where s.company_id = target_company
      and ((s.card_required and s.stripe_subscription_id is null)
           or (s.status = 'trialing' and s.trial_ends_at < now() and s.stripe_subscription_id is null)
           or s.status = 'canceled'
           or (s.status = 'past_due'
               and (s.past_due_since < now() - interval '7 days'
                    or coalesce(s.current_period_end, now()) < now() - interval '7 days'))))
$$;
