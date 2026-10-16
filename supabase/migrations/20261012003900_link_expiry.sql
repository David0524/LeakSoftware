-- Customer links expire, and a shop can turn one off (owner, 2026-10-16: "How do we protect
-- customer data"). A report, quote, or invoice link works for 180 days; sending it again
-- after that makes a new link (the old one is turned off by the daily job, and sends reuse
-- only links that are still on). Anyone on the shop's team can turn a link off at once from
-- the job page, for a link sent to the wrong person or forwarded too far. The customer pages
-- already refuse expired and turned-off links.

alter table public.share_link alter column expires_at set default now() + interval '180 days';

-- Links from before: 180 days from when they were made.
update public.share_link set expires_at = created_at + interval '180 days'
where expires_at is null;

-- The daily job (/api/cron/daily): links past their date are turned off, so the next send
-- makes a new one instead of reusing a dead link.
create or replace function public.expire_share_links() returns integer
language sql security definer set search_path = public, pg_temp as $$
  with off as (
    update public.share_link set revoked_at = now()
    where revoked_at is null and expires_at is not null and expires_at <= now()
    returning 1
  )
  select count(*)::integer from off
$$;
revoke all on function public.expire_share_links() from public, anon, authenticated;
grant execute on function public.expire_share_links() to service_role;

-- The shop's team: turn a link off now.
create or replace function public.turn_off_share_link(link_id uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  co uuid;
begin
  select company_id into co from public.share_link where id = link_id;
  if co is null or not app.is_member(co) then
    raise exception 'Link not found' using errcode = 'no_data_found';
  end if;
  update public.share_link set revoked_at = coalesce(revoked_at, now()) where id = link_id;
end
$$;
revoke all on function public.turn_off_share_link(uuid) from public, anon;
grant execute on function public.turn_off_share_link(uuid) to authenticated;
