-- sync_push / sync_pull and the field-clock and audit triggers.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (b ->> 'company')::uuid as cb,
  (a ->> 'tech')::uuid as tech_a, (a ->> 'owner')::uuid as owner_a,
  (a ->> 'customer')::uuid as cust_a, (b ->> 'customer')::uuid as cust_b,
  (a ->> 'quote')::uuid as quote_a from fx;
grant select on ids to authenticated;

-- Build one mutation.
create function pg_temp.mut(tbl text, row_id uuid, company uuid, fields jsonb, id uuid default gen_random_uuid())
returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'table', tbl, 'row_id', row_id, 'company_id', company, 'fields', fields)
$$;
create function pg_temp.f(v jsonb, hlc text) returns jsonb language sql as $$
  select jsonb_build_object('v', v, 'hlc', hlc)
$$;
create function pg_temp.status(res jsonb, i int default 0) returns text language sql as $$
  select res -> 'results' -> i ->> 'status'
$$;
grant execute on all functions in schema pg_temp to authenticated;

create temp table new_ids as select gen_random_uuid() as cust, gen_random_uuid() as mid;
grant select on new_ids to authenticated;

select tests.authenticate_as((select tech_a from ids));

-- Insert through sync
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust from new_ids), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"Pool Owner"', '1700000000000-0000-devA'),
                       'phone', pg_temp.f('"555-0100"', '1700000000000-0000-devA')),
    (select mid from new_ids))), 'devA')),
  'applied', 'push: new row is inserted');
select is((select name from customer where id = (select cust from new_ids)), 'Pool Owner',
  'push: inserted values stored');
select is((select field_hlc ->> 'name' from customer where id = (select cust from new_ids)),
  '1700000000000-0000-devA', 'push: field clock comes from the device');

-- Retrying the same mutation id is a no-op
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust from new_ids), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"Pool Owner"', '1700000000000-0000-devA')),
    (select mid from new_ids))), 'devA')),
  'duplicate', 'push: retry of an applied mutation is a duplicate');

-- Newer write wins, older write loses, per field
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust from new_ids), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"Newer Name"', '1700000000500-0000-devB')))), 'devB')),
  'applied', 'push: newer write applied');
create temp table r_mixed as select sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust from new_ids), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"Older Name"', '1700000000100-0000-devA'),
                       'notes', pg_temp.f('"gate code 1234"', '1700000000100-0000-devA')))), 'devA') as r;
select is(pg_temp.status((select r from r_mixed)), 'partial', 'push: mixed result is partial');
select is((select r -> 'results' -> 0 -> 'lost' from r_mixed), '["name"]'::jsonb,
  'push: lost fields are reported');
select is((select name || ' / ' || notes from customer where id = (select cust from new_ids)),
  'Newer Name / gate code 1234', 'push: field-level merge keeps both edits');
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust from new_ids), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"Oldest"', '1600000000000-0000-devA')))), 'devA')),
  'stale', 'push: entirely older write is stale');

-- Clock far in the future is clamped
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust from new_ids), (select ca from ids),
    jsonb_build_object('phone', pg_temp.f('"555-9999"', '9999999999999-0000-devC')))), 'devC')),
  'applied', 'push: future clock accepted');
select ok((select (field_hlc ->> 'phone') < '9999999999999' from customer where id = (select cust from new_ids)),
  'push: future clock clamped near server time');

