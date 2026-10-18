# Sundeck Pro

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
  2. Register it in `app.sync_table` with read/write roles and client-writable columns, and generate its policies and grants the same way `20261012000600_access.sql` does. Never grant by hand. Then `select app.speed_up_policies();` so its policies check membership once per query, not per row (`280_fast_row_security` fails until you do).
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
Run the checks the change can affect (owner, 2026-10-14):
- Always: `pnpm format:check && pnpm lint && pnpm typecheck`.
- Code with logic (web, app, core, sync): add `pnpm test`.
- SQL, migrations, `seed.sql`, or `supabase/tests/`: add `pnpm test:db`.
- Layout and wording only: the first line is enough.

Do not commit with failing checks, and never skip or disable a test to get green. CI (`.github/workflows/ci.yml`) runs everything on every push, plus the web build and Playwright. Don't wait for it after pushing; check its result before the next push and fix anything red first. Wait for a green CI only before `pnpm db:deploy`.

`pnpm test:db` uses real Supabase in Docker when available (CI), otherwise local Postgres 16 with the shim in `supabase/test-shim/` (kept outside `supabase/tests/`, which `supabase test db` runs in full) (cloud sessions; `scripts/session-start.sh` installs pgTAP). Write SQL that works on both: only rely on `auth.uid()`, `auth.jwt()`, `auth.users`, and `storage.objects`/`storage.foldername()` from Supabase's schemas.

## Design review (Apple Design skill)
All app and website UI follows Apple's Human Interface Guidelines through the **apple-design** skill (`~/.claude/skills/apple-design`, installed by `scripts/session-start.sh` at a pinned commit; not committed because this repository is public and the skill reproduces Apple's text).
- **Every new page must feel like iOS, not Android** (owner, 2026-10-16), on the website and in the app. Plan it with iPhone/Swift conventions: navigation bar with large title, inset grouped lists, sheets and action sheets, swipe actions (with a visible alternative), segmented controls, switches, and iOS wording. No Material patterns (floating buttons, snackbars, outlined Android fields) on iPhone; the app's Android build keeps its own look.
- Use it to plan: before building a new screen or flow, load the skill (or read `~/.claude/skills/apple-design/SKILL.md`) and its always-load references, and settle layout, controls, and wording up front.
- No review after every milestone (owner, 2026-10-13). One full review of all screens happens before the pilot (the M11 accessibility pass); fix Critical and High findings and save the report in `docs/design/`.
- House rules from the reviews: body text 17 pt, secondary 15 pt; 44 pt minimum tap targets; control outlines `color.controlBorder`; buttons, chips, and status labels are pills, content sits on soft cards (`.card`, no outline), and contact actions are round icon buttons; segmented control (`Segmented`) for 2 to 5 related views or states, `Choice` for longer lists; Title Case for buttons, segment labels, alert buttons, and screen titles, sentence case elsewhere; primary buttons are filled blue with white text (`bg-primary`); orange is a brand accent (logo, a display highlight, the marketing site's Start Free Trial, one per screenful).

## Brand assets
Logos and icons are generated: edit `brand/scripts/build_logo.py`, then run `python3 brand/scripts/build_logo.py` and `node brand/scripts/export_png.mjs`. Do not hand-edit files in `brand/logo/`.

## Hosted dev project
`config/supabase-dev.json` holds the public settings of `leakbook-dev`. In cloud sessions a network secret attaches a Supabase access token to `api.supabase.com/v1/projects/<ref>/` requests; direct Postgres connections are not possible.
- `pnpm db:deploy` applies pending migrations through the Management API (`-- --seed` also loads the demo data once). Run it after adding a migration, once local checks and CI on that commit pass.
- `pnpm test:hosted` syncs two simulated devices against the dev project as the demo tech, and uploads 30 photos and 2 videos to its storage with a simulated kill (about 16 MB per run; originals cannot be deleted). Not part of `pnpm test` or CI.
- `pnpm --filter @leakbook/web test:e2e` runs the website's Playwright tests (CI runs them against Supabase in Docker). Here: `NODE_USE_ENV_PROXY=1 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` against the dev project after `next build`; each run leaves one turned-off test tech.
