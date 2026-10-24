-- The database functions the apps call (security definer, so row security doesn't filter
-- them) refuse another shop's ids, or answer with nothing (security review, 2026-10-25).
-- 010_tenant_isolation covers tables; this covers the functions that take a shop's or a
-- record's id from the caller.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp table calls (stmt text, nothing text);
grant select on calls to authenticated;

-- %1$L company, %2$L job, %3$L customer, %4$L invoice, %5$L report, %6$L quote: all shop A's.
-- `nothing` is the answer that gives nothing away, for functions that answer instead of refusing.
insert into calls values
  ('select activity_feed(%1$L::uuid, null, null, 10, null)::text', null),
  ('select activity_unread(%1$L::uuid)::text', 'false'),
  ('select add_package_defaults(%1$L::uuid, ''pool'')::text', null),
  ('select cached_drive_times(%1$L::uuid, array[''x''], array[''y''])::text', null),
  ('select company_access(%1$L::uuid)::text', null),
  ('select create_invite(%1$L::uuid, ''someone@example.com'', ''owner'')::text', null),
  ('select create_invoice(%2$L::uuid)::text', null),
  ('select create_monthly_invoices(%1$L::uuid, date ''2026-10-01'')::text', null),
  ('select (customer_counts(%1$L::uuid, null) ->> ''all'')', '0'),
  ('select delete_customer(%3$L::uuid)::text', null),
  ('select delete_sample_job(%2$L::uuid)::text', 'false'),
  ('select email_audience_count(%1$L::uuid, ''{}''::jsonb)::text', null),
  ('select email_campaign_setup(%1$L::uuid)::text', null),
  ('select import_customers(%1$L::uuid, ''[]''::jsonb)::text', null),
  ('select invoice_mail_details(%4$L::uuid)::text', null),
  ('select log_message(%2$L::uuid, ''email'', ''x@example.com'', ''report'', ''sent'', null, null)::text', null),
  ('select mapbox_take(%1$L::uuid, ''geocode_temp'', 1)::text', null),
  ('select owner_dashboard(%1$L::uuid, 3)::text', null),
  ('select prepare_report(%2$L::uuid, ''homeowner'')::text', null),
  ('select record_invoice_payment(%4$L::uuid, 100, ''cash'', null)::text', null),
  ('select redeem_access_code(%1$L::uuid, ''VIP26'')::text', null),
  ('select coalesce(report_preview(%5$L::uuid)::text, ''null'')', 'null'),
  ('select routing_use(%1$L::uuid, ''map'', 1, 100)::text', null),
  ('select save_drive_times(%1$L::uuid, ''[]''::jsonb)::text', null),
  ('select save_report_draft(%5$L::uuid, ''{}''::jsonb, ''{}''::jsonb, ''m'', ''p'', ''[]''::jsonb)::text', null),
  ('select save_route_legs(%1$L::uuid, ''mapbox'', ''[]''::jsonb)::text', null),
  ('select search_candidates(%1$L::uuid, array[''Customer''], null)::text', null),
  ('select send_invoice(%4$L::uuid)::text', null),
  ('select send_quote(%6$L::uuid)::text', null),
  ('select send_report(%5$L::uuid, ''away'')::text', null),
  ('select send_visit_report(%2$L::uuid, false)::text', null),
  ('select set_next_job_number(%1$L::uuid, 5000)::text', null),
  ('select start_email_campaign(%1$L::uuid, ''s'', ''b'', ''{}''::jsonb, 1)::text', null),
  ('select unbilled_maintenance(%1$L::uuid)::text', '[]'),
  ('select void_invoice(%4$L::uuid)::text', null);

-- Shop B's owner, and the same for B's tech, call each with shop A's ids.
create function pg_temp.answer(who uuid, stmt text) returns text language plpgsql as $$
declare
  a jsonb := (select fx.a from fx);
  r text;
begin
  perform tests.authenticate_as(who);
  execute format(stmt, a ->> 'company', a ->> 'job', a ->> 'customer', a ->> 'invoice',
                 a ->> 'report', a ->> 'quote') into r;
  reset role;
  return coalesce(r, 'null');
exception when others then
  reset role;
  return 'refused';
end
$$;

select is(pg_temp.answer(((select b from fx) ->> who)::uuid, c.stmt),
          coalesce(c.nothing, 'refused'),
          format('shop B''s %s: %s', who, split_part(c.stmt, '(', 1)))
from calls c cross join (values ('owner'), ('tech')) w(who);

-- Nothing of shop A changed.
select is((select status from invoice where id = ((select a from fx) ->> 'invoice')::uuid), 'draft',
  'shop A''s invoice was not sent');
select is((select count(*) from invite where company_id = ((select a from fx) ->> 'company')::uuid
                                        and email = 'someone@example.com'),
  0::bigint, 'no invite was made for shop A');

select * from finish();
rollback;
