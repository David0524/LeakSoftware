-- Who sees which jobs, part 2: server functions and stored files (follow-up named in
-- 20261012002300_job_visibility.sql and DECISIONS 2026-10-13).
--
-- With techs_see_all_jobs off, the row policies already hide other techs' jobs. But the
-- functions that prepare, send, or change a job's reports, quotes, and invoices are
-- SECURITY DEFINER and checked only that the caller belongs to the shop, so a tech who kept
-- a job's id could still act on it. Each of them now first checks that the caller can see
-- the job. The original function moves to the app schema (not reachable from the API) and a
-- wrapper with the same name and arguments takes its place, so callers don't change.
--
-- Photos, signatures, and PDFs live under {company}/{job}/... in the media and documents
-- buckets; a restrictive policy applies the same rule to them.

-- ---------------------------------------------------------------------------
-- The check
-- ---------------------------------------------------------------------------

/**
 * Raises "Job not found" when the caller belongs to the job's shop but may not see the job.
 * Anyone else (another shop, the service role, scheduled jobs) is left to the function's own
 * checks, which already refuse outsiders.
 */
create or replace function app.require_visible_job(target_job uuid) returns void
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  co uuid;
begin
  select company_id into co from public.job where id = target_job;
  if co is not null and app.is_member(co) and not app.job_visible(co, target_job) then
    raise exception 'Job not found' using errcode = 'insufficient_privilege';
  end if;
end
$$;

create or replace function app.require_visible_record(kind text, target uuid) returns void
language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare
  j uuid;
begin
  case kind
    when 'job' then j := target;
    when 'report' then select job_id into j from public.report where id = target;
    when 'quote' then select job_id into j from public.quote where id = target;
    when 'invoice' then select job_id into j from public.invoice where id = target;
  end case;
  if j is not null then
    perform app.require_visible_job(j);
  end if;
end
$$;
revoke all on function app.require_visible_job(uuid), app.require_visible_record(text, uuid) from public;

-- ---------------------------------------------------------------------------
-- Wrap the job functions
-- ---------------------------------------------------------------------------

do $do$
declare
  f record;
  fn regprocedure;
  args text;
  identity text;
  result text;
  call_args text;
  n int;
  role_name text;
  granted text[];
begin
  for f in select * from (values
      ('prepare_report(uuid,text)', 'job'),
      ('log_message(uuid,text,text,text,text,text,text)', 'job'),
      ('create_invoice(uuid)', 'job'),
      ('save_report_draft(uuid,jsonb,jsonb,text,text,jsonb)', 'report'),
      ('send_report(uuid,text)', 'report'),
      ('report_preview(uuid)', 'report'),
      ('send_quote(uuid)', 'quote'),
      ('send_invoice(uuid)', 'invoice'),
      ('void_invoice(uuid)', 'invoice'),
      ('record_invoice_payment(uuid,integer)', 'invoice'),
      ('invoice_mail_details(uuid)', 'invoice')
    ) as v(sig, kind)
  loop
    fn := ('public.' || f.sig)::regprocedure;
    select pg_get_function_arguments(fn), pg_get_function_identity_arguments(fn),
           pg_get_function_result(fn), pronargs
      into args, identity, result, n
      from pg_proc where oid = fn;
    -- Who could call it before, so the wrapper keeps the same grants.
    granted := array(select r from unnest(array['anon', 'authenticated', 'service_role']) r
                     where has_function_privilege(r, fn, 'execute'));
    call_args := (select string_agg('$' || i, ', ') from generate_series(1, n) i);

    execute format('alter function public.%s rename to %I',
                   f.sig, split_part(f.sig, '(', 1) || '_unchecked');
    execute format('alter function public.%s set schema app',
                   split_part(f.sig, '(', 1) || '_unchecked(' || split_part(f.sig, '(', 2));
    execute format('revoke all on function app.%I(%s) from public, anon, authenticated',
                   split_part(f.sig, '(', 1) || '_unchecked', identity);

    execute format($f$
      create function public.%1$I(%2$s) returns %3$s
      language plpgsql security definer set search_path = public, app, pg_temp as $body$
      begin
        perform app.require_visible_record(%4$L, $1);
        %5$s app.%6$I(%7$s);
      end
      $body$$f$,
      split_part(f.sig, '(', 1), args, result, f.kind,
      case when result = 'void' then 'perform' else 'return' end,
      split_part(f.sig, '(', 1) || '_unchecked', call_args);

    execute format('revoke all on function public.%I(%s) from public', split_part(f.sig, '(', 1), identity);
    foreach role_name in array granted loop
      execute format('grant execute on function public.%I(%s) to %I',
                     split_part(f.sig, '(', 1), identity, role_name);
    end loop;
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- Stored files under a job
-- ---------------------------------------------------------------------------

-- media/{company}/{job}/... and documents/{company}/{job}/...: the second folder is the job.
create or replace function app.object_job_visible(object_name text) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case
    when app.try_uuid((storage.foldername(object_name))[2]) is null then true
    else app.job_visible(app.object_company(object_name),
                         app.try_uuid((storage.foldername(object_name))[2]))
  end
$$;
revoke all on function app.object_job_visible(text) from public;
grant execute on function app.object_job_visible(text) to authenticated;

create policy job_files_visible on storage.objects as restrictive for select to authenticated
  using (bucket_id not in ('media', 'documents') or app.object_job_visible(name));
create policy job_files_visible_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('media', 'documents') or app.object_job_visible(name));
