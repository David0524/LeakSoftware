-- Upload size and type limits, and no new files from a locked shop (security review M2, owner
-- 2026-10-24).
--
-- The buckets had no file_size_limit or allowed_mime_types, so any member of any shop, even an
-- unpaid one made a minute ago, could upload any kind of file up to the project's limit, without
-- end. Now each bucket takes only what it holds, sized from what the apps really send:
--
--   media           50 MB  photos (2048 px JPEG at 0.7, about 0.5 to 1.5 MB), 60-second videos at
--                          the camera's medium preset (iPhone about 5 to 10 MB; Android records
--                          at its camera's quality, and the apps refuse anything over 50 MB at
--                          capture), 5-minute voice notes (AAC, about 5 MB), signatures (SVG).
--                          Types: core's media table (packages/core/src/media.ts) and SVG.
--   texts           10 MB  pictures in texts: a phone's full-size JPEG (0.8), the website's
--                          pictures (5 MB at most), and what customers' carriers send (Twilio
--                          takes 5 MB a message): any picture, video or audio, a PDF, a contact
--                          card.
--   company-assets   2 MB  shop logos: PNG, JPEG or SVG (the 2 MB every app already checks).
--   documents       50 MB  report and invoice PDFs, written only by the server.
--
-- 50 MB is also the project's own per-file limit on its plan; a bucket's limit can't be more.
-- The storage server applies these to every upload, the server's too, and answers 413 (too
-- large) or 415 (wrong type); the apps say so in plain words (core uploadRefusalMessage).
--
-- A locked shop (app.company_locked: unpaid, canceled, or past due over a week) adds no files,
-- like it changes no rows. The phones keep a refused upload in their queue and try it again
-- (every 30 seconds, doubling to once an hour), so photos taken while locked go up once the shop
-- is paid; nothing is lost. The server's own uploads (inbound texts, PDFs) use the service key
-- and aren't held.

update storage.buckets set
  file_size_limit = 50 * 1024 * 1024,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/heic', 'image/svg+xml',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/webm',
    'audio/ogg']
where id = 'media';

update storage.buckets set
  file_size_limit = 10 * 1024 * 1024,
  allowed_mime_types = array[
    'image/*', 'video/*', 'audio/*', 'application/pdf', 'text/vcard', 'text/x-vcard']
where id = 'texts';

update storage.buckets set
  file_size_limit = 2 * 1024 * 1024,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/svg+xml']
where id = 'company-assets';

update storage.buckets set
  file_size_limit = 50 * 1024 * 1024,
  allowed_mime_types = array['application/pdf']
where id = 'documents';

-- Restrictive, beside each bucket's own insert rule, like View Only's (20261022000700).
create policy locked_shop_files on storage.objects as restrictive for insert to authenticated
  with check (not coalesce(app.company_locked(app.object_company(name)), false));
create policy locked_shop_file_changes on storage.objects as restrictive for update to authenticated
  using (not coalesce(app.company_locked(app.object_company(name)), false));
