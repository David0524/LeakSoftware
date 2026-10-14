import { expect, test } from "@playwright/test";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";

// Maintenance (owner request, 2026-10-13): an owner adds a weekly cleaning plan on the
// customer's page; its 30-minute visits appear on the tech's route; the tech runs one (service
// checklist, Mark Done); pausing the plan takes the upcoming visits off the schedule.

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
  await page.getByLabel("Price per visit ($)").fill("95");
  await expect(page.getByLabel("Visit length (minutes)")).toHaveValue("30");
  await page.getByRole("button", { name: "Add Plan" }).click();
  const plan = page.getByTestId("plan");
  await expect(plan).toContainText(/^Every \w+day · any time · 30 min · \$95\.00 a visit/);
  await expect(plan).toContainText("Priya Shah");

  // 2. Tomorrow's visit is on Priya's route, 30 minutes, marked Maintenance.
  await page.goto(`/schedule?view=day&date=${day}&tech=all`);
  const route = page.getByRole("region", { name: "Priya Shah" });
  const stop = route.getByTestId("stop").filter({ hasText: name });
  await expect(stop).toContainText("Maintenance");

  // 3. The visit: started, the service checklist done, then Mark Done.
  await stop.getByRole("link").first().click();
  await expect(page.getByRole("link", { name: "Maintenance plan" })).toBeVisible();
  await page.getByRole("button", { name: "Start Job" }).click();
  await expect(page.getByText(/^0 done · 0 need attention · 0 skipped · 7 to do$/)).toBeVisible();
  await page.getByRole("button", { name: /^Mark 7 Remaining Done$/ }).click();
  await expect(page.getByText(/^7 done · 0 need attention · 0 skipped · 0 to do$/)).toBeVisible();
  await page.getByRole("button", { name: "Mark Done" }).click();
  await expect(page.getByText("Done", { exact: true }).first()).toBeVisible();
  await page.goto(`/customers/${job!.bill_to_customer_id}`);
  await expect(page.getByTestId("plan")).toContainText("1 done");

  // 4. Paused: upcoming visits leave the schedule.
  await page.getByTestId("plan").getByRole("button", { name: "Pause" }).click();
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
  await page.getByLabel("State").fill("AZ");
  await page.getByRole("radio", { name: "Maintenance" }).click();
  await expect(page.getByLabel("Second tech (optional)")).toHaveCount(0);
  await page.getByLabel("Date").fill(day);
  await page.getByLabel("Tech", { exact: true }).selectOption({ label: "Priya Shah" });
  await page.getByRole("button", { name: "Create Job" }).click();
  await expect(page.getByRole("heading", { name: /^Job #\d+$/ })).toBeVisible();
  // The service checklist, not the leak one.
  await expect(page.getByText(/^0 done · 0 need attention · 0 skipped · 7 to do$/)).toBeVisible();

  // Weekly: the plan, on the new customer's page.
  await page.goto("/jobs/new");
  const weekly = `New Plan ${RUN}`;
  await page.getByRole("radio", { name: "New", exact: true }).click();
  await page.getByLabel("Name").fill(weekly);
  await page.getByLabel("Street address").fill("1201 N Galvin Pkwy");
  await page.getByLabel("City").fill("Phoenix");
  await page.getByLabel("State").fill("AZ");
  await page.getByRole("radio", { name: "Maintenance" }).click();
  await page.getByRole("radio", { name: "Weekly" }).click();
  await page.getByLabel("First visit").fill(day);
  await page.getByLabel("Tech", { exact: true }).selectOption({ label: "Priya Shah" });
  await page.getByLabel("Price per visit ($)").fill("110");
  await page.getByRole("button", { name: "Start Plan" }).click();
  await expect(page.getByRole("heading", { name: weekly })).toBeVisible();
  await expect(page.getByTestId("plan")).toContainText(
    /^Every \w+day · any time · 30 min · \$110\.00 a visit/,
  );
});
