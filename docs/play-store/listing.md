# Google Play store listing (draft, 2026-10-22)

Mirrors the App Store listing in `docs/release/LAUNCH.md` § 3 (one app, two packages: Pool Care
and Leak Detection, and Both). Play Console › Sundeck Pro › Grow users › Store presence › Main
store listing. Character counts are Play's limits; the counts in brackets are what's written.

- **App name (30):** Sundeck Pro [11]
- **Short description (80):** Routes, checklists, reports, and invoices for pool service and leak detection. [78]
- **Category:** App › Business
- **Tags:** pick up to five from Play's list that fit (for example Business management,
  Scheduling, Invoicing); Play offers them in Store settings.
- **Contact email:** support@sundeckpro.com (`SUPPORT_EMAIL`; Play shows it publicly)
- **Website:** https://sundeckpro.com
- **Privacy policy:** https://sundeckpro.com/privacy
- **Account deletion URL** (Data safety form): https://sundeckpro.com/privacy, section "Your
  choices" (see `data-safety.md`)
- **Price:** Free. No in-app purchases, no ads. Shops subscribe on the website.

## Full description (4000) [1,776]

```text
Sundeck Pro is the field app for pool companies: route cleaning crews and leak detection techs alike. Your shop picks its package, and the app shows only what you use.

Today
Your day's stops in order, with drive times, gate codes and notes, and directions in Google Maps. Text the customer you're on your way, call them, and mark each stop complete.

Pool service
- A service checklist for every visit, with photos
- Water readings and a chemical calculator that says what to add, in gallons and pounds, in the right order
- Repair quotes for pumps and filters, and the monthly service invoice

Leak detection
- A checklist for every skimmer, return, light, and drain: not leaking, needs attention, leaking, or not applicable
- Pressure and bucket tests that do the math
- Findings pinned on a drawing of the pool
- A clear report the customer reads on your phone and signs on the spot, or gets by email or text

Quotes, invoices, and receipts
Build a quote from your price book, send it, and the customer accepts and pays online by card or bank. Turn the work into an invoice, record cash or check payments in the field, and send a receipt.

Schedule
Day, week, and month views for the whole team, with each tech's route and drive time. Owners see who is where and what's done.

Works without a signal
Everything you enter is saved on the phone first and syncs when you're back in range. Photos, videos, and voice notes upload in the background.

Every shop
- Photos with markup, videos, and voice notes with transcripts
- One company number for texts and calls, with a shared inbox the whole team sees
- Your logo and colors on every report, quote, and invoice

Requires a Sundeck Pro shop account. Owners start a free 30-day trial at sundeckpro.com and invite their techs.
```

Before publishing, check each line against the build being released (for example Google Maps
directions and the chemical calculator), and keep the wording plain: no "revolutionary",
"best", or "#1".

## Graphics

All in `docs/play-store/graphics/` and `docs/play-store/screenshots/`.

| Asset | Play's spec | File |
|---|---|---|
| App icon | 512 × 512 PNG, full square (Play rounds it) | `graphics/icon-512.png` |
| Feature graphic | 1024 × 500 PNG or JPEG | `graphics/feature-graphic.png` |
| Phone screenshots | 2 to 8, 9:16, 1080 × 1920 | `screenshots/1-today.png` … `8-receipt.png` |

The icon and feature graphic come from the generated logo and `brand/tokens.json`: edit
`brand/scripts/build_play_graphics.mjs` and run
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node brand/scripts/build_play_graphics.mjs` (never
edit the PNGs by hand).

**The screenshots are captures of the phone website**, not of the Android app: no Android build
exists yet. The Android app follows the mobile website's design and navigation
(`docs/design/2026-10-19-native-apps-follow-web.md`), so they show the same screens, but they
must be replaced by real Android captures once an emulator or device build exists, before the
public (production) release. Taken at 412 × 732 CSS pixels and 2.625× (a Pixel-sized phone),
resized to 1080 × 1920, signed in as the demo shop's tech and owner on the dev project; the
names, addresses, and numbers are the demo shop's made-up data.

| # | File | Shows |
|---|---|---|
| 1 | `1-today.png` | Today: the current stop card and the day's route |
| 2 | `2-schedule.png` | Schedule: a tech's day with stops and drive times |
| 3 | `3-jobs.png` | Jobs: the job list with statuses |
| 4 | `4-leak-checklist.png` | A leak detection checklist with a leaking item |
| 5 | `5-service-checklist.png` | A maintenance visit: chemical readings and the service checklist |
| 6 | `6-wrap-up-quote-invoice.png` | Wrap-Up: report, quote, signature, and invoice for one job |
| 7 | `7-report.png` | The customer's leak detection report (the shop's logo) |
| 8 | `8-receipt.png` | The customer's paid invoice (receipt) |

The screenshots carry no text overlay.
