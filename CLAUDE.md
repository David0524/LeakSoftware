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
- Every business table has `company_id` and RLS. Every new table gets pgTAP isolation tests in the same change.
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

`pnpm test:db` uses real Supabase in Docker when available (CI), otherwise local Postgres 16 with the shim in `supabase/tests/shim/` (cloud sessions; `scripts/session-start.sh` installs pgTAP). Write SQL that works on both: only rely on `auth.uid()`, `auth.jwt()`, `auth.users`, and `storage.objects`/`storage.foldername()` from Supabase's schemas.

## Brand assets
Logos and icons are generated: edit `brand/scripts/build_logo.py`, then run `python3 brand/scripts/build_logo.py` and `node brand/scripts/export_png.mjs`. Do not hand-edit files in `brand/logo/`.
