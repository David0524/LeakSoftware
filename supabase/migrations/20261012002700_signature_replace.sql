-- Signatures can be replaced and removed (owner, 2026-10-13: "I signed a new v4 and it pulled
-- the sig from v3 too"; "you need to be able to delete/overwrite signatures").
--
-- * A report shows the newest signature of each kind (inspection acknowledged, work
--   completed, ...): signing a new version replaces the earlier one there. A version nobody
--   signed still shows the last one, marked with the version it was given on.
-- * Members can remove a signature (soft delete, like photos). Finished versions keep their
--   frozen copy; the drawing stays in storage as evidence.

create or replace function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  select case when s is null then null else s || jsonb_build_object(
    'signatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', latest.id, 'purpose', latest.purpose, 'signer_name', latest.signer_name,
        'signer_role', latest.signer_role, 'signed_at', latest.signed_at,
        'image_path', latest.image_path, 'report_version', latest.version)
        order by latest.signed_at)
      from (
        select distinct on (sg.purpose) sg.*, r.version
        from public.signature sg
        left join public.report r on r.id = sg.report_id
        where sg.job_id = target_job and sg.deleted_at is null
          and sg.purpose <> 'quote_acceptance'
        order by sg.purpose, sg.signed_at desc, sg.id desc
      ) latest), '[]'::jsonb))
  end
  from app.report_snapshot_m8(target_job) s
$$;
revoke all on function app.report_snapshot(uuid) from public;

-- Removing: deleted_at becomes client-writable, like media (registry as in 20261012000600).
update app.sync_table
set update_columns = update_columns || '{deleted_at}'
where table_name = 'signature' and not ('deleted_at' = any(update_columns));
grant update (deleted_at) on public.signature to authenticated;
