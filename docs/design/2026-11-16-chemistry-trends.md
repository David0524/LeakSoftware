# Water chemistry trends, out-of-range alerts, and dose-limit warnings

Competitor reference (Triton): charts of readings and chemical costs per body of water, dosage-limit
warnings, push notifications for out-of-range readings and dosage limits, an out-of-range report.
Status: built on all four platforms (desktop website, phone website, Android, iPhone). Ranges are
the calculator's (`targets()`, with the tech's Aim For levels): the shop has no separate "custom
levels" setting to read, so a reading is judged exactly as the visit's Low / In range / High.

## 1. Trends (a pool's chemical log)

- Under the calculator on a pool's Chemical screen (`/chemicals?property=…`, a customer's pool,
  a visit's Chemical), above "Chemicals added" and "Chemical log": section **Trends**.
- **Segmented: 90 Days | 6 Months | 1 Year** (90, 183, 365 days, ending now).
- One card per reading taken in the period (Free chlorine, pH, Alkalinity, Calcium, Stabilizer,
  Salt where present): the reading's name, the latest value and "Low / In range / High", a line
  chart with the pool's range shaded green behind it (the latest entry's levels, Aim For included),
  points outside the range in red, and "Aim for 3.5–6 · 4 readings". "No readings in this period."
  when none.
- **Chemical Cost** card: bars for every calendar month of the period (shop's time zone), the
  month's total of `quantity × unit_price_cents` (customer-supplied excluded), the period's total
  beside the title. **Shown only when the shop charges for chemicals** (Settings › Price Book ›
  Charge for Chemicals) and something was spent: techs see prices only when the shop charges
  (2026-10-24). Owner may want it for every shop; it is one condition.
- Accessibility: each chart is one image with a spoken summary ("Free chlorine: 4 readings, from 1
  to 2.5 (low). Lowest 1, highest 5. Aim for 3.5 to 6."); the cost chart reads "Chemicals cost
  $46.50 in 4 months. Aug $16.00, …". Colors are tokens (`chart`/link blue line, `pass` band,
  `fail` points).
- Core `packages/core/src/chemistry-trends.ts`: `readingSeries`, `chemicalCostBars`,
  `costSummary`, `trendWindow`, `TREND_PERIODS` (pure, unit tested, Swift twin
  `SundeckCore/ChemistryTrends.swift` checked by `Fixtures/chemistry-trends.json`).
- Web: plain SVG (`components/chem-trends.tsx`). Android: `react-native-svg` (already installed,
  `features/chemicals/Trends.tsx`). iPhone: Swift Charts (`UI/ChemicalTrends.swift`).

## 2. Out-of-range alerts

- A reading is **out of range** when it is past the range's edge by more than a margin
  (`OUT_OF_RANGE_MARGIN`): free chlorine 1 ppm, pH 0.2, alkalinity 20, calcium 50, stabilizer 10,
  salt 300. A hair outside is the visit's Low / High label only, no push.
- The visit already flags each reading Low / High (the Chemicals section and the report's water
  test), so nothing new is stored on the visit.
- **Notification kind `chemistry`, "Out-of-range readings"** (Settings › Notifications and More ›
  Notifications, on by default; hint "A pool's water test far outside its range. Owners and
  admins."). Sent to the shop's active owners and admins only, not techs.
- **Sent server side, hourly:** `/api/cron/chemistry` (`apps/web/vercel.json`, minute 35) calls
  `runChemistryAlerts` (`server/chemistry-alerts.ts`) with the existing `notify()`. It looks at
  log entries last saved between 3 days and 20 minutes ago (a visit saves readings as the tech
  types, so an entry is judged by what it ended as), finds readings past the margin, records
  `(reading id, key)` in the new server-only table `chemical_alert` first (migration
  `20261022004800_chemical_alerts.sql`), and pushes only the readings it recorded: **once per
  reading of an entry**, however often it is edited. A reading corrected later and out of range
  again on another key alerts for that key.
- Text: title "Out-of-range reading" (or "readings"), body "Rebecca Soto: pH 8.2 high (aim
  7.4–7.6), Free chlorine 0.5 low (aim 3–6)". Tapping opens the visit (`job`), or the pool for an
  entry taken outside a visit (`property`).
- Delay: up to about 80 minutes after the tech stops typing (hourly run plus the 20-minute wait).

## 3. Dose-limit warnings

- `DOSE_LIMITS` (core data, per 10,000 gallons at once): liquid chlorine 1 gal, muriatic acid
  ½ gal, dry acid 2 lb, cal-hypo 2 lb, tabs 3, baking soda 3 lb, soda ash 1 lb, calcium chloride
  3 lb, stabilizer 3 lb, salt 3 bags, algaecide ¼ gal, clarifier and enzyme ⅛ gal, phosphate
  remover ¼ gal. Compared in the price book item's unit (gal, qt, oz, lb, tab, bag); an item sold
  by the jug or "each", a chemical with no key, or a pool with no gallons gets no warning.
- Shown as a yellow notice in the **Add Chemical** and **Added Chemical** sheets, live as the
  amount is typed, and never blocks Add or Save: "That’s more than the usual 1 gal per 10,000 gal
  at once. Check the amount." (the limit is shown in the item's unit).
- One-tap adds of the calculator's own suggestions are not checked (the calculator already works
  from the pool's gallons).

## 4. Out of Range (Chemicals)

- When Chemicals isn't opened for a pool (More › Chemicals), a **Calculator | Out of Range**
  segmented control sits under the title. Out of Range lists the last 30 days of readings past the
  margin, newest first: the pool (customer, else address), "pH 8.2 · High", "Aim for 7.4–7.6 ·
  Mon, Nov 9, 8:15 AM · Tony Tech"; a row opens that pool's Chemical screen. Empty: "No readings
  out of range in the last 30 days."
- Website: `/chemicals?view=out-of-range` (server rendered). Apps: from the phone's own rows.

## Owner decisions

1. Margins and dose limits above are starting points from labels and the calculator's own steps.
2. Cost chart only for shops that charge for chemicals (see §1).
3. Alerts are hourly, not instant (a database trigger can't send pushes; the existing pushes come
   from website routes). Instant would need the phone to call the website after saving.
4. Dosage-limit pushes (Triton has them) are not built: only the inline warning, since the amount
   is typed on a phone that is showing the screen.
