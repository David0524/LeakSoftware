-- Monthly billing (owner, 2026-11-15; 20261022003900_monthly_billing.sql): charges on visits
-- billed on the monthly invoice, each customer's invoice day, and what Monthly Billing shows.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a,
  (b ->> 'company')::uuid as cb, (b ->> 'customer')::uuid as cust_b,
  (b ->> 'property')::uuid as prop_b, (b ->> 'tech')::uuid as tech_b
  from fx;
grant select on ids to authenticated, anon, service_role;

create function pg_temp.item(company uuid, item_name text) returns uuid language sql as $$
  select id from price_book_item where company_id = company and name = item_name
    and deleted_at is null
$$;
grant execute on function pg_temp.item(uuid, text) to authenticated;

create function pg_temp.visit(company uuid, prop uuid, cust uuid, tech uuid, d date)
returns uuid language plpgsql as $$
declare
  j uuid;
begin
  insert into job (company_id, property_id, bill_to_customer_id, type, status, plan_date,
                   assigned_user_id)
  values (company, prop, cust, 'maintenance', 'in_progress', d, tech)
  returning id into j;
  update job set status = 'done', completed_at = (d + time '15:00') at time zone 'America/New_York'
  where id = j;
  return j;
end
$$;
create temp table v (name text primary key, id uuid);
insert into v select 'oct14', pg_temp.visit(ca, prop_a, cust_a, tech_a, '2026-10-14') from ids;
insert into v select 'oct28', pg_temp.visit(ca, prop_a, cust_a, tech_a, '2026-10-28') from ids;
insert into v select 'b_oct9', pg_temp.visit(cb, prop_b, cust_b, tech_b, '2027-03-09') from ids;
grant select on v to authenticated, anon, service_role;
create function pg_temp.vid(n text) returns uuid language sql as $$ select id from v where name = n $$;
grant execute on function pg_temp.vid(text) to authenticated, anon, service_role;

create function pg_temp.inv(cust uuid, m date) returns uuid language sql as $$
  select id from invoice where customer_id = cust and period_month = m
    and status <> 'void' and deleted_at is null
$$;
grant execute on function pg_temp.inv(uuid, date) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Techs add charges; the price book's price is the server's
-- ---------------------------------------------------------------------------

select tests.authenticate_as((select tech_a from ids));
create temp table x (name text primary key, id uuid);
grant all on x to authenticated;
insert into x values ('basket', gen_random_uuid()), ('custom', gen_random_uuid());
insert into visit_charge (id, company_id, job_id, price_book_item_id, name, quantity,
                          unit_price_cents)
  select (select id from x where name = 'basket'), ca, pg_temp.vid('oct14'),
         pg_temp.item(ca, 'Replace skimmer basket'), 'Replace skimmer basket', 1, 1
  from ids;
insert into visit_charge (id, company_id, job_id, name, quantity, unit_price_cents, taxable)
  select (select id from x where name = 'custom'), ca, pg_temp.vid('oct28'), 'Pump lid', 2, 1250,
         false
  from ids;
select is((select unit_price_cents from visit_charge where id = (select id from x where name = 'basket')),
  (select price_cents from price_book_item where id = pg_temp.item((select ca from ids), 'Replace skimmer basket')),
  'a price book charge takes the price book''s price, whatever was sent');
select is((select unit_price_cents from visit_charge where id = (select id from x where name = 'custom')),
  1250, 'a custom charge keeps the price typed');
select throws_ok($$ update visit_charge set billed_invoice_id = null $$, '42501', null,
  'techs can''t write the billing');
reset role;

select tests.authenticate_as((select tech_b from ids));
select is((select count(*) from visit_charge where job_id = pg_temp.vid('oct14')), 0::bigint,
  'another shop never sees them');
reset role;

-- ---------------------------------------------------------------------------
-- Billed on the month's invoice
-- ---------------------------------------------------------------------------

select tests.authenticate_as((select owner_a from ids));
select is(create_monthly_invoices((select ca from ids), '2026-10-01'), 1,
  'a customer whose only unbilled items are charges gets a draft');
reset role;
select results_eq($$
  select description, quantity, unit_price_cents, taxable from invoice_line_item
  where invoice_id = pg_temp.inv((select cust_a from ids), '2026-10-01') and deleted_at is null
  order by sort_order $$,
  $$ select 'Replace skimmer basket, Oct 14'::text, 1.00::numeric, price_cents, taxable
     from price_book_item where id = pg_temp.item((select ca from ids), 'Replace skimmer basket')
     union all select 'Pump lid, Oct 28', 2.00, 1250, false $$,
  'each charge is its own line, with its visit''s day');

