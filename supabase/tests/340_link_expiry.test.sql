-- Customer links (owner, 2026-10-16): they expire after 180 days, the daily job turns
-- expired ones off, and the shop's team can turn one off; a dead link shows nothing.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a, tests.make_company('b') as b;
grant select on fx to authenticated, anon, service_role;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (b ->> 'owner')::uuid as owner_b
  from fx;
grant select on ids to authenticated, anon, service_role;

create temp table link on commit drop as
  select id, token from share_link where company_id = (select ca from ids) and report_id is not null limit 1;
grant select on link to authenticated, anon;

select ok((select expires_at between now() + interval '179 days' and now() + interval '181 days'
           from share_link where id = (select id from link)), 'a new link lasts 180 days');
update report set status = 'sent', sent_at = now()
where id = (select report_id from share_link where id = (select id from link));
select isnt(report_for_token((select token from link), false), null, 'a live link shows the report');

-- Expired: refused at once, and turned off by the daily job.
update share_link set expires_at = now() - interval '1 minute' where id = (select id from link);
select is(report_for_token((select token from link), false), null, 'an expired link shows nothing');
select is(expire_share_links(), 1, 'the daily job turns expired links off');
select isnt((select revoked_at from share_link where id = (select id from link)), null,
  'so a new send makes a new link');

-- Turned off by the team.
create temp table fresh on commit drop as select gen_random_uuid() as id;
grant select on fresh to authenticated, anon;
insert into share_link (id, company_id, job_id, report_id)
select (select id from fresh), company_id, job_id, report_id from share_link where id = (select id from link);
select tests.authenticate_as((select owner_b from ids));
select throws_ok(format($$ select turn_off_share_link(%L) $$, (select id from fresh)), 'P0002', null,
  'another shop can''t turn a link off');
reset role;
select tests.authenticate_as((select tech_a from ids));
select lives_ok(format($$ select turn_off_share_link(%L) $$, (select id from fresh)), 'the shop''s team can');
reset role;
select is(report_for_token((select token from share_link where id = (select id from fresh)), false), null,
  'and the link shows nothing');

select * from finish();
rollback;
