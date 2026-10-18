# The field app in Swift (plan, 2026-10-18)

**Approved 2026-10-18** with every recommendation; the Expo app keeps getting fixes (DECISIONS). Originally for the owner to approve before any Swift code was written (DECISIONS, 2026-10-18: "I am going to
have you build this app in Swift"; Android is a separate app). Until it is approved, the Expo app
in `apps/mobile` stays as it is.

## What changes and what doesn't

Only the iPhone app is rebuilt. Everything it talks to stays the same:

- **Unchanged:** the database, its migrations, RLS and the sync functions (`sync_push`,
  `sync_pull`); Supabase Auth and Storage; the website and its API (reports, quotes, invoices,
  transcription, texting); the sync rules in BUILD_PLAN section 4 (outbox, field-level last
  writer wins by HLC, transaction-ID pull cursor, 90-day window, soft deletes, originals never
  changed). No server change is planned; if the port finds one is needed, it is raised first.
- **Rebuilt in Swift:** the screens (`apps/mobile/src`, about 11,600 lines), the sync engine
  (`packages/sync`, about 1,200 lines), and the parts of `packages/core` the app uses
  (calculators, totals, verdicts, chemistry, markup, signatures, labels and formatting; about
  100 functions and types). `packages/core` stays in TypeScript for the website.
- **Same app to the outside:** bundle ID `com.sundeckpro.app`, link scheme `sundeckpro`, name,
  icon, permission wording, App Store listing. The Swift app ships as an update of the same app.

## Decisions for the owner

1. **Launch timing.** The Expo app is built and tested but has never been on a phone (no EAS
   build yet). The Swift app needs every screen rebuilt and its sync engine proven again.
   - **Recommended:** run the pilot on the Expo app once enrollment is active (EAS builds in the
     cloud, no Mac needed), and build the Swift app beside it. It replaces the Expo app as an App
     Store update when it passes S9 below. The pilot then never waits on the rewrite, and the
     Swift app is checked against an app the design partner already uses.
   - Alternative: hold the pilot until the Swift app is done. Nothing is built twice for users,
     but launch moves by the whole rewrite.
2. **Android meanwhile.** Recommended: the Expo app stays as the Android app, with no new
   features, until the separate Android plan says otherwise. It shares the server, so it keeps
   working.
3. **Oldest iOS supported.** Recommended: **iOS 18** (iPhone XS / XR from 2018 and later). It
   gives current SwiftUI (Observation, navigation, scroll and sheet APIs) without workarounds.
   iOS 17 would add few phones and some workarounds.
4. **Encrypting the phone's database.** Recommended: keep **SQLCipher**, as today. It is also
   needed to read the Expo app's encrypted database when a phone updates (below). Fallback if
   it can't be built cleanly: iOS Data Protection on the database file, which encrypts it while
   the phone is locked.
5. **One set of business rules in two languages.** Recommended: port the rules the app uses to
   Swift and keep them in step with test fixtures generated from the TypeScript code (below).
   The alternative, running the TypeScript code inside the Swift app through JavaScriptCore,
   avoids the port but brings back a JavaScript layer and makes debugging harder.
6. **Building for iPhone in CI.** Recommended: GitHub's macOS runners (free for public
   repositories) build the app, run its tests in the iPhone simulator, and later upload to
   TestFlight with the App Store Connect API key. Cloud sessions keep using xtool to build
   `.ipa` files for Sideloadly. xtool alone in CI would need a copy of Xcode in CI, which
   Apple's license doesn't allow us to store.
7. **New field features during the rewrite.** Recommended: features the owner asks for go into
   the website first (as today) and into the Swift app's milestone list; the Expo app gets fixes
   (owner: "I want the expo app to get fixes too") but not new features. Otherwise the rewrite chases a moving target.

## Layout

```
apps/ios/
  Package.swift          SwiftPM: libraries below + the app
  xtool.yml              bundle ID, app info, permissions (xtool builds)
  Project/               Xcode project for macOS CI and TestFlight (generated, see S0)
  Sources/
    SundeckCore/         domain rules ported from packages/core. No I/O. Builds on Linux.
    SundeckSync/         HLC, outbox, store protocol, push and pull, uploads, TUS. Builds on Linux.
    SundeckStorage/      SQLite (SQLCipher on iPhone, system SQLite on Linux) behind the store protocol
    SundeckTokens/       generated from brand/tokens.json by `pnpm tokens`
    SundeckApp/          SwiftUI screens, iPhone only
  Tests/
    SundeckCoreTests/    incl. fixture tests against the TypeScript results
    SundeckSyncTests/    unit tests + two-device integration tests against local Postgres
    SundeckAppTests/     view models; UI tests run in the simulator on macOS CI
```

