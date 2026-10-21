import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";

// Activity (owner, 2026-10-20; docs/plans/search-and-activity.md section 2): what happened in
// the shop, recorded by the database whoever caused it, and seen by whoever may see the job.

async function companyOf(db: SupabaseClient) {
  const { data: who } = await db.auth.getUser();
  const { data } = await db
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  return data!.company_id as string;
}

async function makeJob(db: SupabaseClient, name: string, assignee: string | null) {
  const { data: id, error } = await db.rpc("create_job", {
    target_company: await companyOf(db),
    new_customer: { name },
    existing_customer: null,
    new_property: { address_line1: "1 E Washington St", city: "Phoenix", state: "AZ" },
    existing_property: null,
    job: { status: "unscheduled", assigned_user_id: assignee },
    components: [],
  });
  if (error) throw error;
  return id as string;
}

async function setTechsSee(page: Page, label: "Every Job" | "Only Their Own") {
  await page.goto("/settings/team");
  const card = page.locator("form").filter({ has: page.getByText("Techs see") });
  await card.getByRole("radio", { name: label }).click();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();
}

test("an owner sees what a tech did, from the Dashboard and More › Activity", async ({
  browser,
}) => {
  const tech = await signedInClient(TECH.email, TECH.password);
  const { data: me } = await tech.auth.getUser();
  const name = `Activity Done ${RUN}`;
  const jobId = await makeJob(tech, name, me.user!.id);
  // Tony marks his stop done from the phone (any change that reaches the database counts).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  const { error } = await tech.from("job").update({ stop_done_on: today }).eq("id", jobId);
  if (error) throw error;

  const page = await (await browser.newContext()).newPage();
  await signIn(page, OWNER, "/dashboard");
  // Activity is a dropdown at the right of the title row (owner, 2026-10-21), with the dot.
  const button = page.getByRole("button", { name: "Activity, new activity" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const card = page.getByRole("region", { name: "Activity" });
  await expect(card).toBeFocused();
  const row = card.getByRole("link", { name: new RegExp(`Job completed.*${name}, by Tony`) });
  await expect(row).toBeVisible();
  // Escape closes it and puts focus back on the button; it opens again.
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();

  await card.getByRole("link", { name: "See All Activity" }).click();
  await page.waitForURL("**/activity");
  await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
  const today_ = page.getByRole("region", { name: "Today" });
  await expect(
    today_.getByRole("link", { name: new RegExp(`Job completed.*${name}, by Tony`) }),
  ).toBeVisible();
  // Opening Activity clears the dot.
  await expect(page.getByRole("button", { name: /^More/ }).getByText("New activity")).toHaveCount(
    0,
  );
  await today_.getByRole("link", { name: new RegExp(`Job completed.*${name}`) }).click();
  await page.waitForURL(`**/jobs/${jobId}`);
});

test("on a phone, the Dashboard's Activity button opens a sheet with See All", async ({
  browser,
}) => {
  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await signIn(page, OWNER, "/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  // In the navigation bar's row, beside the large title.
  const button = page.getByRole("button", { name: /^Activity/ });
  await button.click();
  const sheet = page.getByRole("dialog", { name: "Activity" });
  await expect(sheet.getByTestId("activity-row").first()).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await button.click();
  await sheet.getByRole("link", { name: "See All Activity" }).click();
  await page.waitForURL("**/activity");
  await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
});

test("a tech in an Only Their Own shop doesn't see another tech's job", async ({ browser }) => {
  test.setTimeout(180_000);
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: priya } = await owner
    .from("profile")
    .select("id")
    .eq("email", "priya@demo.leakbook.test")
    .single();
  const name = `Activity Hidden ${RUN}`;
  await makeJob(owner, name, priya!.id as string);

  const ownerPage = await (await browser.newContext()).newPage();
  const techPage = await (await browser.newContext()).newPage();
  await signIn(ownerPage, OWNER, "/activity");
  await signIn(techPage, TECH, "/activity");
  const event = (p: Page) =>
    p.getByRole("link", { name: new RegExp(`assigned to Priya.*${name}`) });

  try {
    await expect(event(ownerPage)).toBeVisible();
    // Every Job (the demo shop): Tony sees it.
    await expect(event(techPage)).toBeVisible();

    await setTechsSee(ownerPage, "Only Their Own");
    await techPage.goto("/activity");
    await expect(techPage.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
    await expect(event(techPage)).toHaveCount(0);
    // Search follows the same rule: the customer, but not the job.
    const panel = techPage.getByRole("dialog", { name: "Search" });
    await expect(async () => {
      await techPage.keyboard.press("ControlOrMeta+k");
      await expect(panel).toBeVisible({ timeout: 1000 });
    }).toPass();
    await panel.getByRole("combobox").fill(name);
    await expect(panel.getByRole("region", { name: "Customers" })).toBeVisible();
    await expect(panel.getByRole("region", { name: "Jobs" })).toHaveCount(0);

    await ownerPage.goto("/activity");
    await expect(event(ownerPage)).toBeVisible();
  } finally {
    await setTechsSee(ownerPage, "Every Job");
  }
});
