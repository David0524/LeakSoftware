-- A sign-up link that carries a code (owner, 2026-11-23: "Yes do that"):
-- https://sundeckpro.com/sign-up?code=CANNONBALL90. The sign-up page shows the code's offer
-- ("Code CANNONBALL90: 3 months free.") before the person has an account, so the website asks
-- here, with the server key, what one code would give. It answers for one code at a time and
-- never lists codes. Unknown, turned-off, ended and used-up codes, and demo codes, answer null
-- (the page shows nothing). The code is applied later by public.redeem_code, unchanged.
-- Design: docs/design/2026-11-23-promo-and-referral-codes.md.

create or replace function public.code_offer(code text) returns jsonb
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  wanted text := app.normalize_code(code);
  p app.promo_code;
  referrer record;
begin
  if wanted = '' or length(wanted) > 40 then
    return null;
  end if;
  -- Demo codes aren't offered on the sign-up page.
  if exists (select 1 from app.access_code a where app.normalize_code(a.code) = wanted) then
    return null;
  end if;
  -- A promo code wins a clash, as in redeem_code; the same checks decide whether it works.
  select * into p from app.promo_code x where x.code = wanted;
  if p.code is not null then
    if not p.active or (p.expires_at is not null and p.expires_at <= now())
       or (p.max_uses is not null and (select count(*) from public.subscription x
                                       where x.promo_code = p.code and x.promo_kind = 'promo') >= p.max_uses) then
      return null;
    end if;
    return jsonb_build_object('kind', 'promo', 'code', p.code, 'free_months', p.free_months,
      'percent_off', p.percent_off, 'percent_months', p.percent_months);
  end if;
  -- Another shop's name, found the way redeem_code finds it (its LLC or Inc typed too).
  select x.referral_code, c.name into referrer from public.subscription x
  join public.company c on c.id = x.company_id and c.deleted_at is null
  where x.referral_code in (wanted, app.referral_stem(code))
  order by x.referral_code = wanted desc
  limit 1;
  if referrer.referral_code is null then
    return null;
  end if;
  return jsonb_build_object('kind', 'referral', 'code', referrer.referral_code, 'free_months', 1,
    'percent_off', null, 'percent_months', null, 'referrer_name', referrer.name);
end
$$;
-- The website's server only (it checks one code from a link); never shops or visitors.
revoke all on function public.code_offer(text) from public, anon, authenticated;
grant execute on function public.code_offer(text) to service_role;
