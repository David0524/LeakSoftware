-- Texting registration details stay private (owner, 2026-11-28: "will the secure business
-- information be stored in the database, or how would that work?"). The audit trigger that
-- every synced table gets copied each registration, EIN included, into audit_log, which owners
-- and admins read. Registrations aren't shop work to audit (only the server writes them, and
-- Admin › Texting shows their progress), so they leave the audit log, and the copies made so
-- far go. The server also erases the EIN, keeping its last 4, once the number is approved.

drop trigger if exists audit_row on public.texting_registration;
delete from public.audit_log where table_name = 'texting_registration';
