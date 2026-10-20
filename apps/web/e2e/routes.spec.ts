import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";

// Routing (owner request, 2026-10-13): Plan Route orders a tech's day for the least driving
// and keeps a promised time; jobs move between the tray and a tech's day by Move… and by
// dragging; Suggest Times fits a job into the routes already planned; addresses link to
// directions; Today shows a tech's route. No routing key in CI: drive times
// are the built-in estimate.
//
// Real public places (approximate coordinates), never homes.
const PLACES = {
  zoo: {
    address_line1: "455 N Galvin Pkwy",
    city: "Phoenix",
    postal_code: "85008",
    lat: 33.45006,
    lng: -111.94886,
  },
  goodyear: {
    address_line1: "1933 S Ballpark Way",
    city: "Goodyear",
    postal_code: "85338",
    lat: 33.4283,
    lng: -112.3887,
  },
  scottsdale: {
    address_line1: "3839 N Drinkwater Blvd",
    city: "Scottsdale",
    postal_code: "85251",
    lat: 33.4919,
    lng: -111.9236,
  },
  tempe: {
    address_line1: "3500 S Rural Rd",
    city: "Tempe",
    postal_code: "85282",
    lat: 33.3925,
    lng: -111.9264,
  },
} as const;
type Place = keyof typeof PLACES;

const name = (p: Place) => `${p[0]!.toUpperCase()}${p.slice(1)} Pool ${RUN}`;

