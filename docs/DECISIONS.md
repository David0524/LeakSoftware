# Decisions log

Newest first. Each entry: date, decision, reason.

## 2026-10-12 (M5 media)
- **Uploads are resumable (TUS) for every file**, not only those over 6 MB. One code path; the upload URL is saved on the phone, so an app killed mid-upload continues from the last confirmed 6 MB chunk. Uploads never overwrite: if an earlier attempt finished but the phone did not hear back, the server answers "already exists" and that counts as done. Verified against the dev project's real storage (`pnpm test:hosted`, which leaves about 16 MB per run in the dev bucket because app users cannot delete originals).
- **Video quality: the camera's medium preset for now** instead of `react-native-compressor` (BUILD_PLAN 4.5). The compressor needs a development build; Expo Go (how the owner tests today) cannot load it, and full-quality iPhone video passes Supabase's 50 MB per-file limit in well under a minute. Medium keeps a 60-second clip far below the limit, at visibly lower resolution. **Revisit when we switch to a development build** (also needed for encrypted storage): compress to 720p with the compressor. Files over 50 MB are refused at capture with a message.
- **Photos are re-encoded on the phone** (2048 px long edge, JPEG 0.7). This also turns HEIC into JPEG and drops EXIF; the capture time and GPS are stored on the media row instead, and the SHA-256 is of the saved file.
- **Markup is vector JSON** (arrows, circles, text; positions as fractions of the photo; three colors: red, yellow, white, each drawn with a black outline). Unknown shapes are ignored, never an error, so later shape types do not break older phones.
- **Photos attach to the job, a component, a finding, or a test.** On a new finding or test the section asks to save first, so a capture never points at a record the server has not seen.
- **Voice-note transcription runs on the website** (`POST /api/media/{id}/transcribe`, Deepgram nova-3), called by the phone after the audio uploads. The server writes the transcript (devices cannot); it reaches phones through normal sync. **Dormant until the website is deployed** (M6/M7) with `DEEPGRAM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `EXPO_PUBLIC_API_URL` set; until then voice notes show "Not transcribed yet".
- **Local files are kept after upload** so the job works offline; they are deleted on sign-out. Clearing old local files (for example, jobs older than 30 days) is deferred to M11.
- **Upload triggers:** after each sync, after each capture, when the network comes back, and from Settings → Sync Now. Background uploads while the app is closed (`expo-background-task`) are deferred until the development build.
- **Fixed:** the sync package's unit-test run also ran the hosted tests against the dev project (including in CI). Hosted tests now run only through `pnpm test:hosted`.

## 2026-10-12 (Apple Design skill)
- **Owner asked to follow the Apple Design skill** (HIG-based review) for the app's look now and going forward. It is installed per session by `scripts/session-start.sh` at a pinned commit, not committed: the repository is public and the skill reproduces Apple's guideline text.
- **First review applied** (`docs/design/2026-10-12-field-app-review.md`): iOS default type sizes (17/15), stronger control outlines (5.7:1), segmented controls for view and state switching, 44 pt tap targets, consistent "Excluded" wording, and Title Case for buttons, segment labels, and titles (sentence case elsewhere).
- **Kept on purpose:** the field app stays light-only for sunlight readability (trade-off against HIG dark-mode guidance, documented in the review).

## 2026-10-12 (M4 inspection)
- **Thresholds are test-type settings** (`field_schema.options`), editable per shop later in M6. First drafts to confirm with the design partner: a pressure test passes only with **no drop** over **at least 15 minutes**; a bucket test fails above **1/4 inch per 24 hours** of loss beyond evaporation. Rising pressure is "unclear", not a pass.
- **The app suggests an outcome; the tech decides.** Changing the suggestion prompts for a note. Dye and listening tests have no calculator; the tech picks the outcome.
- **New jobs get their checklist when created** (offline, in the same save). Jobs created elsewhere (office, demo data) show "Set up checklist".
- **Diagram:** five shape presets (rectangle, oval, kidney, L-shape, freeform) and an attached spa, drawn from shared code so reports match the phone. Pins are stored as fractions of the diagram. **Placing component icons (skimmers, returns) on the diagram is deferred** until the design partner says it helps; pins carry the information that matters.
- **Removing a component** is allowed (soft delete) for instances added by mistake; tests and findings keep their own records.

## 2026-10-12 (M3 accepted)
- **M3 passed the owner's device test** on an iPhone with Expo Go. The server shows jobs #1012 and #1013 created on the phone, and an offline batch (a cancel plus a new customer, property, and job) arriving together after reconnecting.
- **Bug found and fixed:** job notes saved only when the field lost focus, which often does not happen on iPhone. Notes now save shortly after typing stops and when leaving the screen.

## 2026-10-12 (M3 field app shell)
- **Dev project auth:** accounts confirm automatically (`mailer_autoconfirm`) so testing needs no email round trip; passwords need 10+ characters; redirect URLs allow `leakbook://`, `exp://`, and localhost. **Production must keep email confirmation on.**
- **Signed-in state is kept on the device**, separate from the Supabase token. An expired token offline never locks a tech out; sync pauses and Settings offers "Sign in again" without touching local data. Signing in as a different account clears the previous account's data first.
- **Sign-in in the app is email and password.** Magic links move to the website (M6), where they fit better.
- **Teammates' names** come from `profile` (not a synced table) and are cached on the phone after each sync.
- **Encryption:** SQLCipher is on in the app config, with the key in the device keychain. Expo Go cannot encrypt; dev and production builds do. Settings shows which applies.
- **Sync window (12 months) deferred to M11** performance work. Phones pull all company records; fine for small shops.
- **Public Sans static weights** (Regular, Medium, SemiBold, Bold) generated from the variable font, because React Native on iOS does not reliably select weights from a variable font.

