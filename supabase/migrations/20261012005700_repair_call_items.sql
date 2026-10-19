-- "When They Call" for repairs (owner, 2026-10-19: "We need a 'when they call' for repair.
-- Include drop down menu tied to price book. Owner option of what shows up.").
--
-- New Job › Repair asks what the customer needs from a menu of price book items, which fills
-- in the price. The owner picks which items are on that menu (Settings › Price Book, "Show in
-- When They Call"); with none picked, every active item is.

alter table public.price_book_item add column on_repair_call boolean not null default false;

-- Access: as the registry generates it (20261012000600_access.sql).
update app.sync_table
set insert_columns = insert_columns || '{on_repair_call}',
    update_columns = update_columns || '{on_repair_call}'
where table_name = 'price_book_item';
grant insert (on_repair_call), update (on_repair_call) on public.price_book_item to authenticated;
