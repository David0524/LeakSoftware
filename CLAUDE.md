# LeakBook

Offline-first field app and office web app for pool leak detection shops.

## Read first
- `docs/BUILD_PLAN.md`: architecture, sync design, data model, milestones. Follow it.
- `docs/HANDOFF.md`: original requirements from the owner.
- `docs/DECISIONS.md`: decisions made so far. Add to it when the owner decides something.
- `brand/BRAND.md`: name, colors, type, logo rules. Use `brand/tokens.json`; never hardcode brand colors.

## How to work
- Build one milestone at a time (BUILD_PLAN section 8). When a milestone's "Done when" passes, commit, then stop and report: what was built, what was verified (with command output), and decisions for the owner. Do not start the next milestone until the owner says go.
- Do not build ahead of the current milestone or add features not in the plan. If the plan looks wrong, say so and propose the change instead of silently deviating.
- Config, not code: checklist components, test types, severities, exclusion reasons, report templates, and the price book are database rows seeded in `supabase/seed.sql`.
- Every business table has `company_id` and RLS. To add one (see `supabase/migrations/20261012000100_foundation.sql` header):
  1. Create it with `company_id` and composite foreign keys `(parent_id, company_id)`, then `select app.make_synced('public.<table>')`.
  2. Register it in `app.sync_table` with read/write roles and client-writable columns, and generate its policies and grants the same way `20261012000600_access.sql` does. Never grant by hand.
  3. Add a row for it in `tests.make_company()` (`supabase/tests/001_helpers.test.sql`). `010_tenant_isolation` then checks it for owners and techs automatically, and fails if a company table is unregistered.
- The device's SQLite database is the UI's source of truth. Every local write goes through the sync layer (row + outbox in one transaction). Never call Supabase directly from screens for synced data.
- Money is integer cents. IDs are UUIDv7 generated on the device.
- Sent reports and original photos are immutable.
- Secrets come from environment variables listed in `.env.example`. Never commit keys.

## Layout
- `apps/mobile` Expo field app. Add native packages with `npx expo install <pkg>` (run inside `apps/mobile`), never plain `pnpm add`, so versions match the SDK. Read `apps/mobile/AGENTS.md`.
- `apps/web` Next.js website: public pages, office view, customer pages, API. Read `apps/web/AGENTS.md`; this Next version differs from older training data.
- `packages/core` domain logic (no I/O), `packages/sync` client sync engine, `packages/tokens` generated from `brand/tokens.json` (`pnpm tokens`).
- `supabase/` migrations, `seed.sql`, pgTAP tests in `supabase/tests/`.

## Checks before every commit
`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:db`. Do not commit with failing checks, and never skip or disable a test to get green. CI (`.github/workflows/ci.yml`) runs the same, plus the web build.

`pnpm test:db` uses real Supabase in Docker when available (CI), otherwise local Postgres 16 with the shim in `supabase/test-shim/` (kept outside `supabase/tests/`, which `supabase test db` runs in full) (cloud sessions; `scripts/session-start.sh` installs pgTAP). Write SQL that works on both: only rely on `auth.uid()`, `auth.jwt()`, `auth.users`, and `storage.objects`/`storage.foldername()` from Supabase's schemas.

## Design review (Apple Design skill)
All app and website UI follows Apple's Human Interface Guidelines through the **apple-design** skill (`~/.claude/skills/apple-design`, installed by `scripts/session-start.sh` at a pinned commit; not committed because this repository is public and the skill reproduces Apple's text).
- Before building or changing a screen, load the skill (or read `~/.claude/skills/apple-design/SKILL.md`) and its always-load references.
- Before reporting a milestone with UI, review the new screens with it and fix Critical and High findings. Save the report in `docs/design/`.
- House rules from the reviews: body text 17 pt, secondary 15 pt; 44 pt minimum tap targets; control outlines `color.controlBorder`; segmented control (`Segmented`) for 2 to 5 related views or states, `Choice` for longer lists; Title Case for buttons, segment labels, alert buttons, and screen titles, sentence case elsewhere; orange only for the primary action.

## Brand assets
Logos and icons are generated: edit `brand/scripts/build_logo.py`, then run `python3 brand/scripts/build_logo.py` and `node brand/scripts/export_png.mjs`. Do not hand-edit files in `brand/logo/`.

## Hosted dev project
`config/supabase-dev.json` holds the public settings of `leakbook-dev`. In cloud sessions a network secret attaches a Supabase access token to `api.supabase.com/v1/projects/<ref>/` requests; direct Postgres connections are not possible.
- `pnpm db:deploy` applies pending migrations through the Management API (`-- --seed` also loads the demo data once). Run it after adding a migration, once local and CI checks pass.
- `pnpm test:hosted` syncs two simulated devices against the dev project as the demo tech, and uploads 30 photos and 2 videos to its storage with a simulated kill (about 16 MB per run; originals cannot be deleted). Not part of `pnpm test` or CI.
