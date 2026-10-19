# iPhone app (Swift)

The native iPhone app that replaces the Expo app (`docs/plans/swift-app.md`). Milestone S0: the
toolchain proof (encrypted database, sign-in, error reporting). The Expo app in `apps/mobile`
is still the shipping app and keeps getting fixes.

## Layout

- `Package.swift`: SwiftPM. `SundeckStorage` (SQLite with SQLCipher) builds and tests on Linux;
  `SundeckApp` is the app (its SwiftUI code is iPhone only). Versions are pinned `exact`.
- `xtool.yml` and `Info.plist`: bundle ID `com.sundeckpro.app`, display name, icon (from
  `brand/logo/png/icon-1024.png`, generated; never edit it here).
- Tests use Swift Testing. `LiveServerTests` signs in to the dev project as the demo tech and
  runs only with `SUNDECK_LIVE=1`. So does `LiveMediaTests`, BUILD_PLAN M5's test through the
  Swift app (30 photos and 2 videos offline, a kill mid-upload, no duplicates): about 16 MB in
  the dev project's storage per run, which can't be deleted, so run it when uploads change
  (`NODE_USE_ENV_PROXY=1 SUNDECK_LIVE=1 swift test --filter LiveMediaTests`).
- Captured files live in Documents/media/{id}.{ext}, stored relative to Documents (the
  container path changes on app updates). The file never changes after capture; markup and
  captions are row columns.

## Commands

- `bash scripts/setup-ios.sh`: installs Swift 6.4.1 and xtool 1.22.2 in a cloud session.
- `pnpm test:ios` and `pnpm lint:ios` (`swift format`; `swift format -i -r apps/ios/Sources
  apps/ios/Tests` fixes it). Run both before committing Swift.
- `pnpm build:ios`: builds `apps/ios/xtool/SundeckPro.ipa` for Sideloadly. Needs the iPhone SDK:
  `xtool sdk install <Xcode.xip>` (about 45 minutes, 6.9 GB). `Xcode_27.1.xip` is in the owner's
  Google Drive (Sundeck folder); the Drive connector can't download 2 GB, so the owner shares it
  by link for a few minutes and turns the link off again (Apple's license).
- Rules from `packages/core` are ported to `Sources/SundeckCore` and must match it: add inputs
  in `fixtures/cases/<module>.ts`, run `pnpm --filter @leakbook/ios fixtures`, and check them in
  `Tests/SundeckCoreTests` with `checkRule`. `pnpm test` fails when the fixtures are stale, so a
  rule changed in TypeScript fails the Swift tests until the port follows.
- Sync: `Sources/SundeckSync` is the port of `packages/sync` and must behave the same.
  `pnpm test:db` (with Swift installed) runs the Swift two-device scenarios and the cross-engine
  test in `packages/sync/test/integration/cross-engine.test.ts`, which drives
  `SundeckSyncDevice` beside a TypeScript phone. `SundeckSyncPostgres` and `SundeckSyncDevice`
  are for tests only; the app never reaches Postgres directly.
- xtool crashes without a terminal; the scripts wrap it in `script -qec … /dev/null`.

## Rules

- Same as the rest of the repo: the phone's database is the source of truth, every write goes
  through the sync layer, money in integer cents, UUIDv7 IDs, originals never changed.
- The database key is hex from the Keychain, same scheme as the Expo app, so S9 can move an
  Expo database into this app.
- UI follows CLAUDE.md's design rules; plan each screen with the apple-design skill.
- CI: `ios-linux` (format and tests on Linux) and `ios-macos` (tests on macOS and an Xcode
  build for iPhone).