The libraries build and test on Linux, so cloud sessions run `swift test` on everything but the
screens, the same way they run `pnpm test` today. `pnpm` scripts wrap them (`pnpm test:ios`).

## How each piece maps

| Today (Expo) | Swift |
|---|---|
| expo-router, tabs, stacks | `NavigationStack`, `TabView`, sheets, large titles |
| expo-sqlite with SQLCipher | SQLite C API through a small wrapper, SQLCipher on iPhone (the store is one JSON table, M2 decision, so no ORM) |
| expo-secure-store | Keychain |
| supabase-js | supabase-swift (Auth, RPC, Storage) |
| expo-image-picker, image-manipulator | camera (`UIImagePickerController` or AVFoundation), ImageIO to resize to 2048 px |
| video compression | `AVAssetExportSession`, 60-second cap |
| expo-audio | `AVAudioRecorder`, `AVAudioPlayer` |
| expo-video | AVKit `VideoPlayer` |
| expo-location | CoreLocation |
| expo-crypto (SHA-256, UUIDv7) | CryptoKit; UUIDv7 ported |
| NetInfo | `NWPathMonitor` |
| background upload task | `URLSession` background uploads (they continue after the app is closed, an improvement) and `BGTaskScheduler` |
| react-native-svg (pool diagram, markup, signature) | SwiftUI `Canvas` and `Path` |
| gesture handler, reanimated, SwipeRow | SwiftUI gestures, `.swipeActions` (with a visible alternative) |
| expo-haptics | `.sensoryFeedback` |
| expo-symbols, vector icons | SF Symbols |
| Sentry React Native | sentry-cocoa |
| `fetch` to the website API | `URLSession` with the session's access token, same endpoints |
| `@leakbook/tokens` | generated Swift colors, type sizes and spacing |

House rules (CLAUDE.md) carry over and get easier: 17 pt body, 44 pt targets, inset grouped
lists, segmented controls, sheets and action sheets, pills, soft cards, Title Case buttons. Each
screen is planned with the apple-design skill before it is built, as for any new screen.

## Keeping Swift and TypeScript in agreement

- `pnpm fixtures:swift` runs the TypeScript rules over a set of inputs and writes the results to
  `apps/ios/Tests/Fixtures/*.json`: bucket and pressure tests, verdict tallies, quote and invoice
  totals, deposits, discounts, chemistry doses, markup shapes, signature paths, formatting of
  money, phones, durations and schedules, new-job validation. The Swift tests read the same
  files and must match. CI fails when the fixtures are out of date, so a change to a rule in
  `packages/core` shows up as a failing Swift test until the Swift rule follows.
- **Sync:** the Node integration scenarios (`packages/sync/test/integration`: offline edits,
  conflicting edits, retries after network failure, deletes, the history window, the inspection
  run) are ported to Swift and run on Linux against the same local Postgres as `pnpm test:db`.
  One extra test runs a TypeScript device and a Swift device against the same database and
  checks they end in the same state with a complete audit log, which is what proves the two
  engines agree.

## Phones that update from the Expo app

If anyone uses the Expo app before the switch (decision 1), their phone may hold changes not yet
sent when the update arrives. The Swift app, on its first start, looks for the Expo app's
database, opens it with its key from the Keychain, and moves the sync cursor, the rows, the
outbox, the upload queue and the media files into its own database. Nothing is deleted until the
move is checked. This is tested in S9 by installing an Expo build, working offline, then
installing the Swift build over it.

## Milestones

Same rules as BUILD_PLAN section 8: each ends with checks green, a commit, a report to the owner,
and a stop until the owner says go.

### S0 Toolchain proof

Built 2026-10-18 (`apps/ios`): SQLCipher (skiptools/swift-sqlcipher, from source, so it builds on
Linux too), supabase-swift and sentry-cocoa build with xtool and with Xcode (CI `ios-linux` and
`ios-macos`); tests cover the encrypted file and sign-in with a first sync page against the dev
project. Waiting on the owner's install check; the Sentry test error waits on a Sentry DSN.
- `apps/ios` package and a one-screen app that opens an encrypted SQLite database, signs in to
  the dev project with supabase-swift, and reports a test error to Sentry.
