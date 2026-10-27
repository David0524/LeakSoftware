# Five common bugs: audit and fixes (2026-10-26)

Owner request: audit all four platforms (website desktop and mobile, `apps/ios`, `apps/mobile`)
for five common bugs and fix what turned up. Everything below shipped on all four platforms with
the same wording, except where a platform has no such screen. The code was read, not run on a
device; what was run is listed at the end.

## 1. Taps that submit twice

**Checked.** Every `<form action>`, `SettingsForm` and `useTransition` handler on the website
(about 60 forms, 30 transition handlers, the customer pages' Accept / Pay forms, Stripe buttons),
every `Button` and `Pressable` on Android (174 `Button`s), the iPhone's async buttons (`busy` /
`sending` / `saving` flags in 35 models and views), and the server calls behind them: send report,
send invoice, send visit report, send receipt, send quote, texts, mass email, On My Way, record
payment, create job, invite a tech, Subscribe / Manage Billing.

**Found.**

- The sends logged to `message` (report, invoice, visit report, receipt) had no duplicate check: a
  request the phone repeats after a slow answer, or two taps, emailed the customer twice. The
  phone's retry queue (`reportQueue.ts`) makes this real, since it re-sends on 5xx and on no
  answer.
- Texts from the company number: same, no id of their own.
- Mass email: nothing stopped the same email going to every customer twice.
- Record Payment: a repeat of a partial payment made a second payment; a repeat of the payment
  that settled the invoice answered "Enter an amount up to the balance due" although the first
  had worked.
- Phones make a new id on every `sync.insert`, so the insert is not an upsert of one row: a
  second tap on New Job (customer, pool, job), a finding or a test made a second set of rows
  (Android and iPhone). (The outbox itself does upsert by id; the ids were the problem.)
- Website: `SettingsForm` relied on `pending` to disable its button, which redraws after the
  second tap can land; Enter in the Messages composer had no guard; Mark Complete turns into its
  own undo, so a double tap completed and reopened the stop.
- iPhone: `busy` was set at the start of the model methods but never checked, so two tasks both
  ran.

**Fixed.**

| Where | What |
| --- | --- |
| Server, `apps/web/src/server/send-once.ts` | `sendOnce` / `sentRecently`: the same job, channel, address and template, sent or delivered within two minutes, is answered as sent and not sent again; two requests at once on one server share one send. Used by `sendReport`, `sendInvoice`, `sendVisitReport` (email and the sms_device log) and `sendReceipt` (email and text), in `reports.ts`, `invoices.ts`, `visit-reports.ts`. Sending again on purpose later works as before. |
| Server, `server/texting.ts`, `/api/texts`, `actions/texting.ts` | `requestId`: a text sent twice with the same id is one text (the second answer is the first's); the id is reused only while a request never reached the server. Older apps without an id: the same words from the same person to the same conversation within 10 seconds. |
| Server, `server/mass-email.ts` | The same subject and body from the same shop within 10 minutes, or at once, is refused ("That email was just sent."). |
| Database, `20261022003300_payment_double_tap.sql`, test `860_payment_double_tap.test.sql` | `record_invoice_payment` returns the payment already recorded (same payment id, `duplicate: true`, `paid_now: false`) for the same invoice, amount, method and check number within 30 seconds, before the status and balance checks. |
| Website | `SettingsForm` ignores a second submit while one runs (ref, not just `pending`); `lib/tap-guard.ts` `useTapGuard` on Mark Complete; the Messages composer sends one id per message and ignores Enter while sending. |
| Android | `Button` (`ui/components.tsx`) runs once at a time: while an async `onPress` runs, and for 600 ms after any tap (`repeatable` for Previous / Next Item); New Job, Add Finding and Add Test keep what they made in a ref so a second tap saves it again instead of adding another; `data/texting.ts` sends a `requestId`. |
| iPhone | A guard at the top of the model / view methods that send, save, create or delete: `ReportFlow.run`, `InvoiceFlow.run`, `ReceiptForm.send`, `QuoteFlow.send`, `PhoneSettings.run`, Visit report send, On My Way, Sample job, Billing month, Delete account / customer, My Mobile Number, Settings save, the sign-in, sign-up, code and invite buttons, Start Plan; New Job saves once per screen; the Finding and Test editors close on the first save; `TextingServer.send` sends a `requestId`. |

**Left, and why.**

- Website creates with server-made ids (New Job, a team invite) rely on the disabled button and
  the new ref, not a server key; a key would change the `create_*` function signatures.
- Two sends in the same instant on two serverless instances can both pass the log check; the
  log catches everything else, and the buttons catch the rest.
- A corrected report sent to the same address within two minutes of the first is treated as the
  same send; the first email's link opens the newest version (`report_for_token`'s `newer_token`).
- Android `Pressable`s that are not `Button`s (rows, icon buttons) have no tap lock; none of them
  creates a row on the server.
- The iPhone guards have no Swift unit tests (Swift was not built here; CI builds it).
- Stripe Checkout opened twice makes two sessions; only one can be paid, so nothing was changed.

