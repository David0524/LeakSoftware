-- Storage buckets. Every object path starts with the company id:
--   media/{company_id}/{job_id}/{media_id}.{ext}       photos, video, audio (immutable)
--   company-assets/{company_id}/...                    logos
--   documents/{company_id}/{job_id}/...                report PDFs (written by the server)

insert into storage.buckets (id, name, public) values
  ('media', 'media', false),
  ('company-assets', 'company-assets', false),
  ('documents', 'documents', false)
on conflict (id) do nothing;

create or replace function app.object_company(object_name text) returns uuid
language sql immutable as $$
  select app.try_uuid((storage.foldername(object_name))[1])
$$;
grant execute on function app.object_company(text) to authenticated, service_role;

-- Media: members read and upload. No update or delete: originals are evidence.
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and app.is_member(app.object_company(name)));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and app.is_member(app.object_company(name)));

-- Company assets: members read, owners write.
create policy company_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'company-assets' and app.is_member(app.object_company(name)));
create policy company_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-assets' and app.is_owner(app.object_company(name)));
create policy company_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'company-assets' and app.is_owner(app.object_company(name)))
  with check (bucket_id = 'company-assets' and app.is_owner(app.object_company(name)));

-- Documents: members read; only the server writes.
create policy documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and app.is_member(app.object_company(name)));
