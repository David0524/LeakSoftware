-- Link previews (owner, 2026-10-24): what Messages, Mail and Slack may show for a quote, invoice
-- or report link. Nothing is counted as a view, a sent report's preview is its snapshot, and a
-- link that stopped working gives only the shop's name.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'job')::uuid as job_a, (a ->> 'report')::uuid as rep_a,
  (a ->> 'quote')::uuid as quote_a, (a ->> 'invoice')::uuid as inv_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated, anon, service_role;

update company set name = 'Blue Wave Pools', logo_path = (select ca from ids) || '/logo.png',
                   timezone = 'America/New_York'
where id = (select ca from ids);
update property set city = 'Tampa', state = 'FL', postal_code = '33601'
where id = (select prop_a from ids);

-- A sent report, frozen with the shop and customer as they were.
update report set status = 'sent', sent_at = '2026-10-24 15:00Z', data_snapshot = jsonb_build_object(
    'company', jsonb_build_object('name', 'Blue Wave Pools', 'logo_path', 'frozen/logo.png',
                                  'brand_primary', '#1F6FAE', 'timezone', 'America/New_York',
                                  'phone', '(813) 555-0100', 'email', 'office@bluewave.test'),
    'customer', jsonb_build_object('name', 'Dana Ruiz', 'phone', '(813) 555-0199',
                                   'email', 'dana@example.com'),
    'property', jsonb_build_object('address', '123 Palm Ave, Tampa, FL 33601'),
    'job', jsonb_build_object('type', 'leak_detection', 'completed_at', '2026-10-23 18:00Z'))
where id = (select rep_a from ids);
update quote set status = 'sent', sent_at = now(), valid_until = current_date + 30
where id = (select quote_a from ids);
set local app.invoice_server = 'on';
update invoice set status = 'sent', sent_at = now(), due_date = current_date + 14
where id = (select inv_a from ids);
set local app.invoice_server = 'off';

create temp table link on commit drop as
select 'report' as k, token from share_link where report_id = (select rep_a from ids);
insert into share_link (company_id, job_id, quote_id)
  select ca, job_a, quote_a from ids;
insert into share_link (company_id, job_id, invoice_id)
  select ca, job_a, inv_a from ids;
insert into link select 'quote', token from share_link where quote_id = (select quote_a from ids);
insert into link select 'invoice', token from share_link where invoice_id = (select inv_a from ids);
grant select on link to anon, authenticated;
create temp table seen on commit drop as select id, view_count from share_link
  where company_id = (select ca from ids);
grant select on seen to anon;

-- Signed out, as the preview fetcher is.
set local role anon;
select is(link_preview_for_token('nope'), null, 'an unknown link previews nothing');

select is(link_preview_for_token((select token from link where k = 'report')) ->> 'kind', 'report',
  'a report link previews a report');
select is(link_preview_for_token((select token from link where k = 'report')) ->> 'customer', 'Dana Ruiz',
  'with the customer as sent');
select is(link_preview_for_token((select token from link where k = 'report')) ->> 'address',
  '123 Palm Ave, Tampa, FL 33601', 'the pool''s address as sent');
select is(link_preview_for_token((select token from link where k = 'report')) ->> 'logo_path', 'frozen/logo.png',
  'and the logo it was sent with');
select is(link_preview_for_token((select token from link where k = 'report')) ->> 'visit_at',
  '2026-10-23 18:00Z', 'the day of the work');

select is(link_preview_for_token((select token from link where k = 'quote')) ->> 'total_cents', '18500',
  'a quote shows its total');
select is(link_preview_for_token((select token from link where k = 'quote')) ->> 'customer', 'Customer a',
  'and who it''s for, as the page does');
select is(link_preview_for_token((select token from link where k = 'quote')) ->> 'address',
  '1 Test St, Tampa, FL 33601', 'and the property');
select is(link_preview_for_token((select token from link where k = 'invoice')) ->> 'balance_cents', '18500',
  'an invoice shows what is still owed');
select is(link_preview_for_token((select token from link where k = 'invoice')) ->> 'due_date',
  (current_date + 14)::text, 'and when it''s due');

-- Never a phone number, an email or a line.
select ok(not exists (
    select 1 from link,
      lateral jsonb_each_text(link_preview_for_token(link.token)) e
    where e.value like '%555-01%' or e.value like '%@%' or e.key in ('lines', 'payments', 'notes')),
  'no phone numbers, emails or line items');
select ok(not exists (select 1 from link, lateral jsonb_object_keys(link_preview_for_token(link.token)) f(name)
                      where f.name in ('phone', 'email', 'lines', 'notes', 'payments', 'company_id', 'job_id')),
  'only the fields the preview shows');
reset role;
select results_eq(
  $$ select id, view_count from share_link where company_id = (select ca from ids) order by id $$,
  $$ select id, view_count from seen order by id $$,
  'previews never count as a view');

-- Later edits never change a sent report's preview.
update customer set name = 'Someone Else' where id = (select cust_a from ids);
update company set name = 'New Name Pools' where id = (select ca from ids);
select is(link_preview_for_token((select token from link where k = 'report')) ->> 'customer', 'Dana Ruiz',
  'a renamed customer leaves the sent report''s preview alone');
select is(link_preview_for_token((select token from link where k = 'report')) ->> 'shop', 'Blue Wave Pools',
  'and so does a renamed shop');
select is(link_preview_for_token((select token from link where k = 'quote')) ->> 'customer', 'Someone Else',
  'a quote shows the customer as its page does today');

-- Past its good-through day, a quote reads expired, like its page.
set local app.quote_server = 'on';
-- Yesterday in the shop's own time zone (New York), not UTC's: from 8 PM to midnight the two differ.
update quote set valid_until = (now() at time zone 'America/New_York')::date - 1
where id = (select quote_a from ids);
select is(link_preview_for_token((select token from link where k = 'quote')) ->> 'status', 'expired',
  'an out-of-date quote is expired');

-- A link that stopped working: the shop's name and nothing else.
update share_link set expires_at = now() - interval '1 minute'
where token = (select token from link where k = 'invoice');
select is(link_preview_for_token((select token from link where k = 'invoice')),
  jsonb_build_object('kind', 'invoice', 'live', false, 'shop', 'New Name Pools'),
  'an expired link previews only the shop');
update share_link set revoked_at = now() where token = (select token from link where k = 'report');
select is(link_preview_for_token((select token from link where k = 'report')),
  jsonb_build_object('kind', 'report', 'live', false, 'shop', 'New Name Pools'),
  'so does a link the shop turned off');
update quote set deleted_at = now() where id = (select quote_a from ids);
select is(link_preview_for_token((select token from link where k = 'quote')) ->> 'live', 'false',
  'and one whose quote was deleted');
update share_link set deleted_at = now() where token = (select token from link where k = 'quote');
select is(link_preview_for_token((select token from link where k = 'quote')), null,
  'a deleted link previews nothing');

select * from finish();
rollback;
