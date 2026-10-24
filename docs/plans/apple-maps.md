# Apple Maps on the website (MapKit JS)

Owner, 2026-10-20: "Is there any way to get apple maps to be the map provider on desktop?" Then:
"Yes do your suggestion."

The website's maps, map images, address search and "Open in Maps" links move to Apple. Drive-time
math stays on Mapbox, or on our estimate when Mapbox is out of budget. All four platforms then show
Apple's map look: the iPhone app already uses MapKit, and Android follows the website.

## What Apple allows (checked 2026-10-20)

From [developer.apple.com/maps/web](https://developer.apple.com/maps/web/) and the Snapshots
documentation:

- **MapKit JS:** "a free daily limit of 250,000 map views and 25,000 service calls per Apple
  Developer Program membership. For additional capacity needs, contact us."
  - Service calls are search, autocomplete, geocoding and ETA. Apple's WWDC22 "Meet Apple Maps
    Server APIs" says the Maps Server API uses the same 25,000 a day.
- **Snapshots:** "a free daily limit of 25,000 unique requests per day per Apple Developer
  Program membership."
  - A developer forum post reports the Maps dashboard showing 25,000 snapshots a **month**. We
    guard as if it's monthly, which is the safer reading.
- **Running out:** Apple rejects further calls with HTTP 429 until the next period. There is no
  paid tier and no automatic billing; more capacity only comes by asking Apple. **So this can't
  cost money.** The risk is maps not loading. The budget guard stops before the limit, and the
  Mapbox fallback covers the rest.
- **Attribution:** MapKit JS draws Apple's logo and legal link on the map itself, and snapshots
  include them in the image. We must not hide or cover them, so nothing is placed over a map's
  bottom corners.
- **Snapshots API** (`GET https://snapshot.apple-mapkit.com/api/v1/snapshot`):
  - `size` is width and height, each 50–640, and `scale` is 1–3, so our 2x images fit (up to
    1280 pixels a side).
  - `colorScheme` is `light` or `dark`, and `poi=0` hides points of interest.
  - `annotations` take a color and **one character** of `glyphText` (0–9, a–z), or `img` with up
    to 10 images per request.
  - `overlays` include `polyline` with `strokeColor`, `lineWidth` and `strokeOpacity`.
  - Signing: sign the path and query with ES256 using the MapKit JS key, Base64URL-encode the
    signature, and add it as the **last** parameter. A `referer` restriction and an `expires`
    time are optional.

### What this means for the build

- **Stops 1–9** get their number as the pin's glyph.
- **A day with 10 or more stops:** Apple can't number those pins, so its image came from Mapbox.
  Since 2026-10-24 (DECISIONS) Apple draws the map and route only and our pins are drawn onto it,
  so every day is Apple's. The interactive map numbers every stop on both providers.
- **Budget guard:** `app.mapbox_budget` gets three Apple rows, counted per calendar month at
  about 90% of the safest reading:
  - `apple_snapshot`: 22,500 a month;
  - `apple_service`: 600,000 a month (25,000 a day × 30 × ~0.8);
  - `apple_map_view`: 6,000,000 a month (250,000 a day × 30 × ~0.8).

  The guard also stops at 90% of a single day's allowance, 22,500 service calls and 225,000 map
  views, using a daily count kept beside the monthly one.

## Owner setup (Apple Developer account, the one TestFlight uses)

1. Certificates, Identifiers & Profiles › Identifiers › **Maps IDs**: create one, such as
   `maps.app.sundeckpro`.
2. Keys › new key with **MapKit JS** (and Maps Server API) enabled. Download the `.p8` file; it
   can only be downloaded once.
3. Add these as environment secrets, never in the repo: `APPLE_MAPS_TEAM_ID`,
   `APPLE_MAPS_KEY_ID`, `APPLE_MAPS_PRIVATE_KEY` (the .p8 contents). Add them to the hosting
   project's environment too.
4. Set `MAP_PROVIDER=apple` once the maps have been checked on the live site.

Until the keys exist, the website stays on Mapbox (`MAP_PROVIDER` defaults to `mapbox` when the
Apple keys are missing).

## Build

**Server (apps/web):**
- `GET /api/mapkit-token`:
  - signs a short-lived JWT (ES256, `iss` team id, `kid` key id, `iat`, `exp` about 30 minutes,
    `origin` set to the site's own origin);
  - signed-in users only, with `Cache-Control: private, no-store`;
  - counts one `apple_map_view` per token. A token covers a page's maps, so this is an
    overcount, which is the safe direction.
- **Map images:** a server helper signs Apple Snapshot URLs in place of Mapbox Static Images in
  the day-map images, keeping the same cache, sizes, markers and colors.
  - The guard is `mapbox_take(company, 'apple_snapshot', 1)`.
  - Mapbox takes over when it's out of budget or on any Apple error (since 2026-10-24, not for 10
    or more stops: our pins are drawn onto Apple's image).
- **Address search:** Apple's autocomplete in the address field, guarded as `apple_service`,
  falling back to the current free Census and then OpenStreetMap lookups. Pools keep their
  stored coordinates, and nothing is re-geocoded.

**Website (desktop and phone):**
- Load MapKit JS from Apple's CDN (`https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js`, an
  allowed `script-src` in the CSP) only on pages with a map, after first paint.
- One small `AppleMap` component replaces the Mapbox GL views: day maps, Routes, Enlarge Map and
  the job's pool pin. It keeps the same markers, colors (`brand/tokens.json`), numbered stops and
  route lines.
- Light and dark follow the site, and the map honors Reduce Motion.
- If MapKit fails to load or the token is refused, the current Mapbox map shows. The switch is
  `MAP_PROVIDER=apple|mapbox`.
- "Open in Maps" and Directions on desktop use `https://maps.apple.com/?daddr=…`, with lat,lng
  when known. Phones keep their current links.

**Unchanged:**
- Drive times for Optimize, Plan Week and Routes stay on the Mapbox matrix, with the same budget
  and caps.
- iPhone app: it's already MapKit. Only its directions links are checked.
- Android app: on the phone it keeps the device's own map app. Only its links to Maps on a
  computer are changed to match the website.

## Done when

- Desktop and phone website show Apple maps on every map screen, light and dark, with the same
  markers and route lines.
- Day-map images come from Apple Snapshots, apart from days with 10 or more stops.
- No key is in the repo or the browser, and the token endpoint refuses signed-out users.
- The budget guard stops Apple calls before the free limit, and the Mapbox fallback works with
  `MAP_PROVIDER=mapbox`.
- Checks pass: `pnpm format:check && pnpm lint && pnpm typecheck`, `pnpm test`, `pnpm test:db`,
  and the Playwright map tests (CI stubs MapKit, since it has no token).
- DECISIONS.md has an entry: Apple for maps, images, search and links; Mapbox for drive times
  only.
