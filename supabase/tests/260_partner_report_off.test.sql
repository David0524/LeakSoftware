-- The partner report starts off for new shops; the homeowner report stays on.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;

select is((select enabled from report_template
           where company_id = (select (a ->> 'company')::uuid from fx) and key = 'partner'),
  false, 'a new shop starts with the partner report off');
select is((select enabled from report_template
           where company_id = (select (a ->> 'company')::uuid from fx) and key = 'homeowner'),
  true, 'and the homeowner report on');

select * from finish();
rollback;
