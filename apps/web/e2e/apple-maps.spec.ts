import { expect, test, type Page } from "@playwright/test";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";
import { solidPng } from "./png";

// Apple Maps on the website (owner, 2026-10-20, docs/plans/apple-maps.md). CI has no Apple key:
// the second app (playwright.config.ts, port 3201) signs tokens with a throwaway key, so MapKit
// JS and the map images are stubbed in the browser, and nothing reaches Apple. The main app has
// no Apple keys and stays on Mapbox.

const APPLE = process.env.APPLE_E2E_BASE_URL ?? "http://localhost:3201";
test.skip(
  !!process.env.E2E_BASE_URL && !process.env.APPLE_E2E_BASE_URL,
  "Needs the Apple Maps app (APPLE_E2E_BASE_URL)",
);
test.use({ baseURL: APPLE });

const MAPKIT = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js";

/**
 * A stand-in for MapKit JS: the parts the website uses. It asks for a token at init, as MapKit
 * does, and draws each annotation's element so the pins can be tapped.
 */
const STUB = `(() => {
  const listeners = {};
  const mapkit = {
    init(o) { o.authorizationCallback((t) => { window.__mapkitToken = t; }); },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    FeatureVisibility: { Hidden: "hidden", Visible: "visible", Adaptive: "adaptive" },
    PointOfInterestFilter: { excludingAllCategories: {} },
    Coordinate: function (latitude, longitude) { this.latitude = latitude; this.longitude = longitude; },
    CoordinateSpan: function () {},
    Padding: function () {},
    Style: function (o) { Object.assign(this, o); },
    PolylineOverlay: function (points, o) { this.points = points; Object.assign(this, o); },
    Annotation: function (at, factory, o) { this.coordinate = at; this.factory = factory; this.data = (o && o.data) || {}; },
    Map: function (el, o) {
      this.colorScheme = o.colorScheme;
      this.el = document.createElement("div");
      this.el.dataset.stub = "mapkit";
      this.el.dataset.colorScheme = o.colorScheme;
      this.el.style.cssText = "position:absolute;inset:0;background:#dfe7ee;display:flex;flex-wrap:wrap;gap:4px;padding:8px";
      el.appendChild(this.el);
      this.overlays = [];
      this.region = { toBoundingRegion: () => ({ northLatitude: 90, southLatitude: -90, eastLongitude: 180, westLongitude: -180 }) };
    },
  };
  mapkit.Map.prototype.addAnnotations = function (list) { for (const a of list) this.el.appendChild(a.factory()); };
  mapkit.Map.prototype.addOverlay = function (o) { this.overlays.push(o); this.el.dataset.overlays = String(this.overlays.length); };
  mapkit.Map.prototype.showItems = function () {};
  mapkit.Map.prototype.setCenterAnimated = function () {};
  mapkit.Map.prototype.addEventListener = function () {};
  mapkit.Map.prototype.destroy = function () { this.el.remove(); };
  window.mapkit = mapkit;
  const cb = document.currentScript && document.currentScript.dataset.callback;
  if (cb && window[cb]) window[cb]();
})();`;

const PLACES = [
  { line1: "455 N Galvin Pkwy", city: "Phoenix", zip: "85008", lat: 33.45006, lng: -111.94886 },
  {
    line1: "3839 N Drinkwater Blvd",
    city: "Scottsdale",
    zip: "85251",
    lat: 33.4919,
    lng: -111.9236,
  },
];

/** A weekday 2 to 10 months out, so the test has the day to itself. */
function quietDay(): string {
  const d = new Date(Date.now() + (60 + Math.floor(Math.random() * 240)) * 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Two located stops for Jake on a quiet day; returns the day and his id. */
async function jakesDay(): Promise<{ day: string; jake: string }> {
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const company = membership!.company_id as string;
  const { data: jakeRow } = await owner
    .from("profile")
    .select("id")
    .eq("email", "jake@demo.leakbook.test")
    .single();
  const jake = jakeRow!.id as string;
  const day = quietDay();
  for (const [i, p] of PLACES.entries()) {
    const start = `${day}T${String(9 + i * 2).padStart(2, "0")}:00:00-07:00`;
    const { data: id, error } = await owner.rpc("create_job", {
      target_company: company,
      new_customer: { name: `Apple Map ${i + 1} ${RUN}`, phone: "602-555-0142" },
      existing_customer: null,
      new_property: {
        address_line1: p.line1,
        city: p.city,
        state: "AZ",
        postal_code: p.zip,
        has_spa: false,
      },
      existing_property: null,
      job: {
        status: "scheduled",
        scheduled_start: start,
        scheduled_end: new Date(Date.parse(start) + 3_600_000).toISOString(),
        assigned_user_id: jake,
      },
      components: [],
    });
    if (error) throw error;
    const { data: row } = await owner.from("job").select("property_id").eq("id", id).single();
    const { error: located } = await owner
      .from("property")
      .update({ latitude: p.lat, longitude: p.lng, location_source: "manual" })
      .eq("id", row!.property_id);
    if (located) throw located;
  }
  return { day, jake };
}

/** Map images come from a plain PNG here: Apple would refuse the throwaway key's signature. */
async function stubImages(page: Page) {
  const png = solidPng(64, 32, [223, 231, 238]);
  await page.route(/\/api\/map\?/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: png }),
  );
}

