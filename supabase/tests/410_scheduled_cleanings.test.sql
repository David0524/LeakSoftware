-- Scheduled cleanings (owner, 2026-10-18): a plan's filter or salt cell cleaning goes on the
-- first visit on or after its due date, moves on by its interval once done, stays due when
-- skipped, and a priced one is billed as its own line. Items on a schedule stay off ordinary
-- visits. Owners set them up; techs read them.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'customer')::uuid as cust_a, (a ->> 'property')::uuid as prop_a,
  (now() at time zone 'America/New_York')::date as today
  from fx;
grant select on ids to authenticated;
create temp table plan (id uuid);
grant select, insert on plan to authenticated;

-- Live visit items a cleaning put on the plan's visits: (plan date, item).
create function pg_temp.placed() returns table (day date, item text) language sql as $$
  select j.plan_date, x.label from job_component x join job j on j.id = x.job_id, plan p
  where j.service_plan_id = p.id and j.deleted_at is null and x.deleted_at is null
    and x.plan_cleaning_id is not null
  order by 1, 2
$$;
grant execute on function pg_temp.placed() to authenticated;
create function pg_temp.cleaning(k text) returns uuid language sql as $$
  select pc.id from plan_cleaning pc join component_type t on t.id = pc.component_type_id, plan p
  where pc.service_plan_id = p.id and t.key = k and pc.deleted_at is null
$$;
grant execute on function pg_temp.cleaning(text) to authenticated;

select results_eq($$ select key from component_type
  where company_id = (select ca from ids) and on_schedule and deleted_at is null order by key $$,
  $$ values ('svc_filter_clean'::text), ('svc_filter_replace'), ('svc_salt_clean') $$,
  'pool shops have filter cleaning, filter replacement, and salt cell cleaning on a schedule');

select tests.authenticate_as((select owner_a from ids));
select lives_ok(format($$ with p as (
    insert into service_plan (company_id, customer_id, property_id, assigned_user_id, starts_on,
                              price_cents)
    values (%L, %L, %L, %L, %L, 9500) returning id)
  insert into plan select id from p $$, (select ca from ids), (select cust_a from ids),
  (select prop_a from ids), (select tech_a from ids), (select today from ids)),
  'owners make a weekly plan');
select is((select count(*)::int from job_component x join job j on j.id = x.job_id
           join component_type t on t.id = x.component_type_id, plan p
           where j.service_plan_id = p.id and t.on_schedule),
  0, 'items on a schedule stay off ordinary visits');

select lives_ok(format($$ insert into plan_cleaning (company_id, service_plan_id, component_type_id,
                           every_months, next_due, price_cents)
  values (%L, (select id from plan),
          (select id from component_type where company_id = %L and key = 'svc_filter_clean'),
          3, %L, 4000) $$,
  (select ca from ids), (select ca from ids), (select today + 10 from ids)),
  'owners schedule a filter cleaning');
select results_eq($$ select * from pg_temp.placed() $$,
  format($$ values (%L::date, 'Clean filter'::text) $$, (select today + 14 from ids)),
  'it goes on the first visit on or after its due date');
select is((select count(*)::int from checklist_item_result r join job_component x on x.id = r.job_component_id
           where x.plan_cleaning_id = pg_temp.cleaning('svc_filter_clean') and x.deleted_at is null
             and r.deleted_at is null and r.status = 'pending'),
  1, 'to do on that visit');

select lives_ok($$ update plan_cleaning set next_due = (select today from ids)
  where id = pg_temp.cleaning('svc_filter_clean') $$, 'owners move it up');
select results_eq($$ select * from pg_temp.placed() $$,
  format($$ values (%L::date, 'Clean filter'::text) $$, (select today from ids)),
  'it moves to today''s visit and off the later one');

select lives_ok(format($$ insert into plan_cleaning (company_id, service_plan_id, component_type_id,
                           every_months, next_due)
  values (%L, (select id from plan),
          (select id from component_type where company_id = %L and key = 'svc_salt_clean'),
          6, %L) $$,
  (select ca from ids), (select ca from ids), (select today + 7 from ids)),
  'and a salt cell cleaning, included in the visit price');
select lives_ok($$ update service_plan set visit_time = '09:00' where id = (select id from plan) $$,
  'changing the plan remakes its visits');
select results_eq($$ select * from pg_temp.placed() $$,
  format($$ values (%L::date, 'Clean filter'::text), (%L::date, 'Clean salt cell') $$,
         (select today from ids), (select today + 7 from ids)),
  'and the cleanings are put back on them');
reset role;

select tests.authenticate_as((select tech_a from ids));
select is((select count(*)::int from plan_cleaning where service_plan_id = (select id from plan)),
  2, 'techs read a plan''s cleanings');
