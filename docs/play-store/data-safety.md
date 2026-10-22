# Google Play Data safety answers (draft, 2026-10-22)

Play Console › Sundeck Pro › Monitor and improve › Policy and programs › App content › Data
safety. Worked out from what the Android app (`apps/mobile`) and the server actually do, and
matched to the privacy policy (`apps/web/src/app/(public)/privacy/page.tsx`, sundeckpro.com/privacy)
and the App Store answers (`docs/release/LAUNCH.md` § 3). **Owner to confirm** marks an answer
that is a judgment call or that the code can't settle.

## Overview questions

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | Accounts, customer records, photos, location on photos, usage |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Every call is HTTPS: Supabase (`https://…supabase.co`), the website's API (`https://sundeckpro.com`), Sentry, Expo push. The phone's own database is also encrypted at rest (SQLCipher, `app.json`). |
| Do you provide a way for users to request that their data is deleted? | **Yes** | In the app: More › Delete My Account; on the website: More › Delete My Account (techs and second owners are deleted at once; a shop's only owner becomes a request done within 30 days, `docs/DECISIONS.md` 2026-10-14). Others write to support@sundeckpro.com. |
| Account creation methods | **Username and password** (email and password; optional two-step code). Accounts are made on the website or by an invite; the app only signs in. | |
| Delete account URL | https://sundeckpro.com/privacy ("Your choices": delete in the app or on the website, or email support) | **Owner to confirm:** Play asks for a page that explains how to ask for deletion without installing the app. The privacy page's "Your choices" does that today; a dedicated `/delete-account` page would be clearer if Play's reviewer objects. |
| Data shared with third parties? | **No** (for every type below) | Supabase, Vercel, Resend, Twilio, Deepgram, Stripe, Mapbox, Apple Maps, Sentry and Expo process data only on our behalf (service providers), which Play doesn't count as sharing. Nothing is sold or used for ads. |

## Data types collected

All are **collected, not shared**, and none are used for advertising or tracking. "Required"
means the person can't use the app without it; "optional" means they can decline.

| Play category › type | Collected | Required? | Purposes | Ephemeral? | Where it comes from |
|---|---|---|---|---|---|
| Personal info › **Name** | Yes | Required | App functionality, Account management | No | Team member's account; customers' names the shop enters |
| Personal info › **Email address** | Yes | Required | App functionality, Account management | No | Sign-in; customers' emails for reports and invoices |
| Personal info › **Phone number** | Yes | Optional | App functionality | No | Team member's mobile (calls ring it); customers' numbers |
| Personal info › **Address** | Yes | Optional | App functionality | No | Customers' pool addresses (routes, reports) |
| Personal info › **Other info** | Yes | Optional | App functionality | No | Gate codes, access notes, signatures |
| Financial info › **Purchase history** | Yes | Optional | App functionality | No | Invoices and payments the shop records for its customers. Card numbers never reach us (Stripe). **Owner to confirm** whether to list it; it's the shop's records about its customers, not the user's own purchases. |
| Location › **Precise location** | Yes | Optional | App functionality | No | Only when a photo or video is taken with location allowed (proof it was taken on site), and Settings › Scheduling › "Use my location" for the shop's address. Foreground only; never in the background, never for tracking routes (`src/lib/media.ts`, `features/settings/Scheduling.tsx`). |
| Messages › **SMS or MMS** / **Other in-app messages** | Yes | Optional | App functionality | No | Texts between the shop's company number and its customers, read and sent in Messages (through Twilio, on the server). |
| Photos and videos › **Photos**, **Videos** | Yes | Optional | App functionality | No | Inspection and visit photos and videos taken in the app (camera only; the app doesn't read the photo library, `photosPermission: false`). |
| Audio › **Voice or sound recordings** | Yes | Optional | App functionality | No | Voice notes and the sound on videos; transcribed by Deepgram on the server. Voicemails left on the shop's number are server-side. |
| Files and docs | Yes | Optional | App functionality | No | Reports, quotes, invoices (PDFs) the app makes and shares. **Owner to confirm**: these are generated, not files the user uploads, so this may be left unticked. |
| App activity › **App interactions** | Yes | Required | Analytics, App functionality | No | Usage for the Admin portal (2026-10-22): screens opened and for how long while the app is in front, app version, what people did (from the audit log), kept 180 days (`src/data/usage.ts`). |
| App activity › **Other user-generated content** | Yes | Optional | App functionality | No | Checklists, water readings, tests, findings, notes, reports |
| App info and performance › **Crash logs** | Yes | Optional | App functionality | No | Sentry, only when `EXPO_PUBLIC_SENTRY_DSN` is set at build time; no user or customer details (`sendDefaultPii: false`, no screenshots or replay, `src/lib/monitoring.ts`). |
| App info and performance › **Diagnostics** | Yes | Required | Analytics, App functionality | No | Errors people hit (error screens, saves that failed), sent with usage. |
| Device or other IDs | Yes | Optional | App functionality | No | The Expo push token for this phone (filed at sign-in, removed at sign-out, `src/lib/push.ts`), only when notifications are allowed. **Owner to confirm:** Play's guidance treats push tokens as device IDs; listing it is the safe answer. |

**Not collected:** financial account or card numbers, health, contacts (the phone's address
book isn't read), calendar, web browsing, installed apps, approximate location (beyond the
precise location above; `ACCESS_COARSE_LOCATION` comes with the location module), race,
religion, and other sensitive info.

## Owner to confirm (summary)

1. Delete account URL: the privacy page's "Your choices", or ask Claude for a dedicated
   `/delete-account` page.
2. Purchase history: list it (invoices and payments) or leave it out.
3. Files and docs: leave unticked (generated documents) or tick it.
4. Device or other IDs: keep (push token).
5. Crash logs: tick only if `EXPO_PUBLIC_SENTRY_DSN` is set in the EAS production environment
   for the build you upload (`docs/release/LAUNCH.md` § 1, Sentry). Keep the App Store answers
   and these the same.
6. App interactions and Diagnostics are the usage tracking from `docs/OWNER_TODO.md` item 4.
