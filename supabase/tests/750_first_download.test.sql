-- A new phone's first download (20261022001900_first_download.sql): no deleted rows, the company
-- first, every page marked, and older calls unchanged. Pulls hold back rows of unfinished
-- transactions, so these pass a `high` past this test's own transaction; committed changes after a
-- download (a delete on the next pull, a resumed download) are in the sync integration tests.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('fd') as a;
grant select on fx to authenticated;
create temp view ids as select (a ->> 'company')::uuid as co, (a ->> 'owner')::uuid as owner,
  (a ->> 'customer')::uuid as cust, (a ->> 'job')::uuid as job from fx;
grant select on ids to authenticated;

-- A deleted customer, a deleted checklist row, and more live customers so pages split.
insert into customer (company_id, name, deleted_at)
  select co, 'Gone Customer', now() from ids;
insert into customer (company_id, name)
  select co, 'Live Customer ' || g from ids, generate_series(1, 5) g;
update job_component set deleted_at = now() where job_id = (select job from ids);
create temp table gone as
  select (select id from customer where name = 'Gone Customer') as cust,
         (select id from job_component where job_id = (select job from ids)) as comp;
grant select on gone to authenticated;
-- Past this transaction, so its rows count as finished.
create temp table hi as select (pg_current_xact_id()::text::bigint + 1)::text as h;
grant select on hi to authenticated;

select tests.authenticate_as((select owner from ids));

-- One page holding the whole first download, and the same range pulled the incremental way.
create temp table one as
  select sync_pull(jsonb_build_object('first', true, 'high', (select h from hi)), 2000) as r;
create temp table one_rows as
  select e ->> 'table' as t, (e -> 'row' ->> 'id')::uuid as id, e -> 'row' as row, o
  from one, jsonb_array_elements(r -> 'rows') with ordinality x(e, o);
create temp table inc as
  select sync_pull(jsonb_build_object('from', '0', 'high', (select h from hi)), 2000) as r;
create temp table inc_rows as
  select e ->> 'table' as t, (e -> 'row' ->> 'id')::uuid as id from inc, jsonb_array_elements(r -> 'rows') e;

select ok((select (r ->> 'done')::boolean from one), 'first download: one page holds it');
select is((select r -> 'cursor' from one), jsonb_build_object('from', (select h from hi)),
  'first download: once done, the cursor is a plain incremental one (no marker)');
select is((select count(*) from one_rows where t = 'customer' and id = (select cust from gone)),
  0::bigint, 'first download: a deleted customer is left out');
select is((select count(*) from one_rows where t = 'job_component' and id = (select comp from gone)),
  0::bigint, 'first download: a deleted checklist component is left out');
select is((select count(*) from one_rows where row ->> 'deleted_at' is not null), 0::bigint,
  'first download: no deleted rows at all');
select is((select count(*) from one_rows where t = 'customer'), 6::bigint,
  'first download: the live customers are all there');
select is((select count(*) from inc_rows where t = 'customer' and id = (select cust from gone)),
  1::bigint, 'an incremental pull over the same range still sends the delete');
select is((select count(*) from inc_rows where t = 'job_component' and id = (select comp from gone)),
  1::bigint, 'an incremental pull sends the deleted component too');

-- Order: the company and memberships open the download, then settings and lists, then
-- customers, pools, plans and jobs, then job work.
select is((select t from one_rows where o = 1), 'company', 'first download: the company comes first');
select ok((select bool_and(t = 'membership') from one_rows where o between 2 and 4),
  'first download: then the memberships');
select ok((select bool_and(prev <= rnk) from (
             select s.first_download_rank as rnk,
                    lag(s.first_download_rank, 1, 0::smallint) over (order by o) as prev
             from one_rows join app.sync_table s on s.table_name = one_rows.t) x),
  'first download: tables come in their download rank');

-- Paged, three rows at a time, like an interrupted download resuming page by page.
create temp table pages (n integer, r jsonb);
grant all on pages to authenticated;
do $$
declare
  c jsonb := jsonb_build_object('first', true, 'high', (select h from hi));
  r jsonb;
  i integer := 0;
begin
  loop
    r := sync_pull(c, 3);
    i := i + 1;
    insert into pages values (i, r);
    exit when (r ->> 'done')::boolean or i > 500;
    c := r -> 'cursor';
  end loop;
end
$$;
create temp table paged as
  select (e -> 'row' ->> 'id')::uuid as id, e ->> 'table' as t
  from pages, jsonb_array_elements(r -> 'rows') e;

select ok((select count(*) from pages) > 3, 'paged: several pages');
select ok((select bool_and((r -> 'cursor' ->> 'first')::boolean and jsonb_array_length(r -> 'cursor' -> 'after') = 4)
           from pages where not (r ->> 'done')::boolean),
  'paged: every page but the last carries the first-download marker and its place');
select is((select count(*) from paged), (select count(*) from one_rows),
  'paged: the same number of rows as one page');
select is((select count(*) from (select t, id from paged except select t, id from one_rows) x), 0::bigint,
  'paged: no row that one page doesn''t have');
select is((select count(*) from (select distinct t, id from paged) x), (select count(*) from paged),
  'paged: no row twice');
select is((select count(*) from paged where id in (select cust from gone union select comp from gone)),
  0::bigint, 'paged: deleted rows stay out on every page');
select is((select r - 'server_hlc' from pages where n = 3),
  (select sync_pull((select r -> 'cursor' from pages where n = 2), 3) - 'server_hlc'),
  'paged: resuming from a saved cursor gives the same page again');

-- The count matches what the download sends, per table.
create temp table cnt as select sync_pull_count() as n;
select is((select (n ->> 'customer')::bigint from cnt), 6::bigint,
  'count: live customers only');
select ok((select bool_and((select (n ->> k)::bigint from cnt) = v)
           from (select t as k, count(*) as v from one_rows group by t) x),
  'count: the same rows per table as the first download sends');

-- Older app builds: the same calls as before.
select ok((select (sync_pull('{}', 1000) ->> 'done')::boolean), 'older call: sync_pull(''{}'', 1000)');
select ok((select (sync_pull(null) ->> 'done')::boolean), 'older call: sync_pull(null)');
select ok((select sync_pull() ? 'rows'), 'older call: sync_pull() with defaults');
select ok((select jsonb_typeof(sync_pull_count()) = 'object'), 'older call: sync_pull_count()');
-- An incremental cursor of the old shape still pages the old way, deletes included.
create temp table old_pages (n integer, r jsonb);
grant all on old_pages to authenticated;
do $$
declare
  c jsonb := jsonb_build_object('from', '0', 'high', (select h from hi));
  r jsonb;
  i integer := 0;
begin
  loop
    r := sync_pull(c, 4);
    i := i + 1;
    insert into old_pages values (i, r);
    exit when (r ->> 'done')::boolean or i > 500;
    c := r -> 'cursor';
  end loop;
end
$$;
select ok((select bool_and(not (r -> 'cursor' ? 'first') and jsonb_array_length(r -> 'cursor' -> 'after') = 3)
           from old_pages where not (r ->> 'done')::boolean),
  'incremental pages keep the old cursor shape');
select is((select count(*) from old_pages, jsonb_array_elements(r -> 'rows') e),
  (select count(*) from inc_rows), 'incremental pages: the same rows as one page');
select is((select count(*) from old_pages, jsonb_array_elements(r -> 'rows') e
           where (e -> 'row' ->> 'id')::uuid = (select cust from gone)), 1::bigint,
  'incremental pages: the delete is sent');
reset role;

select * from finish();
rollback;
