-- Owner dashboard (M10): owners see their own numbers; techs and other companies can't.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'owner')::uuid as owner_a, (a ->> 'tech')::uuid as tech_a,
  (a ->> 'invoice')::uuid as inv_a, (a ->> 'quote')::uuid as quote_a, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated;

-- This month: the quote sent and accepted, the invoice sent with $50 paid by card.
set local app.quote_server = 'on';
set local app.invoice_server = 'on';
update quote set status = 'accepted', sent_at = now() where id = (select quote_a from ids);
update invoice set status = 'partially_paid', sent_at = now(), amount_paid_cents = 5000
where id = (select inv_a from ids);
update payment set status = 'succeeded', paid_at = now(), amount_cents = 5000
where invoice_id = (select inv_a from ids);

select tests.authenticate_as((select owner_a from ids));
create temp table d as select owner_dashboard((select ca from ids), 6) as j;
select is(jsonb_array_length((select j -> 'months' from d)), 6, 'six months, oldest first');
select results_eq(
  $$ select (m ->> 'quotes_sent')::int, (m ->> 'quotes_accepted')::int, (m ->> 'invoiced_cents')::int,
            (m ->> 'outstanding_cents')::int, (m ->> 'collected_cents')::int
     from d, jsonb_array_elements(j -> 'months') with ordinality x(m, n)
     order by n desc limit 1 $$,
  $$ values (1, 1, 18500, 13500, 5000) $$,
  'this month: one quote sent and accepted, $185 invoiced, $50 collected, $135 owed');
select is((select (j ->> 'outstanding_cents')::int from d), 13500, 'outstanding in total');
select ok((select (select sum(value::int) from jsonb_each_text(j -> 'statuses')) from d) >= 1, 'jobs by status');
reset role;

select tests.authenticate_as((select tech_a from ids));
select throws_ok(format('select owner_dashboard(%L)', (select ca from ids)), '42501', null,
  'techs cannot see the dashboard');
reset role;
select tests.authenticate_as((select owner_b from ids));
select throws_ok(format('select owner_dashboard(%L)', (select ca from ids)), '42501', null,
  'another company cannot');
reset role;

select * from finish();
rollback;
