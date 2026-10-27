-- New shops' price book no longer has "Replace return fitting" (owner, 2026-10-27: Cole deleted
-- it on purpose; "It should not be included by default"). Existing shops keep theirs.
update app.config_default d
set rows = (
  select jsonb_agg(r order by ord)
  from jsonb_array_elements(d.rows) with ordinality as e(r, ord)
  where r ->> 'name' <> 'Replace return fitting'
)
where d.key = 'price_book_item';
