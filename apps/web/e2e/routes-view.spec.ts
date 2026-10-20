import { expect, test } from "@playwright/test";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";

// Schedule › Routes (owner, 2026-10-20, docs/plans/route-maps.md part 3): which weekday each
// pool customer is serviced on, and by whom. Its own customer and plan, and Jake (other specs
// use Priya). CI has no Mapbox key, so no maps are drawn: the page must work the same.

const NAME = `Routes ${RUN}`;

/** The Monday after next, so the plan starts on a day of its own. */
function nextMonday(): string {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

test("a customer to add moves to Jake's Tuesday with Move…, and Undo puts it back", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const company = membership!.company_id as string;
  const { data: jake } = await owner
    .from("profile")
    .select("id")
    .eq("email", "jake@demo.leakbook.test")
    .single();
  const jakeId = jake!.id as string;

  // A pool customer on a plan with nobody on it: it waits in Customers to Add.
  const { data: customer, error: e1 } = await owner
    .from("customer")
    .insert({ company_id: company, name: NAME })
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
      assigned_user_id: null,
      starts_on: nextMonday(),
      interval_weeks: 1,
      duration_minutes: 30,
    })
    .select("id")
    .single();
  if (e3) throw e3;
  const row = () =>
    owner
      .from("service_plan")
      .select("starts_on, weekdays, assigned_user_id")
      .eq("id", plan!.id)
      .single()
      .then((r) => r.data!);

  try {
    await page.setViewportSize({ width: 1400, height: 1200 });
    await signIn(page, OWNER, "/jobs");
    await page.goto(`/schedule?view=week`);
    // Owners and admins get a fourth view.
    await page
      .getByRole("navigation", { name: "View" })
      .getByRole("link", { name: "Routes" })
      .click();
    await page.waitForURL(/view=routes/);
    await page.goto(`/schedule?view=routes&tech=${jakeId}`);

    const toAdd = page.getByTestId("customers-to-add");
    await expect(toAdd.getByRole("heading", { name: /^Customers to Add/ })).toBeVisible();
    const card = toAdd.getByRole("button", { name: new RegExp(NAME) });
    await expect(card).toBeVisible();
    await expect(page.getByRole("button", { name: "Jake Turner", pressed: true })).toBeVisible();
    // No map image is broken (none are drawn without a Mapbox key).
    const broken = await page
      .locator('[data-testid="day-map"] img')
      .evaluateAll(
        (imgs) =>
          (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).length,
      );
    expect(broken).toBe(0);

    // Move…: Tuesday, for Jake.
    await card.click();
    const sheet = page.getByRole("dialog", { name: `Move ${NAME}` });
    await sheet
      .getByRole("radiogroup", { name: "Day" })
      .getByRole("radio", { name: "Tue" })
      .click();
    await sheet.getByRole("radio", { name: "Jake Turner" }).click();
    await sheet.getByRole("button", { name: "Move to Tuesday" }).click();

    const notice = page.getByTestId("routes-notice").filter({ visible: true });
    await expect(notice).toContainText("Moved to Tuesday. Its coming visits moved too.");
    const tuesday = page
      .getByTestId("route-day")
      .filter({ has: page.getByRole("heading", { name: "Tuesday" }) });
    await expect(tuesday.getByRole("button", { name: new RegExp(NAME) })).toBeVisible();
    await expect(toAdd.getByRole("button", { name: new RegExp(NAME) })).toHaveCount(0);
    await expect.poll(async () => (await row()).assigned_user_id).toBe(jakeId);
    const moved = await row();
    expect(weekdayOf(moved.starts_on as string)).toBe(2);

    // Undo puts it back in Customers to Add.
    await notice.getByRole("button", { name: "Undo" }).click();
    await expect(notice).toContainText("Put back as it was.");
    await expect(toAdd.getByRole("button", { name: new RegExp(NAME) })).toBeVisible();
    await expect(tuesday.getByRole("button", { name: new RegExp(NAME) })).toHaveCount(0);
    await expect.poll(async () => (await row()).assigned_user_id).toBeNull();
  } finally {
    // The plan ends, so its visits leave the demo schedule.
    await owner
      .from("service_plan")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", plan!.id);
  }
});