-- Added after the draft was made: it joins the draft at once; changes follow.
select tests.authenticate_as((select tech_a from ids));
insert into x values ('late', gen_random_uuid());
insert into visit_charge (id, company_id, job_id, name, unit_price_cents)
  select (select id from x where name = 'late'), ca, pg_temp.vid('oct28'), 'Salt cell clean', 4500
  from ids;
update visit_charge set quantity = 3 where id = (select id from x where name = 'custom');
update visit_charge set deleted_at = now() where id = (select id from x where name = 'basket');
reset role;
select results_eq($$
  select description, quantity from invoice_line_item
  where invoice_id = pg_temp.inv((select cust_a from ids), '2026-10-01') and deleted_at is null
  order by sort_order $$,
  $$ values ('Pump lid, Oct 28'::text, 3.00::numeric), ('Salt cell clean, Oct 28', 1.00) $$,
  'a charge added to a drafted visit joins the draft; changed and removed charges follow');

-- Monthly Billing shows it.
select tests.authenticate_as((select owner_a from ids));
select is((select jsonb_array_length(month_billing((select ca from ids), '2026-10-01') -> 'invoices')),
  1, 'the month''s page lists the draft');
select is((select (i ->> 'total_cents')::int from jsonb_array_elements(
             month_billing((select ca from ids), '2026-10-01') -> 'invoices') i),
  3 * 1250 + 4500, 'with its total');
select is((select (m ->> 'drafts')::int from jsonb_array_elements(billing_months((select ca from ids))) m
           where m ->> 'month' = '2026-10-01'), 1, 'Monthly Billing counts the drafts to send');
reset role;
select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select month_billing((select ca from ids), '2026-10-01') $$, '42501', null,
  'techs don''t bill the month');
select is(billing_months((select ca from ids)), '[]'::jsonb, 'or see Monthly Billing');
reset role;

-- Sent: final. Voiding frees them.
select tests.authenticate_as((select owner_a from ids));
select send_invoice(pg_temp.inv((select cust_a from ids), '2026-10-01'));
reset role;
select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ update visit_charge set quantity = 1 where id = (select id from x where name = 'custom') $$,
  '23514', 'This charge is on a sent invoice. Change the invoice instead.',
  'a charge on a sent invoice can''t change');
reset role;
select tests.authenticate_as((select owner_a from ids));
select void_invoice(pg_temp.inv((select cust_a from ids), '2026-10-01'));
reset role;
select is((select count(*) from visit_charge where job_id = pg_temp.vid('oct28')
           and billed_invoice_id is null and deleted_at is null), 2::bigint,
  'voiding the invoice frees its charges');

-- ---------------------------------------------------------------------------
-- Invoice day
-- ---------------------------------------------------------------------------

select is(app.customer_invoice_day((select cb from ids), (select cust_b from ids)), 1,
  'the shop''s day is the 1st unless set');
update company set settings = settings || '{"invoice_day": 5}' where id = (select cb from ids);
select is(app.customer_invoice_day((select cb from ids), (select cust_b from ids)), 5,
  'the shop sets its day');
update service_plan set invoice_day = 15 where customer_id = (select cust_b from ids);
select is(app.customer_bill_date((select cb from ids), (select cust_b from ids), '2027-03-01'),
  '2027-04-15'::date, 'a plan''s own day wins: March bills on April 15');
select throws_ok($$ update service_plan set invoice_day = 31 $$, '23514', null,
  'days run 1 to 28');

insert into visit_charge (company_id, job_id, name, unit_price_cents, added_by)
  select cb, pg_temp.vid('b_oct9'), 'Filter clean', 9500, tech_b from ids;
select bill_maintenance_due('2027-04-02 18:00Z');
select is(pg_temp.inv((select cust_b from ids), '2027-03-01'), null,
  'the daily run waits for the customer''s invoice day');
select tests.authenticate_as((select (b ->> 'owner')::uuid from fx));
select is((select (w -> 0 ->> 'customers')::int from (select month_billing((select cb from ids),
            '2027-03-01') -> 'waiting' as w) s),
  1, 'Monthly Billing says who waits for their day');
reset role;
select bill_maintenance_due('2027-04-15 18:00Z');
select isnt(pg_temp.inv((select cust_b from ids), '2027-03-01'), null,
  'and drafts it on the day');

-- New Job's plan takes a day.
select tests.authenticate_as((select (b ->> 'owner')::uuid from fx));
create temp table np as select create_service_plan(
    (select cb from ids), null, (select cust_b from ids), null, (select prop_b from ids),
    '{"starts_on": "2026-12-01", "invoice_day": 10, "price_cents": 15000}') ->> 'plan' as id;
select is((select invoice_day from service_plan where id = (select id::uuid from np)),
  10::smallint, 'New Job saves the plan''s invoice day');
reset role;

select * from finish();
rollback;
