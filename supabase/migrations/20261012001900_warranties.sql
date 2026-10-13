-- Warranties (M10, light): when a repair job is paid, each line of its accepted quote that
-- carries a warranty term becomes a warranty record, starting on the day it was paid (the
-- shop's time zone). The office sees active, expiring, and expired warranties.

create unique index warranty_line_once on public.warranty (repair_job_id, quote_line_item_id)
  where quote_line_item_id is not null;

create or replace function app.record_warranties() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  starts date;
begin
  if new.type <> 'repair' or new.status <> 'paid' or old.status = 'paid' then
    return new;
  end if;
  select (now() at time zone co.timezone)::date into starts
  from public.company co where co.id = new.company_id;
  insert into public.warranty (company_id, repair_job_id, quote_line_item_id, description,
                               starts_on, ends_on, terms)
  select new.company_id, new.id, l.id, l.description, starts,
         (starts + make_interval(months => l.warranty_months))::date,
         l.warranty_months || '-month warranty on parts and labor'
  from public.quote q
  join public.quote_line_item l on l.quote_id = q.id and l.deleted_at is null
  where q.repair_job_id = new.id and q.status = 'accepted' and q.deleted_at is null
    and coalesce(l.warranty_months, 0) > 0
  on conflict do nothing;
  return new;
end
$$;

create trigger record_warranties after update of status on public.job
  for each row execute function app.record_warranties();
