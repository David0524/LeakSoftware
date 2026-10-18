-- Warranties are gone (owner, 2026-10-18: "Remove warranties entirely"). Paid repairs no
-- longer make warranty records, and the table, its sync entry, and its policies go.
-- warranty_months stays on price book, quote, and invoice lines, unused, because phones
-- already installed still send it when they write a quote line; nothing shows it.

drop trigger if exists record_warranties on public.job;
drop function if exists app.record_warranties();
delete from app.sync_table where table_name = 'warranty';
drop table if exists public.warranty;
