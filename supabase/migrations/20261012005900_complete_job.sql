-- Complete Job (owner, 2026-10-19: "Let's add a complete job button"): a maintenance visit can
-- be completed straight from Scheduled, from its page or from Today, without starting it first.
-- Mirrored in packages/core/src/job-status.ts. Whether the checklist and a photo come first is
-- a shop setting (settings.require_checklist_to_finish, require_finish_photo), checked by the
-- apps and the website, like the photo rule (a trigger would refuse an offline change that
-- syncs before its photo or answers).
insert into app.job_status_transition (from_status, to_status) values ('scheduled', 'done');
