import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";

// Locks, Plan Week and day maps (owner, 2026-10-20, docs/plans/route-maps.md). CI has no Mapbox
// key, so the maps aren't drawn there: the page must work the same without them.

const PLACES = {
  goodyear: {
    address_line1: "1933 S Ballpark Way",
    city: "Goodyear",
    postal_code: "85338",
    lat: 33.4283,
    lng: -112.3887,
  },
  zoo: {
    address_line1: "455 N Galvin Pkwy",
    city: "Phoenix",
    postal_code: "85008",
    lat: 33.45006,
    lng: -111.94886,
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

const name = (p: Place) => `${p[0]!.toUpperCase()}${p.slice(1)} Week ${RUN}`;

/** A weekday 2 to 10 months out, so the test has the week to itself. */
function quietDay(): string {
  const d = new Date(Date.now() + (60 + Math.floor(Math.random() * 240)) * 86_400_000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const at = (date: string, hhmm: string) => `${date}T${hhmm}:00-07:00`;

async function setup() {
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  return { owner, company: membership!.company_id as string };
}

async function techId(db: SupabaseClient, email: string): Promise<string> {
  const { data } = await db.from("profile").select("id").eq("email", email).single();
  return data!.id as string;
}

/** Today in the demo shop's time zone (Phoenix). */
const phoenixToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date());
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The Monday of a date's week (the schedule's weeks start on Monday). */
const weekOf = (date: string) =>
  addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));

async function makeJob(
  db: SupabaseClient,
  company: string,
  place: Place,
  job: { tech?: string; date?: string; time?: string },
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
  return id as string;
}

/** No map image on the page is broken (none are drawn without a Mapbox key). */
async function noBrokenMaps(page: Page) {
  const broken = await page
    .locator('[data-testid="day-map"] img')
    .evaluateAll(
      (imgs) =>
        (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).length,
    );
  expect(broken).toBe(0);
}

test("a day lock set on the job shows on its schedule card", async ({ page }) => {
  test.setTimeout(120_000);
  const { owner, company } = await setup();
  const tech = await techId(owner, "jake@demo.leakbook.test");
  const day = quietDay();
  const id = await makeJob(owner, company, "zoo", { tech, date: day, time: "09:00" });

  await page.setViewportSize({ width: 1400, height: 1400 });
  await signIn(page, OWNER, "/jobs");
  await page.goto(`/jobs/${id}`);
  await page.getByRole("button", { name: "Change Schedule" }).click();
  const sheet = page.getByRole("dialog", { name: "Schedule" });
  const lock = sheet.getByRole("radiogroup", { name: "Lock" });
  await expect(lock.getByRole("radio", { name: "None" })).toHaveAttribute("aria-checked", "true");
  await lock.getByRole("radio", { name: "Day" }).click();
  await expect(
    sheet.getByText("Stays on its day. Planning may change its time that day."),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Save Schedule" }).click();
  // Only the lock changed, so saving says what it holds (owner, 2026-10-20).
  await expect(page.getByText("Day locked.", { exact: true })).toBeVisible();
  // The job's schedule says so.
  await expect(page.getByText("Day locked", { exact: true })).toBeVisible();

  await page.goto(`/schedule?view=day&date=${day}&tech=all`);
  const card = page
    .getByRole("region", { name: "Jake Turner" })
    .getByRole("article", { name: `9:00 AM, ${name("zoo")}` });
  await expect(card.getByTestId("lock-tag")).toHaveText("Day locked");
  await noBrokenMaps(page);

  // The week's card too.
  await page.goto(`/schedule?view=week&date=${day}&tech=all`);
  await expect(
    page
      .getByTestId("stop")
      .filter({ hasText: name("zoo") })
      .getByTestId("lock-tag"),
  ).toHaveText("Day locked");
});

test("Plan Week places a tech's own waiting jobs on a week ahead, and Undo puts them back", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Jake: no other spec uses him. Three weeks out: no other spec books that far.
  const { owner, company } = await setup();
  const jake = await techId(owner, "jake@demo.leakbook.test");
  const luis = await techId(owner, "luis@demo.leakbook.test");
  const monday = weekOf(addDays(phoenixToday(), 21));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // One booked stop that week, two of his jobs waiting for a time, and Luis's job, which
  // must not move.
  await makeJob(owner, company, "zoo", { tech: jake, date: week[2], time: "09:00" });
  const waiting = [
    await makeJob(owner, company, "scottsdale", { tech: jake }),
    await makeJob(owner, company, "tempe", { tech: jake }),
  ];
  const other = await makeJob(owner, company, "goodyear", {
    tech: luis,
    date: week[1],
    time: "10:00",
  });
  const row = (id: string) =>
    owner
      .from("job")
      .select("status, assigned_user_id, scheduled_start, scheduled_end, route_order")
      .eq("id", id)
      .single()
      .then((r) => r.data!);
  const otherBefore = await row(other);

  await page.setViewportSize({ width: 1400, height: 1600 });
  await signIn(page, OWNER, "/jobs");
  await page.goto(`/schedule?view=week&date=${monday}&tech=${jake}`);
  await expect(page.getByRole("heading", { name: /Routes|This Week/ })).toBeVisible();
  await noBrokenMaps(page);
  // The map address answers without breaking anything: drawn, not set up, or used up.
  const res = await page.request.get(
    `/api/map?company=${company}&pins=${encodeURIComponent("s:33.45006,-111.94886")}&w=360&h=240`,
  );
  expect([200, 429, 503]).toContain(res.status());

  await page.getByRole("button", { name: "Plan Week" }).click();
  const sheet = page.getByRole("dialog", { name: "Plan Week" });
  await expect(sheet.getByText(/^Puts this week’s movable jobs on days/)).toBeVisible();
  await sheet.getByRole("radio", { name: "Jake Turner" }).click();
  await expect(sheet.getByRole("radio", { name: "Jake Turner" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Leave other jobs in Needs a Time where they are (the switch shows when any are waiting).
  const fromTray = sheet.getByRole("switch", { name: /Place Jobs from Needs a Time/ });
  if (await fromTray.count()) await fromTray.uncheck();
  await sheet.getByRole("button", { name: "Plan Week" }).click();

  const result = page.getByTestId("plan-week-result");
  await expect(result).toContainText(/^Moved \d+ jobs?/);
  for (const id of waiting) {
    const j = await row(id);
    expect(j.status).toBe("scheduled");
    expect(j.assigned_user_id).toBe(jake);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(
      new Date(j.scheduled_start!),
    );
    expect(week).toContain(day);
  }
  for (const p of ["scottsdale", "tempe"] as const)
    await expect(
      page
        .getByRole("table")
        .getByTestId("stop")
        .filter({ hasText: name(p) }),
    ).toHaveCount(1);
  // Nothing of anyone else's moved.
  expect(await row(other)).toEqual(otherBefore);

  await result.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Put back as it was.")).toBeVisible();
  for (const id of waiting) {
    const j = await row(id);
    expect(j.status).toBe("unscheduled");
    expect(j.scheduled_start).toBeNull();
    expect(j.assigned_user_id).toBe(jake);
  }
  expect(await row(other)).toEqual(otherBefore);
});
