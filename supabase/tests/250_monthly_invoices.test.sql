-- Monthly maintenance invoices (owner, 2026-10-13): one invoice per customer per month for the
-- finished visits, a line per visit. Visits are billed once; late visits join the month's
-- draft; the visits follow the invoice (sent: invoiced, paid: paid, void: free to bill again).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a
  from fx;
grant select on ids to authenticated;

-- A second customer with a pool of their own.
create temp table cust2 (cust uuid, prop uuid);
with c as (insert into customer (company_id, name) select ca, 'Customer two' from ids returning id),
     p as (insert into property (company_id, customer_id, address_line1)
           select (select ca from ids), id, '2 Pool Way' from c returning id, customer_id)
insert into cust2 select customer_id, id from p;
grant select on cust2 to authenticated;

-- A finished visit: plan date, price, customer.
create function pg_temp.visit(cust uuid, prop uuid, d date, fee int, finish boolean default true)
returns uuid language plpgsql as $$
declare
  j uuid;
begin
  insert into job (company_id, property_id, bill_to_customer_id, type, status, plan_date,
                   fee_cents, assigned_user_id)
  values ((select ca from ids), prop, cust, 'maintenance', 'in_progress', d, fee,
          (select tech_a from ids))
  returning id into j;
  if finish then
    update job set status = 'done' where id = j;
  end if;
  return j;
end
$$;

create temp table v (name text primary key, id uuid);
insert into v values
  ('a1', pg_temp.visit((select cust_a from ids), (select prop_a from ids), '2026-09-03', 9500)),
  ('a2', pg_temp.visit((select cust_a from ids), (select prop_a from ids), '2026-09-17', 9500)),
  ('b1', pg_temp.visit((select cust from cust2), (select prop from cust2), '2026-09-10', 12000)),
  ('free', pg_temp.visit((select cust_a from ids), (select prop_a from ids), '2026-09-24', 0)),
  ('open', pg_temp.visit((select cust_a from ids), (select prop_a from ids), '2026-09-26', 9500, false)),
  ('oct', pg_temp.visit((select cust_a from ids), (select prop_a from ids), '2026-10-01', 9500));
grant select on v to authenticated;

create function pg_temp.inv(cust uuid) returns uuid language sql as $$
  select id from invoice where customer_id = cust and period_month = '2026-09-01'
    and status <> 'void'
$$;
grant execute on function pg_temp.inv(uuid) to authenticated;

-- Who can bill.
select tests.authenticate_as((select tech_a from ids));
select throws_ok(format($$ select create_monthly_invoices(%L, '2026-09-01') $$, (select ca from ids)),
  '42501', 'Only owners can bill maintenance', 'techs cannot bill a month');
select is(unbilled_maintenance((select ca from ids)), '[]'::jsonb, 'nor see what is waiting');
reset role;
select ok(not has_function_privilege('authenticated', 'bill_maintenance_due(timestamptz)', 'execute'),
  'only the daily run bills every shop');

select tests.authenticate_as((select owner_a from ids));
select is(unbilled_maintenance((select ca from ids)),
  '[{"month": "2026-09-01", "visits": 3, "customers": 2, "total_cents": 31000},
    {"month": "2026-10-01", "visits": 1, "customers": 1, "total_cents": 9500}]'::jsonb,
  'owners see what is waiting, by month (no free or unfinished visits)');
select is(create_monthly_invoices((select ca from ids), '2026-09-15'), 2,
  'billing September makes one invoice per customer');
reset role;

select results_eq($$
  select l.description, l.unit_price_cents, l.taxable from invoice_line_item l
  where l.invoice_id = pg_temp.inv((select cust_a from ids)) order by l.sort_order $$,
  $$ values ('Pool service, Sep 3'::text, 9500, false), ('Pool service, Sep 17', 9500, false) $$,
  'a line per visit');
select is((select job_id from invoice where id = pg_temp.inv((select cust_a from ids))),
  (select id from v where name = 'a2'), 'the invoice sits on the month''s last visit');
