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

## Checks before every commit
`pnpm lint && pnpm typecheck && pnpm test` (plus `pnpm test:db` once M1 exists). Do not commit with failing checks, and never skip or disable a test to get green.

## Brand assets
Logos and icons are generated: edit `brand/scripts/build_logo.py`, then run `python3 brand/scripts/build_logo.py` and `node brand/scripts/export_png.mjs`. Do not hand-edit files in `brand/logo/`.
