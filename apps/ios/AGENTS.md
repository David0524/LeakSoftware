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
  runs only with `SUNDECK_LIVE=1`.

## Commands

- `bash scripts/setup-ios.sh`: installs Swift 6.4.1 and xtool 1.22.2 in a cloud session.
- `pnpm test:ios` and `pnpm lint:ios` (`swift format`; `swift format -i -r apps/ios/Sources
  apps/ios/Tests` fixes it). Run both before committing Swift.
- `pnpm build:ios`: builds `apps/ios/xtool/SundeckPro.ipa` for Sideloadly. Needs the iPhone SDK:
  `xtool sdk install <Xcode.xip>` (about 45 minutes, 6.9 GB). `Xcode_27.1.xip` is in the owner's
  Google Drive (Sundeck folder); the Drive connector can't download 2 GB, so the owner shares it
  by link for a few minutes and turns the link off again (Apple's license).
- xtool crashes without a terminal; the scripts wrap it in `script -qec … /dev/null`.

## Rules

- Same as the rest of the repo: the phone's database is the source of truth, every write goes
  through the sync layer, money in integer cents, UUIDv7 IDs, originals never changed.
- The database key is hex from the Keychain, same scheme as the Expo app, so S9 can move an
  Expo database into this app.
- UI follows CLAUDE.md's design rules; plan each screen with the apple-design skill.
- CI: `ios-linux` (format and tests on Linux) and `ios-macos` (tests on macOS and an Xcode
  build for iPhone).
