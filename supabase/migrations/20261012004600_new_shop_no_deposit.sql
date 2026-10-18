-- New shops start with no deposit and no tech discount (owner, 2026-10-18: "Have 'Deposit
-- percentage' default to 0 for new accounts. Same with 'largest tech discount'"). Owners set
-- either in Settings. Existing shops keep what they have.
do $$
declare
  current_default jsonb;
begin
  execute 'select ' || pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.company'::regclass and a.attname = 'settings'
  into current_default;
  current_default := jsonb_set(current_default, '{deposit,value_bps}', '0');
  current_default := jsonb_set(current_default, '{tech_discount_limit_bps}', '0');
  execute format('alter table public.company alter column settings set default %L::jsonb',
                 current_default);
end
$$;
