-- Leads: Archive without Mark Called, and bots kept off the call list (owner, 2026-11-06: "We
-- need bot detection and a way to archive leads without pressing mark called"). A lead with
-- archived_at is off To Call, Not Paid and All, under Archived, until staff unarchive it.
alter table public.signup_lead add column archived_at timestamptz;

-- Leads as 20261022002100_heard_from.sql, with when it was archived.
create or replace function public.lead_list() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) from (
    select l.id, l.email, l.name, l.company_name, l.phone, l.services, l.notes,
           l.created_at, l.updated_at, l.contacted_at, l.archived_at, l.user_id,
           u.email_confirmed_at,
           co.id as company_id, co.name as company,
           s.status, s.plan, s.access_code, s.trial_ends_at, s.onboarded_at,
           s.stripe_subscription_id is not null as card_in,
           s.onboarding is not null or s.created_at >= timestamptz '2026-10-24 00:00:00+00'
             as reached_payment,
           (s.onboarding ->> 'people')::int as people,
           s.onboarding ->> 'goal' as goal,
           s.heard_from, s.heard_from_other
    from public.signup_lead l
    left join auth.users u on u.id = l.user_id
    left join lateral (
      select m.company_id from public.membership m
      where m.user_id = l.user_id and m.role = 'owner' and m.deleted_at is null
      order by m.company_id limit 1
    ) m on true
    left join public.company co on co.id = m.company_id
    left join public.subscription s on s.company_id = co.id
  ) x
$$;
revoke all on function public.lead_list() from public, anon, authenticated;
grant execute on function public.lead_list() to service_role;

-- The bot sign-ups already on the list (2026-10-21 and 2026-11-05): spam words or emoji in the
-- name, or random letters (two runs of five consonants), as packages/core bot-check.ts reads
-- them. New ones never get here: the sign-up refuses them.
update public.signup_lead
set archived_at = now(), updated_at = now()
where archived_at is null
  and (concat_ws(' ', name, company_name) ~* '\m(bonus|casino|betting|jackpot|crypto|bitcoin|usdt|forex|viagra|porn|giveaway|telegram|whatsapp)\M'
    or concat_ws(' ', name, company_name) ~ '[\U0001F300-\U0001FAFF\u2600-\u27BF]'
    or concat_ws(' ', name, company_name) ~* '[bcdfghjklmnpqrstvwxz]{5}.*[^a-z].*[bcdfghjklmnpqrstvwxz]{5}');
