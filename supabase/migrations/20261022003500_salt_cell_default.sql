-- New shops' price book: Salt cell clean is $45 (owner, 2026-10-27: Cole's prices are the new
-- defaults). Existing shops keep their own prices.
update app.config_default d
set rows = (
  select jsonb_agg(
    case when r->>'name' = 'Salt cell clean'
      then jsonb_set(r, '{price_cents}', '4500'::jsonb) else r end
    order by ord)
  from jsonb_array_elements(d.rows) with ordinality as e(r, ord)
)
where d.key = 'price_book_item';
