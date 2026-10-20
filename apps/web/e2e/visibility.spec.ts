import { expect, test, type Page } from "@playwright/test";
import { signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";

// Who sees which jobs (owner request, 2026-10-13): the owner chooses in Settings › Team
// whether techs see every job or only their own. Checked as Tony (the demo tech) against a
// job booked for Priya; the setting is put back at the end.

async function setTechsSee(page: Page, label: "Every Job" | "Only Their Own") {
  await page.goto("/settings/team");
  const card = page.locator("form").filter({ has: page.getByText("Techs see") });
  await card.getByRole("radio", { name: label }).click();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();
}

test("owners choose whether techs see every job or only their own", async ({ browser }) => {
  test.setTimeout(180_000);
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
  const customer = `Visibility Check ${RUN}`;
  const { data: jobId, error } = await owner.rpc("create_job", {
    target_company: membership!.company_id,
    new_customer: { name: customer },
    existing_customer: null,
    new_property: { address_line1: "1 E Washington St", city: "Phoenix", state: "AZ" },
    existing_property: null,
    job: { status: "unscheduled", assigned_user_id: priya!.id },
    components: [],
  });
  if (error) throw error;

  const ownerPage = await (await browser.newContext()).newPage();
  const techPage = await (await browser.newContext()).newPage();
  await signIn(ownerPage, OWNER, "/jobs");
  await signIn(techPage, TECH, "/jobs");

  try {
    // By default, Tony sees Priya's job.
    await techPage.goto(`/jobs?status=all&q=${encodeURIComponent(customer)}`);
    await expect(techPage.getByRole("row").filter({ hasText: customer })).toHaveCount(1);

    // Only their own: it's gone from the list and its page, and the schedule shows only
    // Tony's route.
    await setTechsSee(ownerPage, "Only Their Own");
    await techPage.goto(`/jobs?status=all&q=${encodeURIComponent(customer)}`);
    await expect(techPage.getByRole("heading", { name: "Jobs" })).toBeVisible();
    await expect(techPage.getByRole("row").filter({ hasText: customer })).toHaveCount(0);
    await techPage.goto(`/jobs/${jobId}`);
    await expect(techPage.getByText(/^Job #\d+$/)).toHaveCount(0);
    await techPage.goto("/schedule?view=day");
    await expect(techPage.getByRole("region", { name: "Tony Tech" })).toBeVisible();
    await expect(techPage.getByRole("region", { name: "Priya Shah" })).toHaveCount(0);

    // The owner still sees it.
    await ownerPage.goto(`/jobs?status=all&q=${encodeURIComponent(customer)}`);
    await expect(ownerPage.getByRole("row").filter({ hasText: customer })).toHaveCount(1);
  } finally {
    await setTechsSee(ownerPage, "Every Job");
  }

  // Back to every job.
  await techPage.goto(`/jobs?status=all&q=${encodeURIComponent(customer)}`);
  await expect(techPage.getByRole("row").filter({ hasText: customer })).toHaveCount(1);
});

// Owner, 2026-10-18: a setting for whether techs can make new jobs (on by default).
test("owners choose whether techs can make new jobs", async ({ browser }) => {
  test.setTimeout(120_000);
  const ownerPage = await (await browser.newContext()).newPage();
  await signIn(ownerPage, OWNER, "/settings/team");
  const card = ownerPage.locator("form").filter({ has: ownerPage.getByText("Techs see") });
  const makes = card.getByRole("switch", { name: "Techs can make new jobs" });
  await expect(makes).toBeChecked();
  try {
    await makes.uncheck();
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("Saved.")).toBeVisible();

    const techPage = await (await browser.newContext()).newPage();
    await signIn(techPage, TECH, "/jobs");
    await expect(techPage.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
    await expect(techPage.getByRole("link", { name: "New Job" })).toHaveCount(0);
    await techPage.goto("/jobs/new");
    await expect(techPage.getByText("Your office makes new jobs.")).toBeVisible();
    await techPage.context().close();
  } finally {
    await ownerPage.goto("/settings/team");
    await makes.check();
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("Saved.")).toBeVisible();
  }
});
