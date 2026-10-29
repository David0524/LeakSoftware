-- Plan schedules and monthly prices (owner, 2026-10-18): several days a week, weekly, every 2
-- weeks, or monthly (same weekday and week of the month); the plan's price is billed once a
-- month when a visit was done.
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

-- A plan row of a given shape, to read its dates (no visits made).
create function pg_temp.shape(starts date, wd smallint[], mon boolean, every int)
returns service_plan language plpgsql as $$
declare
  p service_plan;
begin
  p.starts_on := starts;
  p.weekdays := wd;
  p.monthly := mon;
  p.interval_weeks := every;
  return p;
end
$$;

-- 2026-11-02 is a Monday.
select results_eq($$ select * from app.plan_dates(pg_temp.shape('2026-11-02', '{1,4}', false, 1),
  '2026-11-01', '2026-11-14') $$,
  $$ values ('2026-11-02'::date), ('2026-11-05'), ('2026-11-09'), ('2026-11-12') $$,
  'several days a week: each chosen day, every week');
select results_eq($$ select * from app.plan_dates(pg_temp.shape('2026-11-02', null, false, 2),
  '2026-11-01', '2026-11-30') $$,
  $$ values ('2026-11-02'::date), ('2026-11-16'), ('2026-11-30') $$,
  'every 2 weeks: the first visit''s weekday');
-- 2026-11-10 is the 2nd Tuesday of November.
select results_eq($$ select * from app.plan_dates(pg_temp.shape('2026-11-10', null, true, 1),
  '2026-11-01', '2027-01-31') $$,
  $$ values ('2026-11-10'::date), ('2026-12-08'), ('2027-01-12') $$,
  'monthly: the same weekday in the same week of the month');
-- 2026-12-29 is the 5th Tuesday of December: monthly uses the 4th.
select results_eq($$ select * from app.plan_dates(pg_temp.shape('2026-12-29', null, true, 1),
  '2026-12-01', '2027-02-28') $$,
  $$ values ('2027-01-26'::date), ('2027-02-23') $$,
  'a 5th weekday repeats on the 4th');

-- The plan's shape is kept tidy.
select tests.authenticate_as((select owner_a from ids));
create temp table plan on commit drop as select gen_random_uuid() as id;
grant select on plan to authenticated;
select lives_ok(format($$ insert into service_plan (id, company_id, customer_id, property_id,
    starts_on, interval_weeks, weekdays, price_cents)
  values ((select id from plan), %L, %L, %L, current_date + 1, 2, '{4,1,4}', 20000) $$,
  (select ca from ids), (select cust_a from ids), (select prop_a from ids)),
  'owners save a plan for several days a week');
select results_eq($$ select weekdays, interval_weeks, monthly from service_plan
  where id = (select id from plan) $$,
  $$ values ('{1,4}'::smallint[], 1::smallint, false) $$,
  'its days are sorted once each, every week');
select lives_ok($$ update service_plan set weekdays = null, interval_weeks = 4
  where id = (select id from plan) $$, 'every 4 weeks (an older plan, an import)');
select results_eq($$ select weekdays, interval_weeks, monthly from service_plan
  where id = (select id from plan) $$,
  $$ values (null::smallint[], 1::smallint, true) $$, 'becomes monthly');
reset role;
select is((select count(*)::int from job where service_plan_id = (select id from plan)
           and deleted_at is null and fee_cents is not null),
  0, 'plan visits carry no price of their own');

-- Billing: one line per plan per month, however many visits were done.
-- The visits are added here, not taken from the plan's own: a plan starting tomorrow may have
-- none yet (2026-10-29: tomorrow was a 5th Thursday, so its first visit was weeks out).
insert into job (company_id, property_id, bill_to_customer_id, type, status, plan_date,
                 service_plan_id, assigned_user_id)
  select ca, prop_a, cust_a, 'maintenance', 'in_progress',
         date_trunc('month', current_date)::date + 3, (select id from plan), tech_a from ids;
update job set status = 'done' where service_plan_id = (select id from plan)
  and plan_date = date_trunc('month', current_date)::date + 3;
insert into job (company_id, property_id, bill_to_customer_id, type, status, plan_date,
                 service_plan_id, assigned_user_id)
  select ca, prop_a, cust_a, 'maintenance', 'in_progress',
         date_trunc('month', current_date)::date + 10, (select id from plan), tech_a from ids;
update job set status = 'done' where service_plan_id = (select id from plan)
  and plan_date = date_trunc('month', current_date)::date + 10;

select tests.authenticate_as((select owner_a from ids));
select is((unbilled_maintenance((select ca from ids)) -> 0 ->> 'total_cents')::int, 20000,
  'two visits, one month: the plan''s price once');
select is(create_monthly_invoices((select ca from ids), current_date), 1, 'owners bill the month');
reset role;
select results_eq($$ select l.description, l.unit_price_cents from invoice_line_item l
  join invoice i on i.id = l.invoice_id
  where i.customer_id = (select cust_a from ids) and i.period_month = date_trunc('month', current_date)::date
  order by l.sort_order $$,
  format($$ values (%L, 20000) $$, 'Pool service, ' || to_char(current_date, 'FMMonth')),
  'one line for the month');
select is((select count(*)::int from job where service_plan_id = (select id from plan)
           and billed_invoice_id is not null), 2, 'both visits are on it');

-- A late visit in a month already billed adds nothing.
insert into job (company_id, property_id, bill_to_customer_id, type, status, plan_date,
                 service_plan_id, assigned_user_id)
  select ca, prop_a, cust_a, 'maintenance', 'in_progress',
         date_trunc('month', current_date)::date + 12, (select id from plan), tech_a from ids;
update job set status = 'done' where service_plan_id = (select id from plan)
  and plan_date = date_trunc('month', current_date)::date + 12;
select is((select count(*)::int from app.unbilled_visits((select ca from ids))), 0,
  'a late visit in a billed month is not billed again');

select * from finish();
rollback;
