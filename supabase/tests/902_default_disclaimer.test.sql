-- A default report disclaimer (owner, 2026-11-24): new shops start with it, with no shop's
-- name in it; a shop's own text and a cleared one stay as the shop set them.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
create temp view ids as select (a ->> 'company')::uuid as ca from fx;

select alike((select report_disclaimer from company where id = (select ca from ids)),
  'A leak detection addresses only those components%', 'a new shop starts with the default');
select alike((select report_disclaimer from company where id = (select ca from ids)),
  '%construed against the party drafting it.', 'all of it');
select unalike((select report_disclaimer from company where id = (select ca from ids)),
  '%Nevada%', 'no shop name in it');

update company set report_disclaimer = 'Shop legal text.' where id = (select ca from ids);
select is((select report_disclaimer from company where id = (select ca from ids)), 'Shop legal text.',
  'a shop can write its own');
update company set report_disclaimer = null where id = (select ca from ids);
select is((select report_disclaimer from company where id = (select ca from ids)), null,
  'or clear it');

select * from finish();
rollback;
