-- New shops' price book follows Cole's (owner, 2026-10-27): Salt cell clean is $45, and Replace
-- return fitting isn't a default.
begin;
set search_path = public, extensions;
select plan(2);
select is(
  (select (r ->> 'price_cents')::int from app.config_default d, jsonb_array_elements(d.rows) r
   where d.key = 'price_book_item' and r ->> 'name' = 'Salt cell clean'),
  4500, 'new shops price Salt cell clean at $45');
select is(
  (select count(*)::int from app.config_default d, jsonb_array_elements(d.rows) r
   where d.key = 'price_book_item' and r ->> 'name' = 'Replace return fitting'),
  0, 'new shops get no Replace return fitting');
select * from finish();
rollback;
