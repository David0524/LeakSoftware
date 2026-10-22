-- The shop's logo on the customer's quote and invoice (owner, 2026-10-22: "The company's own
-- logo should be on the report, invoice, and quote").
--
-- The customer pages (/q/<token>, /i/<token>) are signed out and sign the logo with the anon
-- key. Until now app.shared_object let anon read a logo only when a live report link froze it
-- in its snapshot, so a quote or invoice showed the logo only by chance (a report link of the
-- same shop with the same logo). Now a live quote or invoice link opens the shop's current
-- logo too: those pages show the company as it is today (quote_for_token, invoice_for_token).
-- Logos stay private otherwise: no link, no read.

create or replace function app.shared_object(bucket text, object_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.share_link sl
    join public.report r on r.id = sl.report_id
    where sl.revoked_at is null and sl.deleted_at is null
      and (sl.expires_at is null or sl.expires_at > now())
      and r.status in ('sent', 'superseded') and r.deleted_at is null
      and r.company_id = app.object_company(object_name)
      and case bucket
        when 'media' then
          r.data_snapshot -> 'media' @> jsonb_build_array(jsonb_build_object('storage_path', object_name))
          or r.data_snapshot -> 'signatures' @> jsonb_build_array(jsonb_build_object('image_path', object_name))
        when 'company-assets' then r.data_snapshot -> 'company' ->> 'logo_path' = object_name
        when 'documents' then object_name = r.company_id || '/' || r.job_id || '/report-' || r.id || '.pdf'
        else false
      end
  )
  or (bucket = 'company-assets' and exists (
    select 1
    from public.company co
    join public.share_link sl on sl.company_id = co.id
    left join public.quote q on q.id = sl.quote_id
    left join public.invoice i on i.id = sl.invoice_id
    where co.id = app.object_company(object_name)
      and co.logo_path = object_name
      and sl.revoked_at is null and sl.deleted_at is null
      and (sl.expires_at is null or sl.expires_at > now())
      and ((q.id is not null and q.status <> 'draft' and q.deleted_at is null)
        or (i.id is not null and i.status <> 'draft' and i.deleted_at is null))
  ))
$$;
revoke all on function app.shared_object(text, text) from public;
grant execute on function app.shared_object(text, text) to anon, authenticated;
