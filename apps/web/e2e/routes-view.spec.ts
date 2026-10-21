import { expect, test, type Page } from "@playwright/test";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";

// Routes went into Week (owner, 2026-10-20, docs/design/2026-10-20-team-week.md sections 5, 6
// and 8): Customers to Add sits in Week's left sidebar on a computer, below Needs a Time; a
// customer goes onto a tech's day by Move… or by dragging the whole tile; and moving a plan's
// visit asks Change Schedule or Just This Visit. Its own customers and plans, and Jake (other
// specs use Priya). CI has no Mapbox key, so no maps are drawn: the page must work the same.

/** The Monday after next, so the plan starts on a week of its own. */
function nextMonday(): string {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Owner = Awaited<ReturnType<typeof signedInClient>>;

async function setup() {
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const { data: jake } = await owner
    .from("profile")
    .select("id")
    .eq("email", "jake@demo.leakbook.test")
    .single();
  return { owner, company: membership!.company_id as string, jakeId: jake!.id as string };
}

/** A pool customer on a weekly plan starting `starts` (no tech: it waits in Customers to Add). */
async function makePlan(
  owner: Owner,
  company: string,
  name: string,
  starts: string,
  tech: string | null,
) {
  const { data: customer, error: e1 } = await owner
    .from("customer")
    .insert({ company_id: company, name })
    .select("id")
    .single();
  if (e1) throw e1;
  const { data: property, error: e2 } = await owner
    .from("property")
    .insert({
      company_id: company,
      customer_id: customer!.id,
      address_line1: "455 N Galvin Pkwy",
      city: "Phoenix",
      state: "AZ",
      postal_code: "85008",
      latitude: 33.45006,
      longitude: -111.94886,
      location_source: "manual",
    })
    .select("id")
    .single();
  if (e2) throw e2;
  const { data: plan, error: e3 } = await owner
    .from("service_plan")
    .insert({
      company_id: company,
      customer_id: customer!.id,
      property_id: property!.id,
      assigned_user_id: tech,
      starts_on: starts,
      interval_weeks: 1,
      duration_minutes: 30,
    })
    .select("id")
    .single();
  if (e3) throw e3;
  return plan!.id as string;
}

const planRow = (owner: Owner, id: string) =>
  owner
    .from("service_plan")
    .select("starts_on, weekdays, assigned_user_id")
    .eq("id", id)
    .single()
    .then((r) => r.data!);

const endPlan = (owner: Owner, id: string) =>
  owner.from("service_plan").update({ deleted_at: new Date().toISOString() }).eq("id", id);

async function openWeek(page: Page, monday: string, tech: string) {
  await page.setViewportSize({ width: 1400, height: 1200 });
  await signIn(page, OWNER, "/jobs");
  // Old Routes links open Week; Schedule has Day, Week and Month only.
  await page.goto(`/schedule?view=routes&date=${monday}&tech=${tech}`);
  await page.waitForURL(/view=week/);
  const views = page.getByRole("navigation", { name: "View" });
  await expect(views.getByRole("link", { name: "Week" })).toBeVisible();
  await expect(views.getByRole("link", { name: "Routes" })).toHaveCount(0);
}

test("Customers to Add is in Week's sidebar: Move… puts one on Jake's Tuesday, Undo puts it back", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { owner, company, jakeId } = await setup();
  const NAME = `Routes ${RUN}`;
  const monday = nextMonday();
  const plan = await makePlan(owner, company, NAME, monday, null);
  try {
    await openWeek(page, monday, jakeId);
    // On a computer: the sidebar on the left, Needs a Time first, then Customers to Add.
    const sidebar = page.getByTestId("week-sidebar");
    const toAdd = sidebar.getByTestId("customers-to-add");
    await expect(toAdd.getByRole("heading", { name: /^Customers to Add/ })).toBeVisible();
    const box = (await sidebar.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(270);
    expect(box.width).toBeLessThanOrEqual(290);
    expect(box.x).toBeLessThan((await page.getByRole("table").boundingBox())!.x);
    // Names that start with it: the row, not its "⋯" More button (gestures.md section 12).
    const card = toAdd.getByRole("button", { name: new RegExp(`^${NAME}`) });
    await expect(card).toBeVisible();

    // Move…: Tuesday, for Jake.
    await card.click();
    const sheet = page.getByRole("dialog", { name: `Move ${NAME}` });
    await sheet
      .getByRole("radiogroup", { name: "Day" })
      .getByRole("radio", { name: "Tue" })
      .click();
    await sheet.getByRole("radio", { name: "Jake Turner" }).click();
    await sheet.getByRole("button", { name: "Move to Tuesday" }).click();

    const notice = page.getByTestId("top-banner");
    await expect(notice).toContainText(`${NAME} is now on Tuesdays with Jake Turner`);
    await expect(toAdd.getByRole("button", { name: new RegExp(`^${NAME}`) })).toHaveCount(0);
    await expect.poll(async () => (await planRow(owner, plan)).assigned_user_id).toBe(jakeId);
    expect(weekdayOf((await planRow(owner, plan)).starts_on as string)).toBe(2);

    // Undo puts it back in Customers to Add.
    await notice.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("top-banner")).toContainText("Put back as it was.");
    await expect(toAdd.getByRole("button", { name: new RegExp(`^${NAME}`) })).toBeVisible();
    await expect.poll(async () => (await planRow(owner, plan)).assigned_user_id).toBeNull();

    // The whole tile drags, not only its grip (section 8): from its name onto Jake's Wednesday.
    // The sidebar scrolls on its own, and taking the tile out clamped its scroll, so the tile
    // can come back below what it shows: scroll to it first, as a person would, then measure.
    const name = toAdd.getByText(NAME, { exact: true });
    await name.scrollIntoViewIfNeeded();
    const from = (await name.boundingBox())!;
    const wednesday = page.getByRole("cell", { name: `Jake Turner, ${addDays(monday, 2)}` });
    const to = (await wednesday.boundingBox())!;
    await page.mouse.move(from.x + 10, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 30, from.y + from.height / 2, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.up();
    await expect(page.getByTestId("top-banner")).toContainText(
      `${NAME} is now on Wednesdays with Jake Turner`,
    );
    await expect.poll(async () => (await planRow(owner, plan)).assigned_user_id).toBe(jakeId);
    expect(weekdayOf((await planRow(owner, plan)).starts_on as string)).toBe(3);
  } finally {
    // The plan ends, so its visits leave the demo schedule.
    await endPlan(owner, plan);
  }
});

test("moving a plan visit asks: Just This Visit moves one, Change Schedule moves the plan", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { owner, company, jakeId } = await setup();
  const NAME = `Plan Visit ${RUN}`;
  const monday = nextMonday();
  // Jake's Mondays: its visits are on his Monday route.
  const plan = await makePlan(owner, company, NAME, monday, jakeId);
  const visit = () =>
    owner
      .from("job")
      .select("id, scheduled_start, plan_moved")
      .eq("service_plan_id", plan)
      .is("deleted_at", null)
      .order("scheduled_start")
      .limit(1)
      .single()
      .then((r) => r.data!);
  const localDay = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(new Date(iso));
  try {
    await expect.poll(async () => (await visit())?.scheduled_start ?? null).not.toBeNull();
    const first = await visit();
    expect(localDay(first.scheduled_start!)).toBe(monday);
    await openWeek(page, monday, jakeId);

    // Move… from the one-line card's menu (right-click), to Tuesday.
    const stop = () =>
      page
        .getByRole("table")
        .getByTestId("stop")
        .filter({ hasText: NAME })
        .getByTestId("stop-line");
    const moveTo = async (date: string) => {
      await stop().click({ button: "right" });
      await page.getByRole("menu").getByRole("menuitem", { name: "Move…" }).click();
      const sheet = page.getByRole("dialog", { name: `Move ${NAME}` });
      await sheet.getByLabel("Day").fill(date);
      await sheet.getByRole("button", { name: "Move", exact: true }).click();
    };
    const ask = page.getByRole("alertdialog", { name: `Move ${NAME}’s visits?` });

    // Cancel leaves it where it is.
    await moveTo(addDays(monday, 1));
    await expect(ask.getByRole("button", { name: "Change Schedule" })).toBeVisible();
    await ask.getByRole("button", { name: "Cancel" }).click();
    await expect(ask).toHaveCount(0);
    expect(localDay((await visit()).scheduled_start!)).toBe(monday);

    // Just This Visit: only this one moves, marked as moved; Undo puts it back.
    await moveTo(addDays(monday, 1));
    await ask.getByRole("button", { name: "Just This Visit" }).click();
    const banner = page.getByTestId("top-banner");
    await expect(banner).toContainText("Moved this visit only");
    await expect
      .poll(
        async () =>
          (await owner.from("job").select("plan_moved").eq("id", first.id).single()).data
            ?.plan_moved,
      )
      .toBe(true);
    // The plan itself stays on Mondays.
    expect(weekdayOf((await planRow(owner, plan)).starts_on as string)).toBe(1);
    await banner.getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(
        async () =>
          (await owner.from("job").select("plan_moved").eq("id", first.id).single()).data
            ?.plan_moved,
      )
      .toBe(false);

    // Change Schedule: the plan moves to Wednesdays with Jake; Undo puts it back on Mondays.
    await page.reload();
    await moveTo(addDays(monday, 2));
    await ask.getByRole("button", { name: "Change Schedule" }).click();
    await expect(page.getByTestId("top-banner")).toContainText(
      `${NAME} is now on Wednesdays with Jake Turner`,
    );
    await expect
      .poll(async () => weekdayOf((await planRow(owner, plan)).starts_on as string))
      .toBe(3);
    await page.getByTestId("top-banner").getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(async () => weekdayOf((await planRow(owner, plan)).starts_on as string))
      .toBe(1);
  } finally {
    await endPlan(owner, plan);
  }
});
