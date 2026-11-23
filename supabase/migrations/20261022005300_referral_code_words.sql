-- Referral codes end on a whole word (2026-11-23, from the demo shop's code). A long shop name
-- was cut at 20 letters, mid-word: "Canyon State Leak Detections" became CANYONSTATELEAKDETEC.
-- Now the code keeps whole words while they fit in 20 (CANYONSTATELEAK); only a first word
-- longer than 20 is cut. Typing the full name still finds the shop: redeem_code and code_offer
-- compare app.referral_stem of what was typed with the stored code.

create or replace function app.referral_stem(shop_name text) returns text
language plpgsql immutable set search_path = pg_temp as $$
declare
  words text[] := array(select w from regexp_split_to_table(upper(coalesce(shop_name, '')),
                                                            '[^A-Z0-9]+') w where w <> '');
  stem text := '';
  w text;
begin
  while cardinality(words) > 1 and words[cardinality(words)] in
      ('LLC', 'PLLC', 'LC', 'INC', 'INCORPORATED', 'CO', 'CORP', 'CORPORATION', 'LTD', 'LLP') loop
    words := words[1:cardinality(words) - 1];
  end loop;
  foreach w in array words loop
    if stem = '' then
      stem := left(w, 20);
    elsif length(stem) + length(w) <= 20 then
      stem := stem || w;
    else
      exit;
    end if;
  end loop;
  return stem;
end
$$;
grant execute on function app.referral_stem(text) to authenticated, service_role;

-- Shops whose code was cut mid-word get the whole-word code. Shops that already referred
-- someone keep theirs (it may be on a card or in a message); referrals are tied to the shop,
-- not the code, so nothing else changes.
do $$
declare
  r record;
begin
  for r in select s.company_id, c.name, s.referral_code from public.subscription s
           join public.company c on c.id = s.company_id
           where s.referral_code is not null
             and not exists (select 1 from public.subscription x where x.referred_by = s.company_id)
             and regexp_replace(s.referral_code, '[0-9]+$', '') <> app.referral_stem(c.name)
             and s.referral_code <> app.referral_stem(c.name)
           order by s.created_at loop
    update public.subscription set referral_code = null where company_id = r.company_id;
    update public.subscription set referral_code = app.make_referral_code(r.name)
    where company_id = r.company_id;
  end loop;
end
$$;
