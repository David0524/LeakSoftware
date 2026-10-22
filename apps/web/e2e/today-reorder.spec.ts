import { expect, test, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";

// Today: change the order of stops (owner, 2026-10-20; docs/plans/today-reorder.md). Do Later
// moves a stop after every stop still to do, with an inline Undo that puts back the saved
// times; Reorder (in the bar) is an edit mode with drag handles, and Move Up / Move Down for
// keyboards; started stops show a lock.

const TZ = "America/Phoenix"; // The demo shop, UTC−7 all year.
const SCREENS = process.env.E2E_SCREENSHOTS;

/** The shop's today and minutes after midnight now. */
function shopNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    min: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

const clock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Three short stops for the demo tech later today, near each other (the Phoenix Zoo). */
async function makeDay(owner: SupabaseClient, tech: string, startMin: number, date: string) {
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const ids: string[] = [];
  for (const [i, letter] of ["A", "B", "C"].entries()) {
    const start = `${date}T${clock(startMin + i * 40)}:00-07:00`;
    const { data: id, error } = await owner.rpc("create_job", {
      target_company: membership!.company_id,
      new_customer: { name: `Reorder ${letter} ${RUN}`, phone: "602-555-0142" },
      existing_customer: null,
      new_property: {
        address_line1: "455 N Galvin Pkwy",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85008",
        has_spa: false,
      },
      existing_property: null,
      job: {
        status: "scheduled",
        scheduled_start: start,
        scheduled_end: new Date(Date.parse(start) + 20 * 60_000).toISOString(),
        assigned_user_id: tech,
      },
      components: [],
    });
    if (error) throw error;
    const { data: row } = await owner.from("job").select("property_id").eq("id", id).single();
    await owner
      .from("property")
      .update({ latitude: 33.45006, longitude: -111.94886, location_source: "manual" })
      .eq("id", row!.property_id);
    ids.push(id as string);
  }
  return ids;
}

const stopName = (letter: string) => `Reorder ${letter} ${RUN}`;
const row = (page: Page, letter: string) =>
  page.getByTestId("today-stop").filter({ hasText: stopName(letter) });

/** This run's stops, in the order Today lists them. */
async function order(page: Page) {
  const labels = await page
    .getByTestId("today-stop")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return labels
    .map((l) => /Reorder ([ABC]) /.exec(l)?.[1])
    .filter((l): l is string => !!l)
    .join("");
}

/** Every stop still to do, last included: is this run's stop the last of them? */
async function lastStop(page: Page) {
  const labels = await page
    .getByTestId("today-stop")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return labels.at(-1) ?? "";
}

/** The stop's time on its row ("2:15 PM"). */
async function timeOf(stop: Locator) {
  const text = await stop.innerText();
  return /\d{1,2}:\d\d\s?[AP]M/.exec(text)?.[0] ?? "";
}

test.describe("Today: change the order of stops", () => {
  let owner: SupabaseClient;
  let ids: string[] = [];
  // The demo tech's other stops today, as saved, to put back afterwards (a move can retime them).
  let saved: {
    id: string;
    scheduled_start: string;
    scheduled_end: string | null;
    route_order: number | null;
  }[] = [];

  test.beforeEach(async () => {
    const now = shopNow();
    owner = await signedInClient(OWNER.email, OWNER.password);
    const { data: tech } = await owner
      .from("profile")
      .select("id")
      .eq("email", TECH.email)
      .single();
    const { data: day } = await owner
      .from("job")
      .select("id, scheduled_start, scheduled_end, route_order")
      .eq("assigned_user_id", tech!.id)
      .gte("scheduled_start", `${now.date}T00:00:00-07:00`)
      .lt("scheduled_start", `${now.date}T23:59:59-07:00`);
    saved = (day ?? []) as typeof saved;
    const start = Math.ceil((now.min + 20) / 10) * 10;
    test.skip(start + 120 > 23 * 60 + 30, "Too late in the shop's day to plan three stops.");
    // The demo tech's other stops move to tomorrow for the test (afterEach puts them back), so
    // this run's three are the whole day at any hour: a started demo stop between them would
    // change the moves.
    const day1 = (iso: string | null) =>
      iso ? new Date(Date.parse(iso) + 24 * 60 * 60_000).toISOString() : null;
    for (const j of saved)
      await owner
        .from("job")
        .update({ scheduled_start: day1(j.scheduled_start), scheduled_end: day1(j.scheduled_end) })
        .eq("id", j.id);
    ids = await makeDay(owner, tech!.id as string, start, now.date);
  });

  test.afterEach(async () => {
    // Clean up: this run's stops leave the demo tech's day.
    if (ids.length)
      await owner.from("job").update({ deleted_at: new Date().toISOString() }).in("id", ids);
    for (const { id, ...was } of saved) await owner.from("job").update(was).eq("id", id);
  });

  test("Do Later moves the first stop last, and Undo puts it back", async ({ page }) => {
    await signIn(page, TECH, "/today");
    await expect(row(page, "A")).toBeVisible();
    expect(await order(page)).toBe("ABC");
    const a = row(page, "A");
    const before = await timeOf(a);

    await a.getByRole("button", { name: `Show ${stopName("A")}` }).click();
    await a.getByRole("button", { name: `Do Later for ${stopName("A")}` }).click();
    // In its place for five seconds: "Moved" (no clock times, owner 2026-10-21), and Undo.
    const notice = a.getByRole("status").filter({ hasText: /^Moved/ });
    await expect(notice).toBeVisible();
    await expect.poll(() => order(page)).toBe("BCA");
    expect(await lastStop(page)).toContain(stopName("A"));
    expect(await timeOf(row(page, "A"))).not.toBe(before);
    if (SCREENS) await page.screenshot({ path: `${SCREENS}/today-do-later.png`, fullPage: true });

    await row(page, "A")
      .getByRole("button", { name: `Undo Do Later for ${stopName("A")}` })
      .click();
    await expect.poll(() => order(page)).toBe("ABC");
    await expect.poll(() => timeOf(row(page, "A"))).toBe(before);
    // The saved times came back exactly.
    const { data } = await owner.from("job").select("id, scheduled_start").in("id", ids);
    const startOf = (id: string) => Date.parse(data!.find((j) => j.id === id)!.scheduled_start);
    expect(startOf(ids[0]!)).toBeLessThan(startOf(ids[1]!));
  });

  test("Reorder: Move Down changes the order and the times; a started stop is locked", async ({
    browser,
  }) => {
    // On a phone.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const tech = await signedInClient(TECH.email, TECH.password);
    const { error } = await tech.from("job").update({ status: "in_progress" }).eq("id", ids[2]!);
    expect(error).toBeNull();

    await signIn(page, TECH, "/today");
    await expect(row(page, "A")).toBeVisible();
    const aBefore = await timeOf(row(page, "A"));
    if (SCREENS) await page.screenshot({ path: `${SCREENS}/today-reorder-bar.png` });
    await page.getByTestId("today-reorder").getByRole("button", { name: "Reorder" }).click();
    // Edit mode: Today's card steps aside, and each stop has its controls.
    await expect(page.getByTestId("today-hero")).toHaveCount(0);
    await expect(row(page, "C").getByTestId("reorder-lock")).toHaveText("Started");
    await expect(row(page, "C").getByRole("button", { name: /^Move/ })).toHaveCount(0);
    await expect(row(page, "A").getByTestId("reorder-handle")).toBeVisible();
    if (SCREENS) await page.screenshot({ path: `${SCREENS}/today-reorder.png`, fullPage: true });

    // No Move Up / Move Down in sight (owner, 2026-10-22): the handle is how fingers move a
    // stop; the buttons show for a keyboard once focused.
    const down = row(page, "A").getByRole("button", { name: `Move Down ${stopName("A")}` });
    await expect(down).not.toBeInViewport();
    await down.focus();
    await expect(down).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect.poll(() => order(page)).toMatch(/^BA|B.*A/);
    await expect.poll(() => timeOf(row(page, "A"))).not.toBe(aBefore);

    await page.getByTestId("today-reorder").getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("today-hero")).toBeVisible();
    await expect(row(page, "A").getByTestId("reorder-handle")).toHaveCount(0);
    await context.close();
  });
});
