-- The product is now Sundeck Pro (owner, 2026-10-18: "new brand name is Sundeck Pro - update
-- everything accordingly"). The read-only lock's message names it
-- (20261012002100_billing.sql); everything else is the same.

create or replace function app.guard_writable() returns trigger
language plpgsql as $$
declare
  co uuid;
begin
  -- Only signed-in members (directly or through their RPCs) are held to it.
  if auth.uid() is null or coalesce(current_setting('role', true), '') <> 'authenticated' then
    return coalesce(new, old);
  end if;
  co := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  if app.company_locked(co) then
    raise exception 'This shop is read-only until its Sundeck Pro subscription is paid. Nothing has been deleted.'
      using errcode = 'TL423';
  end if;
  return coalesce(new, old);
end
$$;