/** A weekday 2 to 10 months out, so the test has the day to itself. */
function quietDay(): string {
  const d = new Date(Date.now() + (60 + Math.floor(Math.random() * 240)) * 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The demo shop is in Phoenix (UTC−7 all year). */
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00-07:00`;

async function makeJob(
  db: SupabaseClient,
  company: string,
  place: Place,
  job: { tech?: string; date?: string; time?: string; fixed?: boolean },
) {
  const p = PLACES[place];
  const start = job.date && job.time ? at(job.date, job.time) : null;
  const { data: id, error } = await db.rpc("create_job", {
    target_company: company,
    new_customer: { name: name(place), phone: "602-555-0142" },
    existing_customer: null,
    new_property: {
      address_line1: p.address_line1,
      city: p.city,
      state: "AZ",
      postal_code: p.postal_code,
      has_spa: false,
    },
    existing_property: null,
    job: {
      status: start ? "scheduled" : "unscheduled",
      scheduled_start: start,
      scheduled_end: start ? new Date(Date.parse(start) + 2 * 3_600_000).toISOString() : null,
      assigned_user_id: job.tech ?? null,
    },
    components: [],
  });
  if (error) throw error;
  const { data: row } = await db.from("job").select("property_id").eq("id", id).single();
  const { error: located } = await db
    .from("property")
    .update({ latitude: p.lat, longitude: p.lng, location_source: "manual" })
    .eq("id", row!.property_id);
  if (located) throw located;
  if (job.fixed) {
    const { error: fixed } = await db.from("job").update({ arrival_fixed: true }).eq("id", id);
    if (fixed) throw fixed;
  }
  return id as string;
}

/** Where an address link's /maps redirect sends this device. */
async function mapsTarget(page: Page, href: string, headers: Record<string, string> = {}) {
  const res = await page.request.get(href, { maxRedirects: 0, headers });
  expect(res.status()).toBe(302);
  return res.headers()["location"] ?? "";
}

/** Customer names on a tech's route, in order. */
async function routeNames(page: Page, tech: string) {
  const labels = await page
    .getByRole("region", { name: tech })
    .getByTestId("stop")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return labels.map((l) => l.replace(/^[^,]*, /, ""));
}

test("plan a tech's day, move jobs, suggest times, and give directions", async ({ page }) => {
  test.setTimeout(240_000);
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const company = membership!.company_id as string;
  const { data: priya } = await owner
    .from("profile")
    .select("id")
    .eq("email", "priya@demo.leakbook.test")
    .single();
  const tech = priya!.id as string;
  const day = quietDay();

  // Booked in a poor order: Goodyear, far west, between two east-side pools; Scottsdale
  // was promised 2:00 PM.
  const zoo = await makeJob(owner, company, "zoo", { tech, date: day, time: "08:00" });
  await makeJob(owner, company, "goodyear", { tech, date: day, time: "11:00" });
  await makeJob(owner, company, "scottsdale", { tech, date: day, time: "14:00", fixed: true });
  await makeJob(owner, company, "tempe", {});

  // Tall enough that the tray and every tech's route are on screen together (for dragging).
  await page.setViewportSize({ width: 1400, height: 2400 });
  await signIn(page, OWNER, "/jobs");
  await page.goto(`/schedule?view=day&date=${day}&tech=all`);
  const route = page.getByRole("region", { name: "Priya Shah" });
  await expect(route.getByTestId("stop")).toHaveCount(3);
  expect(await routeNames(page, "Priya Shah")).toEqual([
    name("zoo"),
    name("goodyear"),
    name("scottsdale"),
  ]);
  await expect(route.getByText(/^3 stops · .* driving · back by /)).toBeVisible();

  // 1. Plan Route: Goodyear no longer sits between the east-side stops, and the promised
  //    2:00 PM stays.
  await route.getByRole("button", { name: "Plan Route" }).click();
  await expect(page.getByText(/^Planned: .* less than before/)).toBeVisible();
  await expect(
    route.getByRole("article", { name: `2:00 PM, ${name("scottsdale")}` }),
  ).toBeVisible();
  const planned = await routeNames(page, "Priya Shah");
  expect(planned).toHaveLength(3);
  expect(planned.indexOf(name("goodyear"))).not.toBe(1);
  await expect(route.getByRole("link", { name: "Open Route in Google Maps" })).toHaveAttribute(
    "href",
    /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/,
  );

  // 2. Move… from the tray: first stop of Priya's day.
  const tray = page.getByTestId("tray");
  const tempe = tray.getByTestId("tray-job").filter({ hasText: name("tempe") });
  // The card's actions are behind "…" (owner, 2026-10-18: shorter cards).
  await tempe.getByRole("button", { name: `Actions for ${name("tempe")}` }).click();
  await page
    .getByRole("dialog", { name: name("tempe") })
    .getByRole("button", { name: "Move…" })
    .click();
  const sheet = page.getByRole("dialog", { name: `Move ${name("tempe")}` });
  await sheet.getByLabel("Tech").selectOption({ label: "Priya Shah" });
  await sheet.getByLabel("Day").fill(day);
  await sheet.getByLabel("Place in the route").selectOption({ label: "First stop" });
  await sheet.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByText(/^Moved to \d/)).toBeVisible();
  await expect(route.getByTestId("stop")).toHaveCount(4);
  expect((await routeNames(page, "Priya Shah"))[0]).toBe(name("tempe"));
  await expect(tray.getByTestId("tray-job").filter({ hasText: name("tempe") })).toHaveCount(0);

  // 3. Drag it back to the tray: off the schedule.
  const grip = route.getByRole("button", { name: `Drag ${name("tempe")}` });
  const box = (await grip.boundingBox())!;
  const target = (await tray.getByRole("heading", { name: /^Needs a Time/ }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 20, { steps: 5 });
  await page.mouse.move(target.x + 40, target.y + target.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByText("Taken off the schedule.")).toBeVisible();
  await expect(route.getByTestId("stop")).toHaveCount(3);
  await expect(tray.getByTestId("tray-job").filter({ hasText: name("tempe") })).toHaveCount(1);

  // 3b. Taking a job away from its tech puts it in Needs a Time, keeping its booked time.
  await route
    .getByRole("article", { name: new RegExp(name("zoo")) })
    .getByRole("button", { name: "Move…" })
    .click();
  const zooSheet = page.getByRole("dialog", { name: `Move ${name("zoo")}` });
  await zooSheet.getByLabel("Tech").selectOption({ label: "Nobody yet (waits in Needs a Time)" });
  await zooSheet.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByText(/^No tech yet, so it’s in Needs a Time/)).toBeVisible();
  await expect(route.getByTestId("stop")).toHaveCount(2);
  await expect(tray.getByTestId("tray-job").filter({ hasText: name("zoo") })).toContainText(
    /No tech yet · booked .* at \d/,
  );

  // 4. Suggest Times fits it into the routes already planned this week; pick the best.
  const card = tray.getByTestId("tray-job").filter({ hasText: name("tempe") });
  await card.getByRole("button", { name: `Actions for ${name("tempe")}` }).click();
  await page
    .getByRole("dialog", { name: name("tempe") })
    .getByRole("button", { name: "Suggest Times" })
    .click();
  // The suggestions open in a sheet.
  const list = page
    .getByRole("dialog", { name: "Suggested Times" })
    .getByRole("list", { name: "Suggested times" });
  await expect(list.getByRole("listitem").first()).toContainText(/Adds (no driving|.* of driving)/);
  await list
    .getByRole("button", { name: /^Schedule / })
    .first()
    .click();
  await expect(page.getByText(/^Moved to \d/)).toBeVisible();
  await expect(tray.getByTestId("tray-job").filter({ hasText: name("tempe") })).toHaveCount(0);

  // 5. The job's address links to directions to the pool's spot (Google Maps off Apple
  //    devices).
  await page.goto(`/jobs/${zoo}`);
  await expect(
    page.getByRole("link", { name: /^455 N Galvin Pkwy.*directions in Maps$/ }),
  ).toHaveAttribute("href", /^\/maps\?to=455\+N\+Galvin/);
  const href = (await page
    .getByRole("link", { name: /^455 N Galvin Pkwy.*directions in Maps$/ })
    .getAttribute("href"))!;
  expect(await mapsTarget(page, href)).toMatch(
    /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=33\.45006%2C-111\.94886/,
  );
  // An iPhone gets Apple Maps; a device set to Google Maps (More) gets Google, every time.
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
  expect(await mapsTarget(page, href, { "user-agent": IPHONE })).toMatch(
    /^https:\/\/maps\.apple\.com\/\?daddr=33\.45006%2C-111\.94886/,
  );
  expect(await mapsTarget(page, href, { "user-agent": IPHONE, cookie: "lb_maps=google" })).toMatch(
    /^https:\/\/www\.google\.com\/maps\//,
  );
});

test("Today shows a tech's route with directions", async ({ page }) => {
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const { data: priya } = await owner
    .from("profile")
    .select("id")
    .eq("email", "priya@demo.leakbook.test")
    .single();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(
    new Date(),
  );
  await makeJob(owner, membership!.company_id as string, "scottsdale", {
    tech: priya!.id as string,
    date: today,
    time: "21:00",
  });

  await signIn(page, OWNER, "/jobs");
  await page.goto(`/today?tech=${priya!.id}`);
  await expect(page.getByRole("heading", { name: "Today · Priya Shah" })).toBeVisible();
  await expect(page.getByTestId("today-summary")).toContainText(/stops? · .* driving/);
  // The card at the top for the stop she's on (owner, 2026-10-20): the Live Activity's words and
  // a segment per stop. On My Way and Start Job are hers to press, so an owner doesn't get them.
  const hero = page.getByTestId("today-hero");
  await expect(hero).toBeVisible();
  await expect(hero).toContainText(/Stop \d+ of \d+/);
  await expect(hero.getByTestId("hero-progress")).toHaveAttribute("aria-label", /\d+ of \d+/);
  await expect(hero.getByRole("button", { name: /On My Way|Start Job/ })).toHaveCount(0);
  // In the list, that stop is one row marked Now.
  await expect(page.getByTestId("today-stop").filter({ hasText: "Now" })).toHaveCount(1);
  const stop = page.getByTestId("today-stop").filter({ hasText: name("scottsdale") });
  // Stops are one row except the one you're on (owner, 2026-10-19); a tap opens it.
  const toggle = stop.getByRole("button", { expanded: false });
  if (await toggle.count()) await toggle.first().click();
  await expect(stop.getByRole("button", { name: /^Mark Complete for/ })).toBeVisible();
  const href = (await stop.getByTestId("address-link").getAttribute("href"))!;
  expect(await mapsTarget(page, href)).toMatch(/destination=33\.4919%2C-111\.9236/);
  await expect(page.getByRole("link", { name: "Open Route in Google Maps" })).toBeVisible();
});