update plan_cleaning set every_months = 1 where service_plan_id = (select id from plan);
reset role;
select is((select count(*)::int from plan_cleaning
           where service_plan_id = (select id from plan) and every_months = 1),
  0, 'but can''t change them');

-- Today's visit is done with the filter cleaned: due again in three months, billed.
update checklist_item_result r set status = 'inspected', method = 'Service'
from job j, plan p where j.id = r.job_id and j.service_plan_id = p.id
  and j.plan_date = (select today from ids) and j.deleted_at is null and r.deleted_at is null;
update job set status = 'in_progress' where service_plan_id = (select id from plan)
  and plan_date = (select today from ids) and deleted_at is null;
update job set status = 'done' where service_plan_id = (select id from plan)
  and plan_date = (select today from ids) and deleted_at is null;
select results_eq($$ select next_due, last_done_on from plan_cleaning
  where id = pg_temp.cleaning('svc_filter_clean') $$,
  format($$ values (%L::date, %L::date) $$,
         (select (today + interval '3 months')::date from ids), (select today from ids)),
  'done: next due three months on');
select is((select x.price_cents from job_component x
           where x.plan_cleaning_id = pg_temp.cleaning('svc_filter_clean') and x.deleted_at is null),
  4000, 'the cleaning carries its price');
select results_eq($$ select * from pg_temp.placed() $$,
  format($$ values (%L::date, 'Clean filter'::text), (%L::date, 'Clean salt cell') $$,
         (select today from ids), (select today + 7 from ids)),
  'and isn''t put on the coming visits');

-- Next week's visit is done with the salt cell skipped: it stays due, on the visit after.
update checklist_item_result r set status = 'excluded', exclusion_reason = 'No time'
from job j, job_component x, plan p where j.id = r.job_id and j.service_plan_id = p.id
  and x.id = r.job_component_id and x.plan_cleaning_id is not null
  and j.plan_date = (select today + 7 from ids) and j.deleted_at is null and r.deleted_at is null;
update job set status = 'in_progress' where service_plan_id = (select id from plan)
  and plan_date = (select today + 7 from ids) and deleted_at is null;
update job set status = 'done' where service_plan_id = (select id from plan)
  and plan_date = (select today + 7 from ids) and deleted_at is null;
select results_eq($$ select next_due, last_done_on from plan_cleaning
  where id = pg_temp.cleaning('svc_salt_clean') $$,
  format($$ values (%L::date, null::date) $$, (select today + 7 from ids)),
  'skipped: still due');
select results_eq($$ select * from pg_temp.placed() $$,
  format($$ values (%L::date, 'Clean filter'::text), (%L::date, 'Clean salt cell'),
                   (%L::date, 'Clean salt cell') $$,
         (select today from ids), (select today + 7 from ids), (select today + 14 from ids)),
  'and put on the next visit');

-- Ending a cleaning takes it off the visits that haven't started.
select tests.authenticate_as((select owner_a from ids));
select lives_ok($$ update plan_cleaning set deleted_at = now()
  where id = pg_temp.cleaning('svc_salt_clean') $$, 'owners turn a cleaning off');
reset role;
select is((select count(*)::int from pg_temp.placed() where day > (select today + 7 from ids)),
  0, 'it leaves the coming visits');

-- Billing: the plan's month, then the cleaning.
select is(app.bill_maintenance_month((select ca from ids), (select today from ids)) >= 1, true,
  'the month is billed');
select results_eq($$ select l.description, l.unit_price_cents from invoice_line_item l
  join invoice i on i.id = l.invoice_id
  where i.customer_id = (select cust_a from ids) and i.period_month = date_trunc('month', (select today from ids))::date
    and l.deleted_at is null
  order by l.sort_order $$,
  format($$ values (%L, 9500), (%L, 4000) $$,
         'Pool service, ' || to_char((select today from ids), 'FMMonth'),
         'Clean filter, ' || to_char((select today from ids), 'Mon FMDD')),
  'a line for the plan''s month and one for the filter cleaning');

-- A visit priced only by its cleaning is still billed.
-- This month's visits only: in a month's last week, next week's visit is next month's to bill.
select is((select count(*)::int from app.unbilled_visits((select ca from ids)) j
           where date_trunc('month', j.plan_date) = date_trunc('month', (select today from ids))),
  0, 'nothing left to bill');
update job set fee_cents = 0, billed_invoice_id = null where service_plan_id = (select id from plan)
  and plan_date = (select today from ids) and deleted_at is null;
delete from invoice_line_item where invoice_id in (select id from invoice
  where customer_id = (select cust_a from ids) and period_month is not null);
select is((select count(*)::int from app.unbilled_visits((select ca from ids)) j
           where j.plan_date = (select today from ids)),
  1, 'a visit with no price but a priced cleaning is billable');

select * from finish();
rollback;
