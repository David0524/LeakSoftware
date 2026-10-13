-- Deleting a customer (owner request, 2026-10-13). Owners only, and only when nothing is
-- open: every job is paid or canceled and no invoice is waiting for money. The customer and
-- their pools are soft-deleted, so they leave every list and phone, while finished jobs,
-- sent reports, quotes, invoices, and payments keep their history.

create or replace function public.delete_customer(target_customer uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  c public.customer;
  open_jobs int;
  open_invoices int;
begin
  select * into c from public.customer where id = target_customer and deleted_at is null for update;
  if c.id is null or not app.is_member(c.company_id) then
    raise exception 'Customer not found' using errcode = 'insufficient_privilege';
  end if;
  if not app.is_owner(c.company_id) then
    raise exception 'Only owners can delete customers' using errcode = 'insufficient_privilege';
  end if;

  select count(*) into open_jobs from public.job j
  where j.deleted_at is null and j.status not in ('paid', 'canceled')
    and (j.bill_to_customer_id = c.id
         or j.property_id in (select id from public.property where customer_id = c.id));
  if open_jobs > 0 then
    raise exception '% has % open job%. Finish or cancel them first.',
      c.name, open_jobs, case when open_jobs = 1 then '' else 's' end
      using errcode = 'check_violation';
  end if;
  select count(*) into open_invoices from public.invoice i
  join public.job j on j.id = i.job_id
  where i.deleted_at is null and i.status in ('sent', 'partially_paid')
    and (j.bill_to_customer_id = c.id
         or j.property_id in (select id from public.property where customer_id = c.id));
  if open_invoices > 0 then
    raise exception '% still owes on an invoice. Record the payment or void it first.', c.name
      using errcode = 'check_violation';
  end if;

  update public.property set deleted_at = now()
  where customer_id = c.id and deleted_at is null;
  update public.customer set deleted_at = now() where id = c.id;
end
$$;

revoke all on function public.delete_customer(uuid) from public, anon;
grant execute on function public.delete_customer(uuid) to authenticated;
