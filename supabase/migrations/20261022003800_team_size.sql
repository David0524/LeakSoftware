-- The team size an owner picks on the trial page or in Sundeck Pro Billing (owner, 2026-11-12:
-- "you can't adjust how many employees you have and the pricing"). It lives in
-- company.settings.team_size; the shop is billed for it, or for its active people when there are
-- more. The Admin portal's shop rows carry it so its revenue matches what Stripe bills.
-- As 20261022002100_heard_from.sql, plus team_size.
create or replace function app.admin_shop_rows(target_shop uuid default null) returns setof jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'legal_name', c.legal_name, 'email', c.email, 'phone', c.phone,
    'address_line1', c.address_line1, 'address_line2', c.address_line2, 'city', c.city,
    'state', c.state, 'postal_code', c.postal_code, 'timezone', c.timezone,
    'created_at', c.created_at,
    'services', coalesce(c.settings ->> 'services', 'both'),
    'status', coalesce(s.status, 'trialing'), 'plan', coalesce(s.plan, 'standard'),
    'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
    'access_code', s.access_code, 'card_required', coalesce(s.card_required, false),
    'stripe_customer_id', s.stripe_customer_id, 'stripe_subscription_id', s.stripe_subscription_id,
    'locked', app.company_locked(c.id),
    'people', (select count(*) from public.membership m
               where m.company_id = c.id and m.status = 'active' and m.deleted_at is null),
    'owner_id', o.user_id, 'owner_name', o.full_name, 'owner_email', o.email, 'owner_phone', o.phone,
    'last_active_at', greatest(
      (select max(u.last_sign_in_at) from public.membership m join auth.users u on u.id = m.user_id
       where m.company_id = c.id and m.deleted_at is null),
      (select max(d.last_seen_at) from public.push_device d
       join public.membership m on m.user_id = d.user_id
       where m.company_id = c.id and m.deleted_at is null)),
    'jobs_30d', (select count(*) from public.job j where j.company_id = c.id and j.deleted_at is null
                 and not j.sample and j.completed_at > now() - interval '30 days'),
    'jobs_total', (select count(*) from public.job j
                   where j.company_id = c.id and j.deleted_at is null and not j.sample),
    'customers', (select count(*) from public.customer cu
                  where cu.company_id = c.id and cu.deleted_at is null),
    'payments_on', coalesce(sa.charges_enabled, false),
    'stripe_account_id', sa.stripe_account_id,
    'payouts_on', coalesce(sa.payouts_enabled, false),
    'payments_details_submitted', coalesce(sa.details_submitted, false),
    'heard_from', s.heard_from, 'heard_from_other', s.heard_from_other,
    'team_size', case when jsonb_typeof(c.settings -> 'team_size') = 'number'
                      then (c.settings ->> 'team_size')::numeric end)
  from public.company c
  left join public.subscription s on s.company_id = c.id
  left join public.stripe_account sa on sa.company_id = c.id
  left join lateral (
    select m.user_id, p.full_name, p.phone, u.email
    from public.membership m join auth.users u on u.id = m.user_id
    left join public.profile p on p.id = m.user_id
    where m.company_id = c.id and m.role = 'owner' and m.deleted_at is null
    order by (m.status = 'active') desc, m.created_at
    limit 1) o on true
  where c.deleted_at is null and (target_shop is null or c.id = target_shop)
  order by c.created_at desc
$$;