- Built with xtool in a cloud session and with Xcode on a macOS CI runner; CI runs `swift test`
  on Linux.
- **Done when:** the `.ipa` installs with Sideloadly and signs in on the owner's iPhone, the
  macOS CI job is green, and SQLCipher, supabase-swift and sentry-cocoa all build both ways (or
  a fallback is proposed for any that doesn't).

### S1 Core rules
- `SundeckCore`: the rules and types listed above, with `pnpm fixtures:swift` and the fixture
  tests.
- **Done when:** every fixture matches on Linux and macOS, and CI fails on stale fixtures.

### S2 Sync engine
- `SundeckSync` and `SundeckStorage`: HLC, outbox with merged patches, push in batches of 200,
  paged pull with the pending-overlay, rejected changes kept as problems, clock clamp handling,
  history window, upload queue and TUS for files over 6 MB.
- **Done when:** the ported two-device scenarios and the TypeScript-and-Swift device test pass
  against local Postgres in CI.

### S3 App shell
- Sign in (cached session offline, two-step sign-in, reauth), company context, sync bar (synced,
  pending count, problems), Today and jobs list, new customer, pool and job offline, job page
  shell, settings basics, the welcome cards.
- **Done when:** BUILD_PLAN M3's test passes on the owner's iPhone with the Swift app: in
  airplane mode sign in, create a customer, pool and job, close the app, reopen, see it; turn
  the network on and it syncs.

### S4 Inspection
- Checklist with sections, one-tap verdicts and "where", component screens; tests with the
  calculators; findings with severity and pins on the pool diagram and shape picker.
- **Done when:** BUILD_PLAN M4 and M8.5's phone samples (27 items, two techs, one leak
  repaired on site, 5 pressure tests, 1 bucket test, 2 findings with pins) are done offline and
  sync correctly.

### S5 Media
- Photo and video capture, compression, markup over the unchanged original, SHA-256, GPS, voice
  notes and transcription, background uploads.
- **Done when:** BUILD_PLAN M5's test passes: 30 photos and 2 videos offline upload after
  reconnecting with no duplicates, including when the app is closed mid-upload.

### S6 Reports, signatures, sending
- Signatures by purpose, the report tab (draft, review, send by email or text), report links
  and PDF, the review screen.
- **Done when:** the sample job's report is signed and sent from the Swift app and opens on
  the website the same as one sent from the Expo app.

### S7 Quotes and invoices
- Quote builder from findings and the price book (offline), discounts within the limit, send;
  invoices, deposits credited, share.
- **Done when:** a quote built and sent from the Swift app is accepted and its deposit paid in
  Stripe test mode, and the job is invoiced and paid.

### S8 Everything else in the app
- Routes and Today (Open in Maps, On My Way, Call), maintenance visits with Mark Done, the
  chemicals calculator, Messages (list, thread, new), the rest of Settings, tips.
- **Done when:** each screen in `apps/mobile/src/app` has a Swift counterpart, checked against
  the M10.5 and M10.6 device checklists.

### S9 Switch-over
- The move from the Expo app's database, accessibility (Dynamic Type, VoiceOver, contrast),
  performance with 1,000 jobs and 10,000 photos, TestFlight from CI.
- **Done when:** a phone updated from an Expo build keeps its unsent work, and the design
  partner uses the Swift TestFlight build on real jobs for a week with no data loss (M11's
  test). Then `apps/mobile` becomes Android-only (decision 2), CLAUDE.md's mobile sections are
  rewritten for Swift, and the Expo iOS build stops.

## Risks

| Risk | What we do |
|---|---|
| xtool is young and could break on a new Xcode | macOS CI builds everything with Xcode, so xtool is only a convenience for cloud sessions |
| A package (SQLCipher, Sentry) won't build with xtool | Found in S0, before any screen; fall back to macOS CI builds or Data Protection |
| Swift and TypeScript rules drift apart | Generated fixtures fail CI; the two-engine sync test |
| Cloud sessions have no iPhone simulator | UI tests and screenshots run on macOS CI; device checks by the owner through Sideloadly, then TestFlight |
| Two app codebases while both exist | The Expo app gets fixes but no new features (decision 7); new work goes to Swift |
| Losing unsent work when a phone updates | The database move above, tested in S9 |
