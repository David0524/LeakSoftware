-- A team member's name comes with their membership in one query (2026-10-15, speed): the
-- website embeds profile in membership, which needs this key. Every user has a profile
-- (app.handle_new_user), and both rows already go when the user is deleted.
alter table public.membership
  add constraint membership_user_profile_fkey
  foreign key (user_id) references public.profile (id) on delete cascade;