-- Rejections
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('quote',
    (select quote_a from ids), (select ca from ids),
    jsonb_build_object('status', pg_temp.f('"accepted"', '1800000000000-0000-devA')))), 'devA')),
  'rejected', 'push: server-owned column rejected');
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust_b from ids), (select cb from ids),
    jsonb_build_object('name', pg_temp.f('"hijack"', '1800000000000-0000-devA')))), 'devA')),
  'rejected', 'push: other company rejected');
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust_b from ids), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"hijack"', '1800000000000-0000-devA')))), 'devA')),
  'rejected', 'push: another company''s row id with own company id rejected');
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('payment',
    gen_random_uuid(), (select ca from ids),
    jsonb_build_object('amount_cents', pg_temp.f('100', '1800000000000-0000-devA')))), 'devA')),
  'rejected', 'push: server-only table rejected');
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('price_book_item',
    gen_random_uuid(), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"Free repair"', '1800000000000-0000-devA')))), 'devA')),
  'rejected', 'push: tech cannot write owner-only config');
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust_a from ids), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"x"', 'not-an-hlc')))), 'devA')),
  'rejected', 'push: malformed clock rejected');

-- One bad mutation does not stop the batch
create temp table r_batch as select sync_push(jsonb_build_array(
  pg_temp.mut('quote', (select quote_a from ids), (select ca from ids),
    jsonb_build_object('status', pg_temp.f('"accepted"', '1800000000000-0000-devA'))),
  pg_temp.mut('customer', (select cust_a from ids), (select ca from ids),
    jsonb_build_object('notes', pg_temp.f('"after a bad one"', '1800000000000-0000-devA')))), 'devA') as r;
select is(pg_temp.status((select r from r_batch), 1), 'applied', 'push: batch continues after a rejection');

-- Offline create-then-delete arrives as one insert with deleted_at
create temp table gone as select gen_random_uuid() as id;
grant select on gone to authenticated;
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select id from gone), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"Typo"', '1800000000000-0000-devA'),
                       'deleted_at', pg_temp.f('"2026-10-12T10:00:00Z"', '1800000000001-0000-devA')))), 'devA')),
  'applied', 'push: insert with deleted_at applied');
select ok((select deleted_at is not null from customer where id = (select id from gone)),
  'push: row arrives soft-deleted');
reset role;

-- Office edits (no sync) still bump field clocks, so a stale device write loses
update customer set name = 'Office Name' where id = (select cust from new_ids);
select tests.authenticate_as((select tech_a from ids));
select is(pg_temp.status(sync_push(jsonb_build_array(pg_temp.mut('customer',
    (select cust from new_ids), (select ca from ids),
    jsonb_build_object('name', pg_temp.f('"Offline from yesterday"', '1700000001000-0000-devA')))), 'devA')),
  'stale', 'push: device edit older than an office edit loses');
reset role;

-- Audit log
select ok((select count(*) from audit_log where row_id = (select cust from new_ids) and field is null) = 1,
  'audit: insert recorded once');
select is((select device_id from audit_log where row_id = (select cust from new_ids) and field = 'notes'),
  'devA', 'audit: field change records the device');
select is((select old_value #>> '{}' || ' -> ' || (new_value #>> '{}') from audit_log
           where row_id = (select cust from new_ids) and field = 'name' and device_id = 'devB'),
  'Pool Owner -> Newer Name', 'audit: old and new values recorded');
select ok((select count(*) from audit_log where row_id = (select cust from new_ids) and field = 'name'
           and new_value = '"Office Name"' and device_id is null) = 1,
  'audit: office edit recorded without a device');

-- Pull. Every row above was written by this still-open transaction, so pull must hold
-- them back: a transaction that has not finished could still commit rows below the cursor.
-- Pulls over committed data (paging, scope, multi-device) are covered by the Node
-- integration tests in packages/sync/test/integration.
select tests.authenticate_as((select tech_a from ids));
create temp table p1 as select sync_pull('{}', 1000) as r;
select ok((select (r ->> 'done')::boolean from p1), 'pull: finishes');
select is((select count(*) from p1, jsonb_array_elements(r -> 'rows') e
           where (e -> 'row' ->> 'id')::uuid = (select cust from new_ids)), 0::bigint,
  'pull: rows from an unfinished transaction are held back');
select ok((select (r -> 'cursor' ->> 'from')::xid8 <= pg_current_xact_id() from p1),
  'pull: cursor does not pass an unfinished transaction');
reset role;

select * from finish();
rollback;