select is((select count(*) from job where billed_invoice_id = pg_temp.inv((select cust_a from ids))),
  2::bigint, 'both visits point at it');
select is((select status from invoice where id = pg_temp.inv((select cust from cust2))), 'draft',
  'invoices start as drafts');
select is((select billed_invoice_id from job where id = (select id from v where name = 'oct')), null,
  'October is left alone');

-- No double billing.
select is(app.bill_maintenance_month((select ca from ids), '2026-09-01'), 0,
  'billing again finds nothing');
select throws_ok(format($$ select create_invoice(%L) $$, (select id from v where name = 'a1')),
  '23514', 'This visit is on its monthly invoice', 'a billed visit cannot get its own invoice');

-- A visit finished late joins the draft and takes the invoice.
update job set status = 'done' where id = (select id from v where name = 'open');
select is(app.bill_maintenance_month((select ca from ids), '2026-09-01'), 1,
  'a late visit is billed on the next run');
select is((select count(*) from invoice where customer_id = (select cust_a from ids)
           and period_month = '2026-09-01'), 1::bigint, 'on the same invoice');
select results_eq($$
  select l.description, l.sort_order from invoice_line_item l
  where l.invoice_id = pg_temp.inv((select cust_a from ids)) order by l.sort_order $$,
  $$ values ('Pool service, Sep 3'::text, 1), ('Pool service, Sep 17', 2), ('Pool service, Sep 26', 3) $$,
  'as a third line');
select is((select job_id from invoice where id = pg_temp.inv((select cust_a from ids))),
  (select id from v where name = 'open'), 'which is now the month''s last visit');

-- Sending moves the visits to invoiced; a sent month takes no more visits.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ select send_invoice(%L) $$, pg_temp.inv((select cust_a from ids))),
  'the owner sends it');
reset role;
select is((select total_cents from invoice where id = pg_temp.inv((select cust_a from ids))), 28500,
  'for the three visits');
select results_eq($$ select distinct status from job
  where billed_invoice_id = pg_temp.inv((select cust_a from ids)) $$,
  $$ values ('invoiced'::text) $$, 'its visits are invoiced');
select is(pg_temp.visit((select cust_a from ids), (select prop_a from ids), '2026-09-29', 9500) is not null,
  true, 'one more September visit is finished');
select is(app.bill_maintenance_month((select ca from ids), '2026-09-01'), 0,
  'it is not added to the sent invoice');

-- Paid in full: the visits are paid.
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ select record_invoice_payment(%L, 28500) $$, pg_temp.inv((select cust_a from ids))),
  'the owner records a check');
reset role;
select results_eq($$ select distinct j.status from job j join invoice i on i.id = j.billed_invoice_id
  where i.customer_id = (select cust_a from ids) and i.period_month = '2026-09-01' $$,
  $$ values ('paid'::text) $$, 'its visits are paid');

-- Void frees the visits to be billed again.
create temp table b_inv as select pg_temp.inv((select cust from cust2)) as id;
grant select on b_inv to authenticated;
select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ select send_invoice(%L) $$, (select id from b_inv)), 'the other invoice is sent');
select lives_ok(format($$ select void_invoice(%L) $$, (select id from b_inv)), 'and voided');
reset role;
select is((select billed_invoice_id from job where id = (select id from v where name = 'b1')), null,
  'its visit is free again');
select is(app.bill_maintenance_month((select ca from ids), '2026-09-01'), 1,
  'and billed on a new invoice');
select isnt(pg_temp.inv((select cust from cust2)), (select id from b_inv), 'a new one');

-- The daily run bills last month in the shop's time zone.
select is(bill_maintenance_due('2026-11-01 12:00+00'), 1, 'on November 1st, October is billed');
select is((select period_month from invoice where job_id = (select id from v where name = 'oct')),
  '2026-10-01'::date, 'for October');

select * from finish();
rollback;
