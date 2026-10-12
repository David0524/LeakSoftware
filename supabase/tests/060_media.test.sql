-- Media rows: devices record captures and markup; only the server writes transcripts.
begin;
set search_path = public, extensions;
select no_plan();

create temp table fx as select tests.make_company('a') as a;
grant select on fx to authenticated;
create temp view ids as select
  (a ->> 'company')::uuid as ca, (a ->> 'tech')::uuid as tech_a, (a ->> 'job')::uuid as job_a
  from fx;
grant select on ids to authenticated;
create temp table m as select gen_random_uuid() as id;
grant select on m to authenticated;

select tests.authenticate_as((select tech_a from ids));

select lives_ok($$
  insert into media (id, company_id, job_id, kind, mime_type, size_bytes, sha256, captured_at,
                     latitude, longitude, duration_ms)
  values ((select id from m), (select ca from ids), (select job_a from ids), 'audio', 'audio/mp4',
          1234, repeat('b', 64), now(), 33.4, -111.9, 5000)
$$, 'tech records a voice note');
select lives_ok($$
  update media set upload_state = 'uploaded',
    markup = '{"version":1,"shapes":[{"type":"arrow","color":"red","x1":0.1,"y1":0.1,"x2":0.5,"y2":0.5}]}'
  where id = (select id from m)
$$, 'tech marks it uploaded and saves markup');
select throws_ok($$
  update media set transcript = 'made up' where id = (select id from m)
$$, '42501', null, 'tech cannot write a transcript');
select throws_ok($$
  update media set sha256 = repeat('c', 64) where id = (select id from m)
$$, '42501', null, 'tech cannot change the hash of a capture');
select throws_ok($$
  update media set transcript_status = 'done' where id = (select id from m)
$$, '42501', null, 'tech cannot set the transcript status');

-- The server writes the transcript; it gets field clocks (so devices take it on pull)
-- and an audit entry.
reset role;
update media set transcript = 'Return three is leaking.', transcript_status = 'done'
  where id = (select id from m);
select ok((select field_hlc ? 'transcript' and field_hlc ? 'transcript_status'
           from media where id = (select id from m)),
  'server transcript writes are stamped with field clocks');
select is((select new_value #>> '{}' from audit_log
           where row_id = (select id from m) and field = 'transcript'),
  'Return three is leaking.', 'server transcript writes are audited');

select * from finish();
rollback;
