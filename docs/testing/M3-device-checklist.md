# M3 device checklist

Tests the field app on a real phone against the `leakbook-dev` project.

## Option A: Expo Go (quickest, no Apple or Google account)

Needs a computer with Node 22 and pnpm, on the same Wi-Fi as the phone.

1. Install **Expo Go** from the App Store or Google Play.
2. On the computer:
   ```sh
   git clone https://github.com/David0524/LeakSoftware.git
   cd LeakSoftware
   git checkout claude/cool-keller-efjc00
   corepack enable
   pnpm install
   cd apps/mobile
   npx expo start
   ```
3. Scan the QR code: iPhone camera app, or the scanner inside Expo Go on Android.

Expo Go limits: the local database is **not encrypted** (encryption needs a real build), and the app cannot be fully closed and reopened offline because Expo Go reloads it from the computer. Step 5 below covers offline work within these limits.

## Option B: Installable build (closest to the real app)

Needs an Expo account; an iPhone also needs the paid Apple Developer account. Android can install a test build without a Google account. Ask Claude to set this up.

## Checks

1. **Sign in** with `tech@demo.leakbook.test` / `leakbook-demo`. Expect "Downloading your company…", then the jobs list for **Demo Leak Co.** with job #1001 under Upcoming (or Today).
2. **Look and feel**: navy header, orange "New job" button with navy text, Barlow headings. Buttons are easy to hit with a thumb.
3. **Create a job online**: New job → new customer, address, pool type, spa on, gate code in access notes → "Start now" → Create. The job opens with status IN PROGRESS. Back on the list it shows under Today with a number like #1002 within a few seconds.
4. **Job details**: tap the phone number (opens the dialer), the address (opens maps); the gate code shows in a highlighted box. Type a note, tap outside the field.
5. **Offline**: turn on **airplane mode**. The bar under the header says "Offline". Create another job with a new customer, edit its notes, and cancel an older job. The bar shows how many changes are waiting. Leave the app open.
6. **Back online**: turn airplane mode off. Within a minute (or pull down on the list) the bar returns to "All changes saved to the office". The offline job now has a number.
7. **Second phone or account** (optional): sign out (Settings → Sign out), sign in as `owner@demo.leakbook.test`. The jobs created as the tech are there, with the same notes and statuses.
8. **Sign-out warning**: in airplane mode, make a change, then Settings → Sign out. The warning says the change hasn't reached the office. Choose "Stay signed in".
9. **New company** (optional): sign out, "Create an account" with your own email, then "Start a new company". You become its owner with the default checklist and price book.

Report anything that looks wrong, is hard to tap, or reads unclearly. Screenshots help.
