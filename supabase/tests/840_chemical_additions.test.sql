-- Added chemicals (owner, 2026-10-24; 20261022003000_chemical_additions.sql and
-- 20261022003100_monthly_visit_reports.sql): techs record what they add, the server sets the
-- price, shops that charge bill the month's chemicals one line per chemical, sent invoices never
-- change, the visit report keeps what was added, and Monthly shops send one report a month with
-- the invoice (or on its own when there's no invoice).
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

create function pg_temp.item(item_name text) returns uuid language sql as $$
  select id from price_book_item where company_id = (select ca from ids) and name = item_name
    and deleted_at is null
$$;
grant execute on function pg_temp.item(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The price book
-- ---------------------------------------------------------------------------

select results_eq($$
  select name, unit, price_cents, chemical from price_book_item
  where company_id = (select ca from ids) and category = 'Chemicals' and deleted_at is null
  order by sort_order $$,
  $$ values ('Liquid chlorine'::text, 'gal'::text, 800, 'liquid_chlorine'::text),
            ('Muriatic acid', 'gal', 1500, 'muriatic_acid'),
            ('Chlorine tabs (3″)', 'tab', 250, 'tabs'),
            ('Shock (cal-hypo)', 'lb', 600, 'cal_hypo'),
            ('Dry acid', 'lb', 500, 'dry_acid'),
            ('Stabilizer (CYA)', 'lb', 900, 'stabilizer'),
            ('Salt, 40 lb bag', 'bag', 1800, 'salt'),
            ('Baking soda', 'lb', 300, 'baking_soda'),
            ('Soda ash', 'lb', 400, 'soda_ash'),
            ('Calcium chloride', 'lb', 400, 'calcium_chloride'),
            ('Phosphate remover', 'each', 3500, 'phosphate_remover'),
            ('Algaecide', 'qt', 1500, 'algaecide'),
            ('Clarifier', 'qt', 1500, 'clarifier'),
            ('Enzyme', 'qt', 1800, 'enzyme') $$,
  'a pool shop''s chemicals, each with the calculator chemical it is');

-- A shop that edited a default keeps its edit when the defaults run again.
update price_book_item set price_cents = 950 where id = pg_temp.item('Liquid chlorine');
select app.add_chemical_defaults((select ca from ids));
select is((select price_cents from price_book_item where id = pg_temp.item('Liquid chlorine')), 950,
  'adding the defaults again never touches a shop''s price');
update price_book_item set price_cents = 800 where id = pg_temp.item('Liquid chlorine');

-- ---------------------------------------------------------------------------
-- Techs record, the server prices
-- ---------------------------------------------------------------------------

create function pg_temp.visit(d date, finish boolean default true) returns uuid
language plpgsql as $$
declare
  j uuid;
begin
  insert into job (company_id, property_id, bill_to_customer_id, type, status, plan_date,
                   assigned_user_id)
  values ((select ca from ids), (select prop_a from ids), (select cust_a from ids), 'maintenance',
          'in_progress', d, (select tech_a from ids))
  returning id into j;
  if finish then
    update job set status = 'done', completed_at = (d + time '15:00') at time zone 'America/New_York'
    where id = j;
  end if;
  return j;
end
$$;
create temp table v (name text primary key, id uuid);
insert into v values
  ('oct2', pg_temp.visit('2026-10-02')),
  ('oct16', pg_temp.visit('2026-10-16')),
  ('oct23', pg_temp.visit('2026-10-23')),
  ('nov6', pg_temp.visit('2026-11-06'));
grant select on v to authenticated, anon, service_role;
create function pg_temp.vid(n text) returns uuid language sql as $$ select id from v where name = n $$;
grant execute on function pg_temp.vid(text) to authenticated, anon, service_role;

-- What a tech adds, through the same grants the sync uses.
create function pg_temp.add(visit text, item_name text, qty numeric, reading text default null,
                            supplied boolean default false) returns uuid
language plpgsql as $$
declare
  i uuid := gen_random_uuid();
begin
  insert into chemical_addition (id, company_id, job_id, property_id, price_book_item_id, name,
                                 unit, reading_key, quantity, customer_supplied, added_at)
  select i, (select ca from ids), pg_temp.vid(visit), (select prop_a from ids), p.id, p.name, p.unit,
         reading, qty, supplied,
         -- In the order added: a minute apart.
         (select plan_date from job where id = pg_temp.vid(visit)) + time '15:00'
           + (select count(*) from chemical_addition) * interval '1 minute'
  from price_book_item p where p.id = pg_temp.item(item_name);
  return i;
end
$$;
grant execute on function pg_temp.add(text, text, numeric, text, boolean) to authenticated;

select tests.authenticate_as((select tech_a from ids));
create temp table a (name text primary key, id uuid);
grant all on a to authenticated;
insert into a values
  ('cl1', pg_temp.add('oct2', 'Liquid chlorine', 0.75, 'fc')),
  ('acid1', pg_temp.add('oct2', 'Muriatic acid', 0.5, 'ph')),
  ('cl2', pg_temp.add('oct16', 'Liquid chlorine', 1)),
  ('tabs', pg_temp.add('oct16', 'Chlorine tabs (3″)', 12)),
  ('cl3', pg_temp.add('oct23', 'Liquid chlorine', 0.5, 'fc')),
  ('algae', pg_temp.add('oct23', 'Algaecide', 1, null, true)),
  ('nov', pg_temp.add('nov6', 'Liquid chlorine', 1));
select is((select unit_price_cents from chemical_addition where id = (select id from a where name = 'cl1')),
  800, 'the server sets the price from the price book');
select throws_ok($$ update chemical_addition set unit_price_cents = 1 $$, '42501', null,
  'techs can''t write a price');
select throws_ok($$ update chemical_addition set billed_invoice_id = null $$, '42501', null,
  'or the billing');
select lives_ok($$ update chemical_addition set quantity = 0.75
                  where id = (select id from a where name = 'cl3') $$,
  'they change an amount');
reset role;

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------

create function pg_temp.inv(m date) returns uuid language sql as $$
  select id from invoice where customer_id = (select cust_a from ids) and period_month = m
    and status <> 'void' and deleted_at is null
$$;
grant execute on function pg_temp.inv(date) to authenticated, anon, service_role;

select tests.authenticate_as((select owner_a from ids));
select is(create_monthly_invoices((select ca from ids), '2026-10-01'), 0,
  'a shop that doesn''t charge bills no chemicals');
reset role;

-- Switched on in October.
update company set settings = settings || '{"charge_chemicals": true, "charge_chemicals_from": "2026-10-01"}'
  where id = (select ca from ids);
select tests.authenticate_as((select owner_a from ids));
select is((select (m ->> 'total_cents')::numeric from jsonb_array_elements(
             unbilled_maintenance((select ca from ids))) m where m ->> 'month' = '2026-10-01'),
  2000.0 + 750 + 3000, 'Maintenance to Bill counts the month''s chemicals');
select is(create_monthly_invoices((select ca from ids), '2026-10-01'), 1,
  'a customer whose only unbilled items are chemicals gets a draft');
reset role;
select results_eq($$
  select description, quantity, unit, unit_price_cents, taxable from invoice_line_item
  where invoice_id = pg_temp.inv('2026-10-01') and deleted_at is null order by sort_order $$,
  $$ values ('Liquid chlorine, October'::text, 2.50::numeric, 'gal'::text, 800, true),
            ('Muriatic acid, October', 0.50, 'gal', 1500, true),
            ('Chlorine tabs (3″), October', 12.00, 'tab', 250, true) $$,
  'one line per chemical for the month; the customer''s own algaecide is never billed');
select is((select job_id from invoice where id = pg_temp.inv('2026-10-01')), pg_temp.vid('oct23'),
  'the month''s last visit carries the invoice');

-- A change on the draft: its line follows.
select tests.authenticate_as((select tech_a from ids));
update chemical_addition set quantity = 1 where id = (select id from a where name = 'cl1');
update chemical_addition set deleted_at = now() where id = (select id from a where name = 'acid1');
reset role;
select results_eq($$
  select description, quantity from invoice_line_item
  where invoice_id = pg_temp.inv('2026-10-01') and deleted_at is null order by sort_order $$,
  $$ values ('Liquid chlorine, October'::text, 2.75::numeric),
            ('Chlorine tabs (3″), October', 12.00) $$,
  'on a draft, a changed amount changes its line and a removed chemical removes its line');

-- Billing the month again adds nothing twice.
select tests.authenticate_as((select owner_a from ids));
select create_monthly_invoices((select ca from ids), '2026-10-01');
reset role;
select is((select count(*) from invoice_line_item where invoice_id = pg_temp.inv('2026-10-01')
           and deleted_at is null), 2::bigint, 'billing again bills nothing twice');

-- Sent: final.
select tests.authenticate_as((select owner_a from ids));
select send_invoice(pg_temp.inv('2026-10-01'));
reset role;
select is((select total_cents from invoice where id = pg_temp.inv('2026-10-01')), 2200 + 3000,
  'the chemicals are in the sent total (no sales tax set)');
select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ update chemical_addition set quantity = 3
                    where id = (select id from a where name = 'tabs') $$,
  '23514', 'This chemical is on a sent invoice. Change the invoice instead.',
  'a chemical on a sent invoice can''t change');
-- Added late, after October's invoice went: it waits for November's.
insert into a values ('late', pg_temp.add('oct23', 'Soda ash', 1.5, 'ph'));
reset role;
select tests.authenticate_as((select owner_a from ids));
select create_monthly_invoices((select ca from ids), '2026-10-01');
select is(create_monthly_invoices((select ca from ids), '2026-11-01'), 1, 'November is billed');
reset role;
select results_eq($$
  select description, quantity from invoice_line_item
  where invoice_id = pg_temp.inv('2026-11-01') and deleted_at is null order by sort_order $$,
  $$ values ('Soda ash, October'::text, 1.50::numeric),
            ('Liquid chlorine, November', 1.00) $$,
  'a chemical added after its month''s invoice was sent goes on the next, under its own month');

-- Void frees them.
select tests.authenticate_as((select owner_a from ids));
select void_invoice(pg_temp.inv('2026-11-01'));
reset role;
select is((select count(*) from chemical_addition where job_id = pg_temp.vid('nov6')
           and billed_invoice_id is null), 1::bigint, 'voiding the invoice frees its chemicals');

-- Before the month it was switched on: never billed.
update company set settings = settings || '{"charge_chemicals_from": "2026-11-01"}'
  where id = (select ca from ids);
select is((select count(*) from app.unbilled_chemicals((select ca from ids), '2026-10-01')),
  0::bigint, 'months before Charge for Chemicals was switched on are never billed');

-- ---------------------------------------------------------------------------
-- The visit report
-- ---------------------------------------------------------------------------

insert into chemical_reading (id, company_id, property_id, job_id, recorded_by, gallons, fc, ph, goals)
  select pg_temp.vid('oct23'), ca, prop_a, pg_temp.vid('oct23'), tech_a, 20000, 1, 7.8, '{"fc": 4}'
  from ids;
select tests.authenticate_as((select tech_a from ids));
select ok((send_visit_report(pg_temp.vid('oct23')) ->> 'token') is not null, 'a visit report sends');
reset role;
select is((select data_snapshot -> 'added' from report where job_id = pg_temp.vid('oct23')
           and template_key = 'maintenance' and status = 'sent'),
  jsonb_build_array(
    jsonb_build_object('name', 'Liquid chlorine', 'unit', 'gal', 'quantity', 0.75, 'reading_key', 'fc',
      'note', null, 'customer_supplied', false, 'unit_price_cents', 800),
    jsonb_build_object('name', 'Algaecide', 'unit', 'qt', 'quantity', 1.00, 'reading_key', null,
      'note', null, 'customer_supplied', true, 'unit_price_cents', 1500),
    jsonb_build_object('name', 'Soda ash', 'unit', 'lb', 'quantity', 1.50, 'reading_key', 'ph',
      'note', null, 'customer_supplied', false, 'unit_price_cents', 400)),
  'the report keeps what was added and its price');
select is((select data_snapshot -> 'chemicals' -> 0 -> 'goals' from report
           where job_id = pg_temp.vid('oct23') and template_key = 'maintenance' and status = 'sent'),
  '{"fc": 4}'::jsonb, 'and the levels the tech aimed for');
select ok((select (data_snapshot ->> 'charge_chemicals')::boolean from report
           where job_id = pg_temp.vid('oct23') and template_key = 'maintenance' and status = 'sent'),
  'and that the shop charged for them');

-- ---------------------------------------------------------------------------
-- Monthly reports
-- ---------------------------------------------------------------------------

select tests.authenticate_as((select tech_a from ids));
select is(send_invoice_month_report(pg_temp.inv('2026-10-01')) ->> 'skipped', 'not_monthly',
  'only Monthly shops send a month''s report with the invoice');
reset role;
update company set settings = settings || '{"visit_reports": "monthly"}' where id = (select ca from ids);
select tests.authenticate_as((select tech_a from ids));
select is(send_visit_report(pg_temp.vid('oct16'), true) ->> 'skipped', 'manual',
  'nothing goes by itself when a visit is completed');
select ok((send_invoice_month_report(pg_temp.inv('2026-10-01')) ->> 'token') is not null,
  'sending the month''s invoice sends its report');
reset role;
select is((select jsonb_array_length(data_snapshot -> 'visits') from report
           where template_key = 'maintenance_month' and status = 'sent'
             and customer_id = (select cust_a from ids)), 3,
  'the month''s report has every finished visit that month');
select is((select data_snapshot -> 'visits' -> 0 ->> 'job_id' from report
           where template_key = 'maintenance_month' and status = 'sent'), pg_temp.vid('oct23')::text,
  'newest first');
select ok((select data_snapshot -> 'invoice' ->> 'token' from report
           where template_key = 'maintenance_month' and status = 'sent') is not null,
  'with the invoice''s link');

-- The customer pages link each other.
create temp table tok as select
  (select token from share_link where invoice_id = pg_temp.inv('2026-10-01') and revoked_at is null
   order by created_at desc limit 1) as invoice_token,
  (select l.token from share_link l join report r on r.id = l.report_id
   where r.template_key = 'maintenance_month' and r.status = 'sent') as report_token;
grant select on tok to anon;
set role anon;
select is(month_report_link((select invoice_token from tok)) ->> 'token',
  (select report_token from tok), 'the invoice''s page finds its month''s report');
select is(report_for_token((select report_token from tok)) ->> 'template_key', 'maintenance_month',
  'and the report opens at its link');
reset role;

-- Sent again: a new version, and the old link points to it.
select tests.authenticate_as((select owner_a from ids));
select is((send_invoice_month_report(pg_temp.inv('2026-10-01')) ->> 'version')::int, 2,
  'sending again sends a new version');
reset role;
set role anon;
select ok(report_for_token((select report_token from tok)) ->> 'newer_token' is not null,
  'the earlier version points to the newest');
reset role;

-- No invoice that month: on its own, from the daily run, once.
create temp table cust3 (cust uuid, prop uuid);
with c as (insert into customer (company_id, name, email) select ca, 'No Plan', 'np@example.com' from ids returning id),
     p as (insert into property (company_id, customer_id, address_line1)
           select (select ca from ids), id, '3 Free Way' from c returning id, customer_id)
insert into cust3 select customer_id, id from p;
grant select on cust3 to authenticated, service_role;
insert into job (company_id, property_id, bill_to_customer_id, type, status, plan_date, assigned_user_id)
  select ca, (select prop from cust3), (select cust from cust3), 'maintenance', 'in_progress',
         '2026-10-09', tech_a
  from ids;
update job set status = 'done' where bill_to_customer_id = (select cust from cust3);
set role service_role;
select is((select count(*) from month_reports_due('2026-11-01T14:00:00Z')
           where customer_id = (select cust from cust3)), 1::bigint,
  'a customer with visits and no invoice is due a report on the 1st');
select is((select count(*) from month_reports_due('2026-11-01T14:00:00Z')
           where customer_id = (select cust_a from ids)), 0::bigint,
  'one with an invoice gets it with the invoice');
select ok((send_month_report((select cust from cust3), '2026-10-01', null, true) ->> 'token') is not null,
  'the daily run sends it');
select is(send_month_report((select cust from cust3), '2026-10-01', null, true) ->> 'skipped', 'sent',
  'once');
reset role;
select tests.authenticate_as((select tech_a from ids));
select throws_ok($$ select * from month_reports_due() $$, '42501', null,
  'members can''t list the daily run');
reset role;

select * from finish();
rollback;
