-- Mass email has its own daily allowance (owner, 2026-10-22: "Give mass email its own limit"),
-- counted apart from the shop's other email (reports, quotes, invoices, receipts).
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a from fx;
grant select on ids to authenticated, service_role;

-- The server counts both kinds (as the service role).
set local role service_role;
select ok(use_allowance((select ca from ids), 'email', 299, 300), 'transactional email, nearly all');
select ok(use_allowance((select ca from ids), 'mass_email', 1500, 2000),
  'mass email still has its own room');
select ok(not use_allowance((select ca from ids), 'mass_email', 501, 2000),
  'but not past its own limit');
select ok(use_allowance((select ca from ids), 'mass_email', 4000, 6000),
  'one mass email can count more than 1,000 at once');
select throws_ok($$ select use_allowance((select ca from ids), 'mass_email', 100001, 200000) $$,
  '22023', 'Invalid count', 'within reason');
select ok(use_allowance((select ca from ids), 'email', 1, 300),
  'and a big mass email leaves the transactional allowance alone');
select ok(not use_allowance((select ca from ids), 'email', 1, 300), 'which has its own limit');
reset role;

select throws_ok($$ insert into app.daily_usage (company_id, kind, used)
                    values ((select ca from ids), 'fax', 1) $$,
  '23514', null, 'only known kinds are counted');

-- The compose page's "used today" is the mass emails, not the reports and invoices.
select tests.authenticate_as((select owner_a from ids));
select is((email_campaign_setup((select ca from ids)) ->> 'used_today')::int, 5500,
  'Email Customers counts only mass emails');
reset role;

select * from finish();
rollback;
