-- New shops' Salt cell clean is $45 (owner, 2026-10-27: Cole's prices).
begin;
set search_path = public, extensions;
select plan(1);
select is(
  (select (r ->> 'price_cents')::int from app.config_default d, jsonb_array_elements(d.rows) r
   where d.key = 'price_book_item' and r ->> 'name' = 'Salt cell clean'),
  4500, 'new shops price Salt cell clean at $45');
select * from finish();
rollback;
