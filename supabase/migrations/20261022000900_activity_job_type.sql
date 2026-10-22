-- Activity by job type (owner, 2026-10-22: "Add a filter on the jobs and activity pages for job
-- type"). activity_feed() takes the type the page chose ('detection', 'repair', 'maintenance',
-- 'inspection'); null keeps every event (All Types). With a type, only events about a job of
-- that type come back: a text from a customer is about a conversation, not a job, so it shows
-- only under All Types. The filter runs here, not on the page, so each page of 50 is a full
-- page and Show More keeps going.
--
-- The new argument has a default, so apps already installed (which send four) keep working.
-- Same body as 20261020000300_activity.sql otherwise.

drop function public.activity_feed(uuid, timestamptz, uuid, integer);

create function public.activity_feed(target_company uuid,
  before_at timestamptz default null, before_id uuid default null, page_size integer default 50,
  job_type text default null)
returns jsonb
language plpgsql stable security invoker set search_path = public, app, pg_temp as $$
declare
  n integer := least(greatest(coalesce(page_size, 50), 1), 100);
  only_type text := nullif(btrim(job_type), '');
  rows jsonb;
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this shop' using errcode = 'insufficient_privilege';
  end if;
  select coalesce(jsonb_agg(e order by e.created_at desc, e.id desc), '[]'::jsonb) into rows
  from (
    select a.id, a.kind, a.created_at, a.job_id, a.conversation_id, a.customer_name,
           a.job_number, a.amount_cents, a.scheduled_at, a.preview,
           coalesce(actor.full_name, actor.email) as actor_name,
           coalesce(assignee.full_name, assignee.email) as assignee_name
    from public.activity a
    left join public.profile actor on actor.id = a.actor_id
    left join public.profile assignee on assignee.id = a.assignee_id
    where a.company_id = target_company and a.deleted_at is null
      and (only_type is null
           or exists (select 1 from public.job j
                      where j.id = a.job_id and j.company_id = a.company_id
                        and j.type = only_type))
      and (before_at is null
           or (a.created_at, a.id) < (before_at, coalesce(before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by a.created_at desc, a.id desc
    limit n + 1
  ) e;
  return jsonb_build_object(
    'events', (select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
               from jsonb_array_elements(rows) with ordinality as t(x, ord) where ord <= n),
    'more', jsonb_array_length(rows) > n,
    'seen_at', (select activity_seen_at from public.profile where id = auth.uid()));
end
$$;

revoke all on function public.activity_feed(uuid, timestamptz, uuid, integer, text)
  from public, anon;
grant execute on function public.activity_feed(uuid, timestamptz, uuid, integer, text)
  to authenticated;
