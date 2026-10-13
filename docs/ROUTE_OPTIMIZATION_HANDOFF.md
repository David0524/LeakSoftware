# Handoff: route optimization and scheduling (requested 2026-10-13)

**Status:** requested by the owner; nothing has been built. This file is separate from the main
handoff (`docs/SESSION_HANDOFF.md`). Finish the milestone in progress first (M8.5), unless the
owner says otherwise.

## Before building

1. `docs/BUILD_PLAN.md` (line 28) lists "Dispatch/routing" as out of scope. Log the change in
   `docs/DECISIONS.md`: owner, 2026-10-13, add route optimization folded into scheduling.
2. Add it as its own milestone in BUILD_PLAN section 8, with a "Done when". The suggested
   placement is right after M9 (invoicing), so the pilot is not held up. Confirm the placement
   with the owner.
3. **Provider: Mapbox** (owner, 2026-10-13: "fine for now, but the goal is to sell this
   elsewhere"). Add `MAPBOX_TOKEN` (server-side secret token) to `.env.example` and the hosting
   settings, never to chat or the repo.
4. Plan the screens with the apple-design skill before building them (CLAUDE.md).

## The owner's answers so far

- **Where techs start:** from the shop. Every route starts and ends at the company address,
  so the company address must be geocoded.
- **Arrival windows for customers:** undecided ("I don't know"). Build windows as a company
  setting that is off by default (exact start time). Offer 1, 2, or 4 hours when it is on.
- **Two-tech jobs routed together:** sometimes. When a job has a `second_tech_id` (added in
  M8.5), plan the two techs together that day: same time slot, or the same whole route if the
  office chooses "ride together". Otherwise route each tech separately.

## Built to sell to many shops

LeakBook is meant to be sold to other shops, so routing must keep working, and stay affordable,
at hundreds of shops:

- **Provider behind one interface.** Put all routing calls behind a small server module (for
  example `apps/web/src/server/routing.ts`: `geocode`, `driveTimes`, `orderStops`) with a Mapbox
  implementation. Screens and the database never know which provider is used, so switching to
  Google or self-hosted routing later is one file. Keep the pure parts in `packages/core`: time
  windows, fixed appointments, and fitting a gap. Unit test them without network access.
- **All calls from the server.** The token never ships in the phone app or the browser. One
  LeakBook key serves all shops, so shops have nothing to set up.
- **Count usage per company.** Log each routing call with `company_id` (for example in an
  `app.routing_usage` table with a daily count). This shows the cost per shop and lets LeakBook
  cap or price heavy users later. Add a per-company daily limit in config.
- **Cache.** Geocode each address once (only when it changes). Cache drive times between the
  same two points for a day. Never re-plan automatically on every edit; plan when the office
  presses Plan Day.
- **Mapbox terms to check before building:**
  - Storing geocoding results (saving latitude and longitude on the property) needs Mapbox's
    *permanent* geocoding, which is priced separately from the free temporary geocoding.
    Confirm its price and terms at mapbox.com/pricing.
  - Alternative for coordinates: take them from the phone's GPS at the pool. That is free and
    stored by us.
  - The Optimization API takes up to 12 stops per request. Days with more stops need splitting
    (or ordering by the Matrix API plus our own solver in core).
- **Works without a key.** With no `MAPBOX_TOKEN`, scheduling still works by hand (drag to
  order), and Plan Day says routing isn't set up. The same pattern as email and AI in M7.

## Suggested scope

- **Geocode** property and company addresses when they are saved.
  `property.latitude/longitude` already exist; add them to `company`. Use the phone's GPS at
  the pool as a fallback.
- **Office "Plan Day"** on `/schedule`, for a date and a tech:
  - order that tech's jobs by drive time from the shop and back;
  - keep fixed appointment times;
  - show drive times and the total;
  - drag to reorder by hand;
  - save the order and the start times.
- **Fill gaps:** suggest unscheduled jobs (including repair jobs from accepted quotes) that fit
  near the route, with how much drive time each adds.
- **Phone "Today":**
  - the route in order, with drive times;
  - Navigate opens Apple or Google Maps;
  - **On My Way** texts the customer an arrival time from the tech's phone (share sheet, like
    reports in M7).
- **Offline:** a planned route syncs to the phone like other rows. Planning itself needs a
  connection (office).
- **Data:**
  - job order and planned start already fit `job.scheduled_start/end`;
  - add `job.route_order`, plus `company.latitude/longitude`;
  - add a `route_plan` table only if needed. If one is added, follow the "Every business table"
    steps in CLAUDE.md.

## Cost

Rough numbers checked 2026-10-13. Prices change, so confirm on each provider's pricing page.

Assumed usage for a shop like the design partner's: 2–3 techs, about 4–6 jobs a day each.
Planning or replanning each tech's day a few times gives about 10–30 optimization requests a
day, or under 1,000 a month. Geocoding adds about 100–300 new addresses a month.

| Provider | What it costs | For this shop |
|---|---|---|
| Mapbox (Optimization, Matrix, Geocoding) | About $2 per 1,000 requests above a free tier of about 100,000 a month (third-party sources; not confirmed on Mapbox's page). One optimization of a whole route counts as one request. Up to 12 stops per request. | **Likely $0/month.** Even 100 shops would stay near the free tier. |
| Google Route Optimization | Billed per shipment (stop), with single-vehicle and fleet SKUs. There is a free threshold since March 2025; current amounts not confirmed. | Probably a few dollars a month or less per shop. Best quality, most setup (Google Cloud billing). |
| OpenRouteService | Free plan: 500 optimization requests a day. Commercial use on the free plan is unclear; self-hosting does not include optimization. | $0, but risky for a paid product. Fine for prototyping. |

Chosen: **Mapbox** (owner, 2026-10-13). It is free at this size, has one key for geocoding, drive times and
optimization, and is simple to call from the server. Its 12-stop limit per request is enough for
one tech's day. Revisit Google if multi-tech fleet planning (assigning jobs across techs
automatically) becomes important.

Sources:
- https://kb.kivalogic.com/admin/delivery/route-optimizer-mapbox-setup/
- https://pricingsaas.com/companies/mapbox
- https://mapbox.com/webinars/logistics-3-of-3-optimization-api
- https://developers.google.com/maps/documentation/route-optimization/usage-and-billing
- https://openrouteservice.org/plans/

## Still open for the owner

- Arrival windows: on or off, and how long.
- Should LeakBook assign jobs across techs automatically, or only order each tech's day?
  Ordering is simpler and cheaper; assigning is "fleet routing".
- Lunch break or end-of-day time limit per tech.
