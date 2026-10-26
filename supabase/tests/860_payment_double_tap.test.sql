-- A payment recorded twice by a double tap (owner, 2026-10-26: "taps submit twice"): the same
-- invoice, amount, method and check number within 30 seconds is the payment already recorded.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'owner')::uuid as owner_a, (a ->> 'invoice')::uuid as inv_a from fx;
grant select on ids to authenticated;
create temp table st (k text primary key, v text);
grant all on st to authenticated;

-- A sent $185.00 invoice with nothing paid.
delete from payment where invoice_id = (select inv_a from ids);
select set_config('app.invoice_server', 'on', true);
update invoice set status = 'sent', sent_at = now(), amount_paid_cents = 0
  where id = (select inv_a from ids);
select set_config('app.invoice_server', 'off', true);

select tests.authenticate_as((select owner_a from ids));
insert into st select 'first', record_invoice_payment((select inv_a from ids), 5000, 'cash')::text;
insert into st select 'again', record_invoice_payment((select inv_a from ids), 5000, 'cash')::text;
select is((select v::jsonb ->> 'payment_id' from st where k = 'again'),
  (select v::jsonb ->> 'payment_id' from st where k = 'first'),
  'the same cash payment again is the one already recorded');
select is((select (v::jsonb ->> 'duplicate')::boolean from st where k = 'again'), true,
  'and says so');
select is((select (v::jsonb ->> 'paid_now')::boolean from st where k = 'again'), false,
  'without announcing a new payment');
select is((select count(*)::int from payment where invoice_id = (select inv_a from ids)
           and status = 'succeeded'), 1, 'one payment on the invoice');
select is((select amount_paid_cents from invoice where id = (select inv_a from ids)), 5000,
  'and the invoice counts it once');

-- A different amount, method or check number is another payment.
select lives_ok(format($$ select record_invoice_payment(%L, 2500, 'cash') $$, (select inv_a from ids)),
  'another amount is another payment');
select lives_ok(format($$ select record_invoice_payment(%L, 5000, 'check', '1001') $$,
  (select inv_a from ids)), 'another method is another payment');
select lives_ok(format($$ select record_invoice_payment(%L, 5000, 'check', '1002') $$,
  (select inv_a from ids)), 'another check number is another payment');
select is((select count(*)::int from payment where invoice_id = (select inv_a from ids)
           and status = 'succeeded'), 4, 'four payments now');

-- The payment that settled the invoice, sent again: the same payment, not an error.
insert into st select 'last',
  record_invoice_payment((select inv_a from ids), 18500 - 5000 - 2500 - 5000 - 5000, 'cash')::text;
select is((select v::jsonb ->> 'status' from st where k = 'last'), 'paid', 'the last payment settles it');
select is((record_invoice_payment((select inv_a from ids), 1000, 'cash') ->> 'payment_id'),
  (select v::jsonb ->> 'payment_id' from st where k = 'last'),
  'sent again after the invoice is paid, it is the payment already recorded');

-- Not a duplicate once enough time has passed.
reset role;
-- (created_at is kept stable by a trigger, so it is switched off to age the rows.)
alter table payment disable trigger user;
update payment set created_at = now() - interval '2 minutes' where invoice_id = (select inv_a from ids);
alter table payment enable trigger user;
select set_config('app.invoice_server', 'on', true);
update invoice set status = 'sent', amount_paid_cents = 0 where id = (select inv_a from ids);
select set_config('app.invoice_server', 'off', true);
select tests.authenticate_as((select owner_a from ids));
select isnt((record_invoice_payment((select inv_a from ids), 5000, 'cash') ->> 'payment_id'),
  (select v::jsonb ->> 'payment_id' from st where k = 'first'),
  'the same payment recorded again after a while is a new one');
reset role;

select * from finish();
rollback;