async function openEnlarge(page: Page, day: string, jake: string) {
  await page.setViewportSize({ width: 1400, height: 1200 });
  await signIn(page, OWNER, "/jobs");
  await page.goto(`/schedule?view=day&date=${day}&tech=${jake}`);
  // The day's column (the phone layout's copy is hidden on a computer).
  const enlarge = page.getByRole("button", { name: "Enlarge Map" }).filter({ visible: true });
  await enlarge.first().click();
  return page.getByRole("dialog");
}

test("the MapKit token is only for signed-in people, and never cached", async ({ request }) => {
  const res = await request.get(
    `${APPLE}/api/mapkit-token?company=00000000-0000-0000-0000-000000000000`,
  );
  expect(res.status()).toBe(401);
  expect(res.headers()["cache-control"]).toBe("private, no-store");
});

test("Enlarge shows Apple's map with the day's numbered stops", async ({ page }) => {
  test.setTimeout(120_000);
  const { day, jake } = await jakesDay();
  await stubImages(page);
  await page.route(MAPKIT, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: STUB }),
  );
  const token = page.waitForResponse((r) => r.url().includes("/api/mapkit-token"));
  const sheet = await openEnlarge(page, day, jake);
  const res = await token;
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe("private, no-store");
  // The key never reaches the browser: only a signed token, for this site's origin.
  const jwt = (await res.text()).split(".");
  const claims = JSON.parse(Buffer.from(jwt[1]!, "base64url").toString());
  expect(claims.origin).toBe(new URL(APPLE).origin);
  expect(claims.exp - claims.iat).toBe(1800);

  const apple = sheet.getByTestId("apple-map");
  await expect(apple.getByRole("button", { name: "Stop 1" })).toBeVisible();
  await expect(apple.getByRole("button", { name: "Stop 2" })).toBeVisible();
  // The route line is drawn.
  await expect(apple.locator("[data-stub=mapkit]")).toHaveAttribute("data-overlays", "1");
  // A pin and its row are selected together.
  await apple.getByRole("button", { name: "Stop 2" }).click();
  await expect(sheet.getByRole("button", { name: /^Stop 2:/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(apple.getByRole("button", { name: "Stop 2" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("when MapKit can't load, Enlarge falls back to the Mapbox map image", async ({ page }) => {
  test.setTimeout(120_000);
  const { day, jake } = await jakesDay();
  await stubImages(page);
  await page.route(MAPKIT, (route) => route.abort());
  const sheet = await openEnlarge(page, day, jake);
  await expect(sheet.locator('img[src*="w=960"]')).toBeVisible();
  await expect(sheet.getByTestId("apple-map")).toHaveCount(0);
});

test("when the token is refused, Enlarge falls back to the Mapbox map image", async ({ page }) => {
  test.setTimeout(120_000);
  const { day, jake } = await jakesDay();
  await stubImages(page);
  await page.route(MAPKIT, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: STUB }),
  );
  await page.route(/\/api\/mapkit-token/, (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: '{"error":"Used up"}' }),
  );
  const sheet = await openEnlarge(page, day, jake);
  await expect(sheet.locator('img[src*="w=960"]')).toBeVisible();
  await expect(sheet.getByTestId("apple-map")).toHaveCount(0);
});

test("the Mapbox app has no Apple token to give", async ({ page }) => {
  await signIn(page, OWNER, "/jobs");
  // The main app (no Apple keys): MAP_PROVIDER resolves to Mapbox.
  const main = process.env.E2E_BASE_URL ?? "http://localhost:3200";
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data } = await owner.from("membership").select("company_id").limit(1).single();
  // Signed in: the session cookie is the same on both apps (cookies aren't kept per port).
  const res = await page.request.get(`${main}/api/mapkit-token?company=${data!.company_id}`);
  expect(res.status()).toBe(404);
});
