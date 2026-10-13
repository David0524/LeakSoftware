-- M8.5: verdicts, sections, fee, second tech, booking answers, disclaimer, numbering.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'job')::uuid as job_a, (a ->> 'customer')::uuid as cust_a
  from fx;
grant select on ids to authenticated;

update company set report_disclaimer = 'Shop legal text.' where id = (select ca from ids);

-- A tech records the job the way the shop works: verdicts with where, fee, second tech,
-- booking answers, location marked, and a second email for the customer.
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ update checklist_item_result set status = 'inspected', outcome = 'leaking',
  location_text = 'Skimmer seam, left side' where job_id = %L $$, (select job_a from ids)),
  'techs record a verdict and where');
select lives_ok(format($$ update job set fee_cents = 64900, second_tech_id = %L, location_marked = true,
  intake = '{"reason": ["Pool water level dropping"], "pool_size": "Normal (about 15x30 or 20x40)", "spa_size": ""}'
  where id = %L $$, (select owner_a from ids), (select job_a from ids)),
  'techs set the fee, a second tech, and booking answers');
select lives_ok(format($$ update customer set cc_emails = '{spouse@example.com}' where id = %L $$, (select cust_a from ids)),
  'customers can have more emails');
select is(tests.rows_affected($$ update company set report_disclaimer = 'x' $$), 0::bigint,
  'techs cannot change the disclaimer');
select throws_ok(format($$ select set_next_job_number(%L, 20000) $$, (select ca from ids)),
  '42501', null, 'techs cannot change numbering');
reset role;

select tests.authenticate_as((select owner_a from ids));
select is(set_next_job_number((select ca from ids), 10028), 10028, 'owners continue numbering from their old system');
select throws_ok(format($$ select set_next_job_number(%L, 5) $$, (select ca from ids)),
  '23514', null, 'numbering never goes backwards');
reset role;
insert into job (company_id, property_id, status)
select (select ca from ids), property_id, 'unscheduled' from job where id = (select job_a from ids);
select is((select max(number) from job where company_id = (select ca from ids)), 10028,
  'the next job gets the chosen number');

-- The report snapshot carries it all.
create temp table snap as select app.report_snapshot((select job_a from ids)) as s;
select is((select s -> 'components' -> 0 ->> 'outcome' from snap), 'leaking', 'snapshot: verdict');
select is((select s -> 'components' -> 0 ->> 'location_text' from snap), 'Skimmer seam, left side', 'snapshot: where');
select is((select s -> 'components' -> 0 ->> 'section' from snap), 'plumbing', 'snapshot: section');
select is((select (s -> 'job' ->> 'fee_cents')::int from snap), 64900, 'snapshot: fee');
select ok((select s -> 'job' ->> 'second_tech_name' is not null from snap), 'snapshot: second tech');
select is((select s -> 'job' -> 'intake' -> 'Why they called' ->> 0 from snap), 'Pool water level dropping',
  'snapshot: booking answers by question');
select ok((select not (s -> 'job' -> 'intake') ? 'Spa size or dimensions' from snap), 'snapshot: blank answers left out');
select is((select s -> 'company' ->> 'disclaimer' from snap), 'Shop legal text.', 'snapshot: disclaimer');
select is((select s -> 'customer' -> 'cc_emails' ->> 0 from snap), 'spouse@example.com', 'snapshot: more emails');

select * from finish();
rollback;