## 2. Raw error text on screen

**Checked.** Every place that shows `error.message`, `String(describing: error)`,
`"\(error)"`, `localizedDescription`, `String(e)`, a server `error` field or "The server said N."
(about 110 on the iPhone, 50 on Android, 80 on the website, 20 server routes).

**Found.** Raw text reached people from: database messages (`duplicate key value violates…`,
`new row violates row-level security…`, `JWT expired`), the browser (`Failed to fetch`), the
system (`The operation couldn’t be completed… NSURLErrorDomain`, decoding errors), providers
(Twilio's message after "Not sent:", Stripe's after "Stripe said:", the email provider's after
"the email failed:"), "The server said 500." and, from the phone routes, any thrown error's
`message`.

**Fixed.**

- One list per platform, in the same order and words, checked by the same fixtures:
  `packages/core/src/friendly-error.ts` (`friendlyError`, `knownFriendlyError`), ported to
  `SundeckCore/FriendlyError.swift` (`friendlyError`, `userMessage(error)`; fixtures
  `friendly-error.json`, 47 cases). Our own sentences pass through unchanged; anything a rule
  knows becomes a plain line ("No connection. Check your signal and try again.", "Your sign-in
  expired. Sign in again to continue.", "That already exists.", "Something went wrong on our end.
  Try again in a moment."); a code name or a wall of text becomes "Something went wrong. Try
  again."
- Website: `friendlyDbError` calls it; `orOffline` (every `SettingsForm`), `Notice` / `Banner`
  with an error string and the 90 `{ error: x.message }` action results use it; server routes
  answer through `failureMessage` (`server/failures.ts`; new `Fault` class for our own worded
  faults) and `jsonError`, which log the raw text on the server and send the plain line; the
  "email failed: <provider text>" messages no longer carry the provider's words; Twilio's and the
  carrier's text errors map to "This customer has opted out of texts." / "That isn’t a number we
  can text." / "The text couldn’t be sent. Try again."
- Android: every `e instanceof Error ? e.message : String(e)` and every `Alert` / banner that
  showed `error.message` goes through `friendlyError`; `call()` and the other `fetch` helpers map
  the server's text; Supabase sign-in errors fall back to it.
- iPhone: all `String(describing: error)` / `"\(error)"` in `SundeckApp` became
  `userMessage(error)`; `WebAPI.Failure` carries the plain line (the server's own text still goes
  to Usage); PostgREST errors on Auth, Customers, Invoices and Billing go through it; the Sync
  page's "Last error" lines too.
- The Admin portal's Usage still records the raw text, on purpose.

**Left.** The staff Admin portal (`components/admin`) shows its own errors as they are. Our own
sentences are trusted: a wrong or unhelpful sentence we wrote is not caught by this.

## 3. Keyboard covers fields

**Checked.** iPhone: scroll views, sheets, the bottom bars (`bottomBar`, `SaveBar`, the Next
Step bar, the Chemicals bar, the Messages composer). Android: `Screen`, `ModalSheet`, the job
page's own scroll view, `KeyboardAvoider`. Website: every fixed or sticky bottom element,
`vh` / `dvh` use, the sheet and the search sheet.

**Found.**

- Website: the browser keyboard does not shrink the page, so bottom sheets (`Sheet`, 22 of them,
  including every settings edit) and the search sheet kept their last field and their pinned Save
  under the keys. The tab bar, Next Step bar and Save bar already hide while typing.
- Android: `KeyboardAvoider` shrinks the page but a field already near the bottom stayed where it
  was under the keyboard (nothing scrolled it up), and the drawn sheet's panel could not shrink,
  so with a tall form its title bar (Cancel, Save) rode off the top of the screen.
- iPhone: the system moves fields, and the bars hide or sit above the keyboard by design;
  sheets and pushed forms without `scrollDismissesKeyboard` could not put the keyboard away by
  dragging.

**Fixed.**

- Website: `components/keyboard-inset.tsx` (mounted in the root layout) sets `--kb-inset` and
  `--vv-height` from the visual viewport; `Sheet` and the search sheet pad their bottom by the
  first and cap their height by the second (`keyboardInset` is unit tested).
- Android: `useKeepFieldVisible` (`ui/keyboard.tsx`) scrolls the focused field into view once
  the keyboard has opened and when focus moves (`Field` announces focus); used by `Screen`,
  `ModalSheet` and the job page; the sheet panel now `flexShrink: 1`, so its title bar stays on
  screen and the form scrolls inside.
- iPhone: `scrollDismissesKeyboard(.interactively)` at the app root and in `sheetPresentation`,
  so every form, list and sheet puts the keyboard away when dragged.

**Left.** None of this was run on a device: the iPhone's own field scrolling is SwiftUI's and
was left alone, and the Android and website changes need a look with a real keyboard.

## 4. Dark and light mode

**Checked.** Hardcoded colors (`white`, `black`, `#fff`, `rgb()`) in the website, Android and
iPhone UI; colors baked into Android `StyleSheet`s at load; logos; customer pages. A temporary
page rendered the shared controls on the website in both modes at phone width (screenshots in
`/tmp/claude-0/-home-user/fbceb547-2d2c-5f9d-9a74-937e65983285/scratchpad/bugs5/`, looked at, not
committed); the page was deleted afterwards.

**Found.**

- Dark mode's link and status colors are light (`link` #6AAEE6, `pass` #3FB36F, `warning`,
  `fail`), but white text sat on them in filter chips, selected chips, day chips, checklist
  badges, check circles, swipe actions (Done / Edit / Move / Delete / Hide) and the top banner's
  icon (website), and on the iPhone's Day Map stop number, work-day chips, swipe-delete and
  check marks: about 2.4:1. The tokens already have `onStatus` for this (white in light, navy in
  dark).
