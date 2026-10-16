-- Company texting and calls (owner, 2026-10-16: Twilio, Tidemark pays, pictures on, calls as
-- Housecall Pro does them). One company number per shop; texts and calls with each customer
-- live in one conversation the whole team sees, on the website and the phones.
--
-- Only the server writes here (it talks to Twilio); members read everything and mark a
-- conversation read (unread is shared by the team, as in a shared inbox). Owners change the
-- line's settings. See docs/plans/company-texting.md.

-- ---------------------------------------------------------------------------
-- The shop's number
-- ---------------------------------------------------------------------------

create table public.phone_line (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  -- E.164, e.g. +16025550142.
  number text not null,
  -- new: bought through Twilio; existing: the shop's own number, being set up for texting.
  source text not null default 'new' check (source in ('new', 'existing')),
  status text not null default 'active' check (status in ('pending', 'active', 'released')),
  provider_sid text,
  -- Owners: pictures in texts (MMS), who rings for incoming calls, the voicemail greeting.
  pictures boolean not null default true,
  ring_user_ids uuid[] not null default '{}',
  voicemail_greeting text,
  check (number ~ '^\+[1-9][0-9]{7,14}$')
);
select app.make_synced('public.phone_line');
-- One working line per shop, and a number belongs to one shop.
create unique index phone_line_one_per_company on public.phone_line (company_id)
  where status <> 'released' and deleted_at is null;
create unique index phone_line_number on public.phone_line (number)
  where status <> 'released' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Conversations: one per customer phone number
-- ---------------------------------------------------------------------------

create table public.conversation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  customer_id uuid,
  last_at timestamptz not null default now(),
  last_preview text,
  -- Shared by the team: a new text or call from the customer makes it unread for everyone.
  unread boolean not null default false,
  -- The customer replied STOP: no texts until they reply START.
  opted_out boolean not null default false,
  foreign key (customer_id, company_id) references public.customer (id, company_id)
);
select app.make_synced('public.conversation');
create unique index conversation_phone on public.conversation (company_id, phone)
  where deleted_at is null;
create index conversation_last on public.conversation (company_id, last_at desc);

create table public.text_message (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  body text,
  -- Pictures: [{ "path": "texts/{company}/...", "type": "image/jpeg" }].
  media jsonb not null default '[]',
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'undelivered', 'failed', 'received')),
  provider_sid text,
  sent_by uuid,
  job_id uuid,
  error text,
  foreign key (conversation_id, company_id) references public.conversation (id, company_id),
  foreign key (job_id, company_id) references public.job (id, company_id)
);
select app.make_synced('public.text_message');
create index text_message_conversation on public.text_message (conversation_id, created_at);
create unique index text_message_provider on public.text_message (provider_sid)
  where provider_sid is not null;

create table public.call_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company (id) on delete cascade,
  conversation_id uuid,
  direction text not null check (direction in ('in', 'out')),
  status text not null default 'ringing'
    check (status in ('ringing', 'answered', 'missed', 'voicemail', 'completed', 'failed')),
  duration_seconds integer,
  -- Who answered or placed it.
  user_id uuid,
  -- Voicemail: Twilio's recording, played through the website, and its transcript.
  recording_sid text,
  transcript text,
  provider_sid text,
  foreign key (conversation_id, company_id) references public.conversation (id, company_id)
);
select app.make_synced('public.call_log');
create index call_log_conversation on public.call_log (conversation_id, created_at);
create unique index call_log_provider on public.call_log (provider_sid)
  where provider_sid is not null;

-- ---------------------------------------------------------------------------
-- Access (same registry and generated rules as 20261012000600_access.sql)
-- ---------------------------------------------------------------------------

insert into app.sync_table
  (table_name, read_role, write_role, insert_columns, update_columns, device_sync, sort_order)
values
  ('phone_line', 'member', 'owner', null, '{pictures,ring_user_ids,voicemail_greeting}', true, 620),
  ('conversation', 'member', 'member', null, '{unread}', true, 630),
  ('text_message', 'member', 'none', null, null, true, 640),
  ('call_log', 'member', 'none', null, null, true, 650);

grant select on public.phone_line, public.conversation, public.text_message, public.call_log
  to authenticated;
create policy phone_line_select on public.phone_line for select to authenticated
  using (app.is_member(company_id));
grant update (pictures, ring_user_ids, voicemail_greeting) on public.phone_line to authenticated;
create policy phone_line_update on public.phone_line for update to authenticated
  using (app.is_owner(company_id)) with check (app.is_owner(company_id));
create policy conversation_select on public.conversation for select to authenticated
  using (app.is_member(company_id));
grant update (unread) on public.conversation to authenticated;
create policy conversation_update on public.conversation for update to authenticated
  using (app.is_member(company_id)) with check (app.is_member(company_id));
create policy text_message_select on public.text_message for select to authenticated
  using (app.is_member(company_id));
create policy call_log_select on public.call_log for select to authenticated
  using (app.is_member(company_id));

select app.speed_up_policies();

-- ---------------------------------------------------------------------------
-- Pictures in texts: texts/{company_id}/{conversation_id}/{file}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('texts', 'texts', false)
on conflict (id) do nothing;

-- Members read and attach pictures; the server stores the ones customers send.
create policy texts_select on storage.objects for select to authenticated
  using (bucket_id = 'texts' and app.is_member(app.object_company(name)));
create policy texts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'texts' and app.is_member(app.object_company(name)));