## 2026-10-12 (dev Supabase project)
- **Dev project:** `leakbook-dev` (ref `evmxdfasurkaxbwkceti`, us-west-2). Public settings are committed in `config/supabase-dev.json`.
- **Cloud environment access** is a Network secret: a Supabase personal access token sent only to `api.supabase.com` under `/v1/projects/evmxdfasurkaxbwkceti/`. Migrations reach the dev project through the Management API (`POST .../database/query`), because this environment cannot open direct Postgres connections. The secret/service_role key is not in the environment, so tests from here always go through RLS.

## 2026-10-12 (M2 sync engine)
- **Device storage is one JSON table, not a typed schema per table.** Every synced server table lives in `sync_records` (table, id, company, JSON row). A server schema change never needs a phone database migration, which matters for an app people may not update for months. Screens read through `LocalStore.get/list`; typed wrappers come in M3. Replaces "Drizzle ORM for typed schema and migrations" in BUILD_PLAN section 2.
- **Field clocks and the audit log are kept by database triggers on every write**, not only by `sync_push`. Office web edits and server code therefore take part in last-writer-wins and are audited too. `sync_push` runs as the caller (RLS and column grants apply) and passes the device's clocks to the trigger through a transaction-local setting.
- **A device clock more than 5 minutes ahead of the server is clamped**, so a phone with a wrong date cannot win every future conflict.
- **Rejected changes are kept on the phone as "problems"**, shown to the user, and not retried. The user can discard one to restore the server value.
- **Deferred to M3:** the 12-month sync window (phones currently pull all company records; fine for small shops) and pulling teammates' profiles (names) for display.

## 2026-10-12 (owner: "make your own call for now, adjust later")
- **Product shape:** a website and an app. The website covers a public marketing page with signup, the office view, and customer report/quote/pay pages. The app is the tech's field app. A public home page with signup is added to M6 (layout) and M10 (signup flow).
- **Fixed costs:** approved. Reasonable fixed monthly costs (around $65/mo) are fine.
- **Texting:** v1 sends from the tech's own phone (share sheet / prefilled SMS). Twilio later.
- **Stripe:** Connect with Standard accounts and direct charges. The shop is merchant of record.
- **Sales tax:** one configurable rate per company, taxable flag per line item. Default 0% until set.
- **Deposit:** default 50% of the quote total, configurable per company (percent or fixed, with a minimum).
- **On-site signatures:** support inspection acknowledgment, work authorization, quote acceptance, and completion. Inspection acknowledgment and quote acceptance on by default.
- **LeakBook pricing (placeholder):** flat price per shop per month, up to 5 techs, 30-day free trial. Final price after the design partner pilot.
- **Domain:** placeholder `leakbook.com` (app) and `send.leakbook.com` (email) in config only. Owner confirms availability before purchase.
- **Apple account:** company developer account (needs a D-U-N-S number).
- **Tooling:** TypeScript 6.0 (typescript-eslint does not support 7 yet), pnpm 10 workspaces, ESLint 9 (eslint-plugin-react, used by both the Next and Expo configs, does not support ESLint 10 yet). Expo SDK 57, Next.js 16.4.
- **Database tests:** real Supabase in Docker in CI; local Postgres 16 + a small Supabase shim where Docker is unavailable (cloud sessions). CI is authoritative.

## 2026-10-12
- **Build plan drafted** (`BUILD_PLAN.md`). Owner approval pending, including the open decisions in its section 10.
- **Scope goes beyond the MVP:** add simple scheduling, reminders, review requests, light warranty tracking, basic owner dashboard, and shop signup with LeakBook billing. Insurance template, partner portal, and QuickBooks wait. Dispatch/routing, payroll, inventory, and accounting are out.
- **Logo:** drop-pin mark, concepted in ChatGPT and rebuilt as exact geometry (`brand/scripts/build_logo.py`).
- **Brand:** name LeakBook; "Work Truck" palette (navy, water blue, safety orange); Barlow Semi Condensed + Public Sans. Primary buttons use navy text on orange for contrast in sun.