- Android: seven `StyleSheet.create` entries read `color.*` once at load (swipe actions, the
  brand header, the sign-up link, sample report logo, brand color swatch, visit chemicals'
  suggestion), so a change of Appearance left them in the old colors until a restart.
- Customer pages (`/q`, `/i`, `/r`, `/stop`, sign-off, unsubscribe, weekly summary) followed the
  Appearance of the browser they are opened in. Their report, quote and invoice colors are the
  light ones (fixed borders, tones and neutrals), so a shop owner in Dark previewing a link saw a
  half-dark document.
- Logos: both the website, Android and the iPhone already switch to the reverse lockup.
- There is no Auto setting: Appearance is Light or Dark, Light by default, whatever the device
  says (owner, 2026-10-13); not changed.

**Fixed.** `text-on-status` / `Color.onStatus` on those elements (website: `ui.tsx`,
`inspection-checklist.tsx`, `visit-chemicals.tsx`, `day-map.tsx`, `getting-started*.tsx`,
`scheduling-settings.tsx`, `swipe-row.tsx`, `top-banner.tsx`; iPhone: `DayMapViews`,
`ShopSettingsPages`, `SwipeDeleteRow`, `DayRing`); the seven Android styles now take their color
while rendering; the customer pages have a layout with `LightOnly` and the theme script's
light-only paths include them, so they are always light and print as before.

**Left.** The emails customers get (mail clients decide); uploaded shop logos shown on dark
office pages (a dark logo on dark gray; the logo field has no dark variant); I could only render
shared controls, not signed-in office pages, in dark; the iPhone's pool diagram pin labels
(white on the owner's severity color) were left, since they belong to the diagram work in
progress.

## 5. Back deletes what was typed

**Checked.** The website's Discard guard (`discard-guard.tsx`, `dirty.ts`, `sheet.tsx`) and every
component with inputs outside a `<form>`; Android's `useDiscardChanges` / `useUnsavedChanges`
and every `ModalSheet` with fields; the iPhone's `discardOnBack` / `discardPrompt` / sheet
`dirty` coverage per screen with a text field. Sign-in, sign-up and password forms stay without a
question (owner, 2026-10-25).

**Found.** The guard covers every page form and every sheet on the website, Android's job, test,
finding, customer, invoice, quote, settings and message editors, and the iPhone's. Gaps: Email
Customers on all three (a typed subject and message vanished on Back; the website's fields are
not inside a `<form>`), and the Android Add Additional Repair sheet (typed fields, no question).

**Fixed.** Website: the Email Customers message is a `<form>` (Enter sends nothing), so the guard
asks and a sent message (fields cleared) asks nothing; Android: `useDiscardChanges` on Email
Customers, and `UnsavedWhen` (new, `ModalSheet.tsx`) on the Add Additional Repair sheet; iPhone:
`discardOnBack(dirty:)` on Email Customers.

**Left.** Fields that save by themselves are excluded on purpose. Small pickers with one typed
value (the brand color hex, a date field) and sheets whose text is re-typed in seconds (Send
Receipt's address) do not ask. Update 2026-10-27: typed text is now also kept as a local draft
and put back when the same form opens again (website, iPhone, Android; see DECISIONS.md, "Fix
the draft text"), so a killed app or a closed tab no longer loses it. Still not kept: files and
photos, passwords, choices (pickers, switches, dates) and fields that save by themselves.

## Checks run

- `pnpm format:check` (only `video-delivery`, `chem-preview`, `dialog-preview` warn, as before),
  `pnpm lint`, `pnpm typecheck`: clean.
- `pnpm --filter` tests: core 704, web 357, mobile 285, ios fixtures 39 (47 new friendly-error
  cases), all passing; new tests: `friendly-error.test.ts`, `send-once.test.ts`,
  `keyboard-inset.test.ts`, `failures.test.ts` (extended), `FriendlyErrorTests.swift`.
- `SYNC_SKIP_SWIFT=1 pnpm test:db`: 95 files, 2142 assertions, 0 failing (new
  `860_payment_double_tap.test.sql`).
- `swift format lint --strict` on `Sources`, `Tests` and `Package.swift`: clean. `FriendlyError.swift`
  was also compiled on its own with `swiftc` and run against the fixture file (47 of 47 match).
  The rest of the Swift was not built; CI builds it.
- Not run: e2e, the iPhone build and tests, any device.
