-- Monthly invoices that send themselves on the invoice day (owner, 2026-11-16;
-- 20261022004000_auto_send_invoices.sql): off by default, only from the day it was switched on,
-- each draft handed out once, and the server can send it.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated, anon, service_role;

-- A finished March visit with a charge, drafted for March.
create temp table v as
  with j as (
    insert into job (company_id, property_id, bill_to_customer_id, type, status, plan_date,
                     assigned_user_id)
    select ca, prop_a, cust_a, 'maintenance', 'in_progress', '2027-03-09', tech_a from ids
    returning id)
  select id from j;
grant select on v to authenticated, anon, service_role;
update job set status = 'done', completed_at = '2027-03-09 20:00Z' where id = (select id from v);
insert into visit_charge (company_id, job_id, name, unit_price_cents, added_by)
  select ca, (select id from v), 'Filter clean', 9500, tech_a from ids;
select app.bill_maintenance_month((select ca from ids), '2027-03-01');
create temp view inv as select id from invoice where customer_id = (select cust_a from ids)
  and period_month = '2027-03-01' and status <> 'void' and deleted_at is null;
grant select on inv to authenticated, anon, service_role;
select isnt((select id from inv), null, 'March is drafted');

select is((select count(*) from monthly_invoices_to_send('2027-04-02 18:00Z')), 0::bigint,
  'off by default: nothing goes by itself');

-- Switched on after the invoice day: that draft waits for the office.
update company set settings = settings
  || '{"send_monthly_invoices": true, "send_monthly_invoices_from": "2027-04-05"}'
  where id = (select ca from ids);
select is((select count(*) from monthly_invoices_to_send('2027-04-06 18:00Z')), 0::bigint,
  'switching it on never sends drafts whose day had already passed');

-- Switched on before the day: it goes on the day, once.
update company set settings = settings || '{"send_monthly_invoices_from": "2027-03-20"}'
  where id = (select ca from ids);
select is((select count(*) from monthly_invoices_to_send('2027-03-31 18:00Z')), 0::bigint,
  'not before the invoice day');
select is((select invoice_id from monthly_invoices_to_send('2027-04-01 18:00Z')),
  (select id from inv), 'on the invoice day, the draft is handed out to send');
select is((select count(*) from monthly_invoices_to_send('2027-04-01 19:00Z')), 0::bigint,
  'once');

-- The server can send it (it acts for the shop).
set local role service_role;
select record_auto_send((select id from inv), 'No email or mobile number');
select is((send_invoice((select id from inv)) ->> 'status'), 'sent', 'the server sends it');
select record_auto_send((select id from inv), 'Too late');
reset role;
select is((select status from invoice where id = (select id from inv)), 'sent', 'and it''s sent');

-- Only the server hands them out.
select tests.authenticate_as((select owner_a from ids));
select throws_ok($$ select * from monthly_invoices_to_send() $$, '42501', null,
  'people can''t ask for the list');
reset role;

select * from finish();
rollback;
