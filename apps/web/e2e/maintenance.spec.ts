import { expect, test } from "@playwright/test";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";

// Maintenance (owner request, 2026-10-13): an owner adds a weekly cleaning plan on the
// customer's page; its 30-minute visits appear on the tech's route; the tech runs one (service
// checklist, Complete Job); pausing the plan takes the upcoming visits off the schedule.

/** Tomorrow in the demo shop's time zone (Phoenix), as YYYY-MM-DD. */
function tomorrow(): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Phoenix" }).format(
    new Date(),
  );
  return new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

test("a weekly cleaning plan puts visits on the route, and a visit is marked done", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const name = `Weekly Cleaning ${RUN}`;
  const { data: jobId, error } = await owner.rpc("create_job", {
    target_company: membership!.company_id,
    new_customer: { name },
    existing_customer: null,
    new_property: { address_line1: "455 N Galvin Pkwy", city: "Phoenix", state: "AZ" },
    existing_property: null,
    job: { status: "unscheduled" },
    components: [],
  });
  if (error) throw error;
  const { data: job } = await owner
    .from("job")
    .select("bill_to_customer_id")
    .eq("id", jobId)
    .single();
  const day = tomorrow();

  // 1. The owner adds the plan on the customer's page.
  await signIn(page, OWNER, "/jobs");
  await page.goto(`/customers/${job!.bill_to_customer_id}`);
  await page.getByRole("button", { name: "Add Maintenance Plan" }).click();
  await page.getByLabel("First visit").fill(day);
  await page.getByLabel("Tech", { exact: true }).selectOption({ label: "Priya Shah" });
  await page.getByLabel("Price per month ($)").fill("95");
  await expect(page.getByLabel("Visit length (minutes)")).toHaveValue("30");
  await page.getByRole("button", { name: "Add Plan" }).click();
  const plan = page.getByTestId("plan");
  await expect(plan).toContainText(/^Every \w+day · any time · 30 min · \$95\.00 a month/);
  await expect(plan).toContainText("Priya Shah");

  // 2. Tomorrow's visit is on Priya's route, a Maintenance visit (the kind is read out and is
  // in its menu, no longer drawn on the tile: docs/design/2026-10-21-schedule-tile.md).
  await page.goto(`/schedule?view=day&date=${day}&tech=all`);
  const route = page.getByRole("region", { name: "Priya Shah" });
  const stop = route.getByTestId("stop").filter({ hasText: name });
  await expect(stop).toHaveAttribute("aria-label", /Maintenance/);

  // 3. The visit: started, the service checklist done, then Complete Job (in the header and
  // under the checklist).
  await stop.getByRole("link").first().click();
  await expect(page.getByRole("link", { name: "Maintenance plan" })).toBeVisible();
  // A visit has no Wrap-Up (owner, 2026-10-19).
  await expect(page.getByText("Wrap-Up", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Start Job" }).click();
  await expect(page.getByText(/^0 done · 0 need attention · 0 skipped · 7 to do$/)).toBeVisible();
  // Each item's answers are a segmented control: Done · Needs Attention · Skipped (owner,
  // 2026-10-20).
  const first = page.locator("#part-checklist").getByRole("radiogroup").first();
  await first.getByRole("radio", { name: "Done", exact: true }).click();
  await expect(page.getByText(/^1 done · 0 need attention · 0 skipped · 6 to do$/)).toBeVisible();
  await expect(first.getByRole("radio", { name: "Done", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: /^Mark 6 Remaining Done$/ }).click();
  await expect(page.getByText(/^7 done · 0 need attention · 0 skipped · 0 to do$/)).toBeVisible();
  // For five seconds the shortcut's place holds "Marked 6" and Undo (owner, 2026-10-20).
  await expect(page.getByText("Marked 6", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete Job" })).toHaveCount(2);
  await page.getByRole("button", { name: "Complete Job" }).last().click();
  // An Automatic shop asks before the visit report goes out (owner, 2026-10-20).
  const ask = page.getByRole("alertdialog", { name: "Ready to send the visit report?" });
  const reopen = page.getByRole("button", { name: "Reopen Visit" });
  await expect(ask.or(reopen)).toBeVisible();
  if (await ask.isVisible()) await ask.getByRole("button", { name: "Complete and Send" }).click();
  await expect(reopen).toBeVisible();
  await page.goto(`/customers/${job!.bill_to_customer_id}`);
  await expect(page.getByTestId("plan")).toContainText("1 done");

  // 4. Paused: upcoming visits leave the schedule.
  // The plan is a row; its sheet holds Pause, End Plan, and the plan's details.
  await page.getByTestId("plan").getByRole("button").click();
  await page
    .getByRole("dialog", { name: "Maintenance Plan" })
    .getByRole("button", { name: "Pause" })
    .click();
  await expect(page.getByText("Paused. Upcoming visits are off the schedule.")).toBeVisible();
  const nextWeek = new Date(Date.parse(`${day}T12:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await page.goto(`/schedule?view=day&date=${nextWeek}&tech=all`);
  await expect(page.getByRole("region", { name: "Priya Shah" })).toBeVisible();
  await expect(page.getByTestId("stop").filter({ hasText: name })).toHaveCount(0);
});

// Owner request, 2026-10-13: "There is no way to add a maintenance job." New Job books a single
// maintenance visit, or starts a plan for a new customer in one step.
test("New Job books a maintenance visit, or starts a plan for a new customer", async ({ page }) => {
  test.setTimeout(180_000);
  const day = tomorrow();

  // Just once: a maintenance job, no leak checklist.
  await signIn(page, OWNER, "/jobs/new");
  const once = `One Cleaning ${RUN}`;
  await page.getByRole("radio", { name: "New", exact: true }).click();
  await page.getByLabel("Name").fill(once);
  await page.getByLabel("Street address").fill("455 N Galvin Pkwy");
  await page.getByLabel("City").fill("Phoenix");
  await page.getByLabel("State", { exact: true }).fill("AZ");
  await page.getByRole("radio", { name: "Service", exact: true }).click();
  await expect(page.getByLabel("Second tech (optional)")).toHaveCount(0);
  await page.getByLabel("Date").fill(day);
  await page.getByLabel("Tech", { exact: true }).selectOption({ label: "Priya Shah" });
  await page.getByRole("button", { name: "Create Job" }).click();
  await expect(page.getByText(/^Job #\d+$/).first()).toBeVisible();
  // The service checklist, not the leak one.
  await expect(page.getByText(/^0 done · 0 need attention · 0 skipped · 7 to do$/)).toBeVisible();

  // Its visit report (owner, 2026-10-20): sent by hand by default, opened at the customer link.
  const visit = page.getByRole("region", { name: "Visit Report" });
  await expect(visit).toContainText("The water test, the checklist and cleanings");
  await visit.getByRole("button", { name: /^(Send by Text|Get Link to Text)$/ }).click();
  await expect(visit.getByText(/^Visit report (texted|ready)/)).toBeVisible();
  const report = visit.getByRole("link", { name: "View Visit Report" });
  await page.goto((await report.getAttribute("href"))!);
  await expect(page.getByRole("heading", { name: "Pool Visit Report" })).toBeVisible();
  await page.goBack();

  // Weekly: the plan, on the new customer's page.
  await page.goto("/jobs/new");
  const weekly = `New Plan ${RUN}`;
  await page.getByRole("radio", { name: "New", exact: true }).click();
  await page.getByLabel("Name").fill(weekly);
  await page.getByLabel("Street address").fill("1201 N Galvin Pkwy");
  await page.getByLabel("City").fill("Phoenix");
  await page.getByLabel("State", { exact: true }).fill("AZ");
  await page.getByRole("radio", { name: "Service", exact: true }).click();
  await page.getByLabel("Repeats").selectOption("weekly");
  await page.getByLabel("First visit").fill(day);
  await page.getByLabel("Tech", { exact: true }).selectOption({ label: "Priya Shah" });
  await page.getByLabel("Price per month ($)").fill("110");
  await page.getByRole("button", { name: "Start Plan" }).click();
  await expect(page.getByRole("heading", { name: weekly })).toBeVisible();
  await expect(page.getByTestId("plan")).toContainText(
    /^Every \w+day · any time · 30 min · \$110\.00 a month/,
  );
});

// Owner, 2026-10-18: "schedule regular salt cell and filter cleanings". A plan's filter cleaning
// goes on the first visit on or after its due date, and only that one.
test("a plan's filter cleaning goes on the visit it's due", async ({ page }) => {
  test.setTimeout(180_000);
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const name = `Filter Cleaning ${RUN}`;
  const { data: jobId, error } = await owner.rpc("create_job", {
    target_company: membership!.company_id,
    new_customer: { name },
    existing_customer: null,
    new_property: { address_line1: "455 N Galvin Pkwy", city: "Phoenix", state: "AZ" },
    existing_property: null,
    job: { status: "unscheduled" },
    components: [],
  });
  if (error) throw error;
  const { data: job } = await owner
    .from("job")
    .select("bill_to_customer_id")
    .eq("id", jobId)
    .single();
  const day = tomorrow();
  const nextWeek = new Date(Date.parse(`${day}T12:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await signIn(page, OWNER, "/jobs");
  await page.goto(`/customers/${job!.bill_to_customer_id}`);
  await page.getByRole("button", { name: "Add Maintenance Plan" }).click();
  const sheet = page.getByRole("dialog", { name: "Add Maintenance Plan" });
  await sheet.getByLabel("First visit").fill(day);
  await sheet.getByLabel("Tech", { exact: true }).selectOption({ label: "Priya Shah" });
  await sheet.getByRole("switch", { name: "Clean filter" }).check();
  await sheet.getByRole("radio", { name: "3 Months" }).click();
  await sheet.getByLabel("Next due").fill(nextWeek);
  await sheet.getByLabel("Price each time ($)").fill("40");
  await sheet.getByRole("button", { name: "Add Plan" }).click();
  const plan = page.getByTestId("plan");
  // With how long until it's due (owner, 2026-10-19).
  await expect(plan).toContainText(
    /Clean filter every 3 months · \$40\.00 each · (In 1 week|Due in 7 days)/,
  );

  // Tomorrow's visit has the usual checklist; next week's has the filter cleaning too.
  const { data: visits } = await owner
    .from("job")
    .select("id, plan_date, job_component(label, deleted_at)")
    .eq("bill_to_customer_id", job!.bill_to_customer_id)
    .eq("type", "maintenance")
    .is("deleted_at", null)
    .in("plan_date", [day, nextWeek]);
  const labels = (d: string) =>
    (visits ?? [])
      .find((v) => v.plan_date === d)!
      .job_component.filter((c) => !c.deleted_at)
      .map((c) => c.label);
  expect(labels(day)).not.toContain("Clean filter");
  expect(labels(nextWeek)).toContain("Clean filter");
});

// Owner, 2026-10-18: "multiple times per week (then a day selector), weekly, every two weeks,
// monthly", priced by the month.
test("a plan can repeat on several days a week", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: who } = await owner.auth.getUser();
  const { data: membership } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const { data: jobId, error } = await owner.rpc("create_job", {
    target_company: membership!.company_id,
    new_customer: { name: `Twice Weekly ${RUN}` },
    existing_customer: null,
    new_property: { address_line1: "455 N Galvin Pkwy", city: "Phoenix", state: "AZ" },
    existing_property: null,
    job: { status: "unscheduled" },
    components: [],
  });
  if (error) throw error;
  const { data: job } = await owner
    .from("job")
    .select("bill_to_customer_id")
    .eq("id", jobId)
    .single();

  await signIn(page, OWNER, "/jobs");
  await page.goto(`/customers/${job!.bill_to_customer_id}`);
  await page.getByRole("button", { name: "Add Maintenance Plan" }).click();
  const sheet = page.getByRole("dialog", { name: "Add Maintenance Plan" });
  await sheet.getByLabel("First visit").fill(tomorrow());
  await sheet.getByRole("radio", { name: "2+ a Week" }).click();
  // Each day is a round toggle: the label around a visually hidden checkbox.
  const day = (name: string) => sheet.getByRole("checkbox", { name }).locator("..");
  await day("Monday").click();
  await expect(sheet.getByRole("checkbox", { name: "Monday" })).toBeChecked();
  await sheet.getByRole("button", { name: "Add Plan" }).click();
  await expect(sheet.getByText("Pick two or more days.")).toBeVisible();
  await day("Thursday").click();
  await sheet.getByLabel("Price per month ($)").fill("320");
  await sheet.getByRole("button", { name: "Add Plan" }).click();
  await expect(page.getByTestId("plan")).toContainText(
    "Every Monday and Thursday · any time · 30 min · $320.00 a month",
  );
});
