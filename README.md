# Sundeck Pro

Field inspection, reporting, quoting and invoicing software for pool leak detection companies.

- `apps/mobile` – Expo field app for techs.
- `apps/web` – Next.js website: public pages, office view, customer report/quote/payment pages, API.
- `packages/` – shared domain logic (`core`), sync engine (`sync`), design tokens (`tokens`).
- `supabase/` – database migrations, seed data, pgTAP tests.
- `brand/` – brand guide (`BRAND.md`), design tokens, fonts, logo files and the scripts that build them.
- `docs/` – requirements (`HANDOFF.md`), build plan (`BUILD_PLAN.md`), decisions log.

Start with `CLAUDE.md` and `docs/BUILD_PLAN.md`.

## Development

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test   # all checks
pnpm test:db                                                     # migrations + pgTAP
pnpm --filter @leakbook/web dev                                  # website at localhost:3000
cd apps/mobile && npx expo start                                 # field app
```
