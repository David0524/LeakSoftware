-- Who sees which jobs (owner request, 2026-10-13: "a way for the owner to toggle whether or
-- not employees can see other's schedules and jobs that are not assigned to them").
--
-- company.settings.techs_see_all_jobs: true (the default, as before) lets every member see
-- every job. false limits techs to jobs where they are the tech or the second tech, and to
-- everything under those jobs (checklist, tests, findings, photos, reports, quotes,
-- invoices, signatures, messages, links, payments, warranties). Owners always see all.
-- Customers and pools stay visible to the whole team.
--
-- Enforced with restrictive policies, which narrow the generated ones (20261012000600):
-- the website and phone sync both read through them. Phones also re-pull everything when a
-- tech's view changes (sync_scope below), so jobs taken away from them leave the phone.

-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------

create or replace function app.sees_all_jobs(target_company uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.is_owner(target_company)
      or coalesce((select (c.settings ->> 'techs_see_all_jobs')::boolean
                   from public.company c where c.id = target_company), true)
$$;

/** A job row: everyone when the shop allows it, else its tech and second tech. */
create or replace function app.job_row_visible(target_company uuid, tech uuid, second uuid)
returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.sees_all_jobs(target_company) or auth.uid() = tech or auth.uid() = second
$$;

/** A row under a job (by the job's id). */
create or replace function app.job_visible(target_company uuid, target_job uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.sees_all_jobs(target_company)
      or exists (select 1 from public.job j
                 where j.id = target_job
                   and (j.assigned_user_id = auth.uid() or j.second_tech_id = auth.uid()))
$$;

/** A row tied to a job directly, or through a quote or an invoice. */
create or replace function app.linked_job_visible(target_company uuid, target_job uuid,
                                                  target_quote uuid, target_invoice uuid)
returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.sees_all_jobs(target_company)
      or app.job_visible(target_company, coalesce(
           target_job,
           (select q.job_id from public.quote q where q.id = target_quote),
           (select i.job_id from public.invoice i where i.id = target_invoice)))
$$;

revoke all on function app.sees_all_jobs(uuid), app.job_row_visible(uuid, uuid, uuid),
  app.job_visible(uuid, uuid), app.linked_job_visible(uuid, uuid, uuid, uuid) from public;
grant execute on function app.sees_all_jobs(uuid), app.job_row_visible(uuid, uuid, uuid),
  app.job_visible(uuid, uuid), app.linked_job_visible(uuid, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Restrictive policies (AND-ed with the generated member policies)
-- ---------------------------------------------------------------------------

create policy job_visible on public.job as restrictive for all to authenticated
  using (app.job_row_visible(company_id, assigned_user_id, second_tech_id))
  with check (app.job_row_visible(company_id, assigned_user_id, second_tech_id));

do $$
declare
  t text;
begin
  foreach t in array array['job_component', 'checklist_item_result', 'test_result', 'finding',
                           'report', 'quote', 'invoice', 'media', 'signature', 'share_link'] loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (app.job_visible(company_id, job_id)) with check (app.job_visible(company_id, job_id))',
      t || '_job_visible', t);
  end loop;
end
$$;

create policy quote_line_item_job_visible on public.quote_line_item
  as restrictive for all to authenticated
  using (app.linked_job_visible(company_id, null, quote_id, null))
  with check (app.linked_job_visible(company_id, null, quote_id, null));

create policy invoice_line_item_job_visible on public.invoice_line_item
  as restrictive for all to authenticated
  using (app.linked_job_visible(company_id, null, null, invoice_id))
  with check (app.linked_job_visible(company_id, null, null, invoice_id));

create policy payment_job_visible on public.payment as restrictive for all to authenticated
  using (app.linked_job_visible(company_id, null, quote_id, invoice_id));

create policy message_job_visible on public.message as restrictive for all to authenticated
  using (app.linked_job_visible(company_id, job_id, quote_id, invoice_id))
  with check (app.linked_job_visible(company_id, job_id, quote_id, invoice_id));

create policy warranty_job_visible on public.warranty as restrictive for all to authenticated
  using (app.job_visible(company_id, repair_job_id));

-- ---------------------------------------------------------------------------
-- Phones: when what a tech may see changes, start their sync over
-- ---------------------------------------------------------------------------

-- Bumped when the setting changes or a job changes hands, for shops that limit techs.
create table app.visibility_epoch (
  company_id uuid primary key references public.company (id) on delete cascade,
  epoch bigint not null default 0
);

create or replace function app.bump_visibility_epoch(target_company uuid) returns void
language sql security definer set search_path = public, app, pg_temp as $$
  insert into app.visibility_epoch (company_id, epoch) values (target_company, 1)
  on conflict (company_id) do update set epoch = visibility_epoch.epoch + 1
$$;

create or replace function app.job_hands_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.assigned_user_id is distinct from old.assigned_user_id
     or new.second_tech_id is distinct from old.second_tech_id then
    perform app.bump_visibility_epoch(new.company_id);
  end if;
  return new;
end
$$;

create trigger job_hands_changed after update of assigned_user_id, second_tech_id
  on public.job for each row execute function app.job_hands_changed();

create or replace function app.visibility_setting_changed() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if (new.settings -> 'techs_see_all_jobs') is distinct from (old.settings -> 'techs_see_all_jobs') then
    perform app.bump_visibility_epoch(new.id);
  end if;
  return new;
end
$$;

create trigger visibility_setting_changed after update of settings
  on public.company for each row execute function app.visibility_setting_changed();

-- What this user may see, across their shops: "all" where they see every job, otherwise
-- the shop's epoch. The phone compares it with the last pull; a change means start over.
create or replace function public.sync_scope() returns text
language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce(string_agg(
           m.company_id::text || ':' ||
           case when app.sees_all_jobs(m.company_id) then 'all'
                else 'own' || coalesce((select e.epoch from app.visibility_epoch e
                                        where e.company_id = m.company_id), 0)::text end,
           ',' order by m.company_id), '')
  from public.membership m
  where m.user_id = auth.uid() and m.status = 'active' and m.deleted_at is null
$$;

revoke all on function public.sync_scope() from public, anon;
grant execute on function public.sync_scope() to authenticated;
