-- Extending a trial in the Admin portal also counts as setup finished (owner, 2026-10-24: "Yes").
--
-- A shop whose owner never finished setting up has subscription.onboarded_at null: the website
-- sends the owner to /welcome and the apps hold them on Finish Setting Up. When staff extend
-- the trial, they've decided the shop should be let in, so onboarded_at is set too (only when it
-- is null; a shop that finished setting up keeps its date).
--
-- As 20261022000700_admin_portal.sql otherwise.

create or replace function public.admin_extend_trial(target_company uuid, days integer)
returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.subscription;
  ends timestamptz;
begin
  if days not in (7, 14, 30) then
    raise exception 'Choose 7, 14 or 30 days.' using errcode = 'invalid_parameter_value';
  end if;
  select * into s from public.subscription where company_id = target_company for update;
  if s.company_id is null then
    raise exception 'This shop has no subscription.' using errcode = 'invalid_parameter_value';
  end if;
  if s.stripe_subscription_id is not null then
    raise exception 'Stripe bills this shop. Change its trial in the Stripe dashboard.'
      using errcode = 'invalid_parameter_value';
  end if;
  if s.plan = 'demo' then
    raise exception 'This is a demo shop. End Demo first.' using errcode = 'invalid_parameter_value';
  end if;
  ends := greatest(coalesce(s.trial_ends_at, now()), now()) + make_interval(days => days);
  update public.subscription
  set status = 'trialing', trial_ends_at = ends, card_required = false,
      onboarded_at = coalesce(onboarded_at, now()), updated_at = now()
  where company_id = target_company;
  return ends;
end
$$;

revoke all on function public.admin_extend_trial(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_extend_trial(uuid, integer) to service_role;
