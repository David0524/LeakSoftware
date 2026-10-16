-- Techs limited to their own jobs see only their own customers' conversations (security
-- review 2026-10-16: "with 'techs see only their own jobs', techs still see every
-- conversation"). A limited tech sees a conversation, and its texts and calls, when the
-- conversation's customer has a job they're on (as the tech or second tech). Conversations
-- from numbers that aren't a customer stay with the office. Owners, and techs in shops that
-- don't limit them, see every conversation as before. Restrictive policies, AND-ed with the
-- member policies; the per-row check only runs for limited techs (as in
-- 20261012003200_fast_row_security.sql). A job changing hands already restarts the phones'
-- sync (20261012002300), which brings their conversations up to date.

create or replace function app.customer_on_my_jobs(target_company uuid, target_customer uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  -- A job's customer: who it's billed to, or the pool's owner.
  select target_customer is not null and exists (
    select 1 from public.job j
    left join public.property p on p.id = j.property_id
    where j.company_id = target_company
      and (j.bill_to_customer_id = target_customer or p.customer_id = target_customer)
      and j.deleted_at is null
      and (j.assigned_user_id = auth.uid() or j.second_tech_id = auth.uid())
  )
$$;

create or replace function app.conversation_on_my_jobs(target_company uuid, target_conversation uuid)
returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from public.conversation c
    where c.id = target_conversation and c.company_id = target_company
      and app.customer_on_my_jobs(target_company, c.customer_id)
  )
$$;

revoke all on function app.customer_on_my_jobs(uuid, uuid), app.conversation_on_my_jobs(uuid, uuid)
  from public;
grant execute on function app.customer_on_my_jobs(uuid, uuid), app.conversation_on_my_jobs(uuid, uuid)
  to authenticated;

create policy conversation_job_visible on public.conversation as restrictive for all to authenticated
  using (company_id = any ((select app.all_jobs_companies())::uuid[])
         or app.customer_on_my_jobs(company_id, customer_id))
  with check (company_id = any ((select app.all_jobs_companies())::uuid[])
              or app.customer_on_my_jobs(company_id, customer_id));

create policy text_message_job_visible on public.text_message as restrictive for all to authenticated
  using (company_id = any ((select app.all_jobs_companies())::uuid[])
         or app.conversation_on_my_jobs(company_id, conversation_id))
  with check (company_id = any ((select app.all_jobs_companies())::uuid[])
              or app.conversation_on_my_jobs(company_id, conversation_id));

create policy call_log_job_visible on public.call_log as restrictive for all to authenticated
  using (company_id = any ((select app.all_jobs_companies())::uuid[])
         or app.conversation_on_my_jobs(company_id, conversation_id))
  with check (company_id = any ((select app.all_jobs_companies())::uuid[])
              or app.conversation_on_my_jobs(company_id, conversation_id));
