import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";
import { PHONE } from "./money";

// One search across the shop (owner, 2026-10-20; docs/plans/search-and-activity.md section
// 1): on phones the field under the Jobs title, on computers the header field and ⌘K.

async function makeJob(db: SupabaseClient, name: string) {
  const { data: who } = await db.auth.getUser();
  const { data: membership } = await db
    .from("membership")
    .select("company_id")
    .eq("user_id", who.user!.id)
    .limit(1)
    .single();
  const { data: id, error } = await db.rpc("create_job", {
    target_company: membership!.company_id,
    new_customer: { name, phone: "(602) 555-0177" },
    existing_customer: null,
    new_property: { address_line1: `${RUN} Saguaro Way`, city: "Mesa", state: "AZ" },
    existing_property: null,
    job: { status: "unscheduled" },
    components: [],
  });
  if (error) throw error;
  const { data: job } = await db.from("job").select("number").eq("id", id).single();
  return { id: id as string, number: job!.number as number };
}

test("phones search the shop from the top of Jobs, with Recent", async ({ browser }) => {
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const name = `Searchable Ochoa ${RUN}`;
  const job = await makeJob(owner, name);
  const page = await (await browser.newContext(PHONE)).newPage();
  await signIn(page, OWNER, "/jobs");

  const field = page.getByPlaceholder("Search customers, jobs, addresses");
  await field.click();
  // Empty and focused: Recent (nothing yet on this new browser).
  await expect(
    page.getByText("Customers, jobs, quotes, and invoices you open show here."),
  ).toBeVisible();
  // Words in any order, each the start of a word.
  await field.fill(`${RUN} ochoa`);
  const customers = page.getByRole("region", { name: "Customers" });
  await expect(customers.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  const jobs = page.getByRole("region", { name: "Jobs" });
  await expect(jobs.getByRole("link", { name: new RegExp(`Job #${job.number} `) })).toBeVisible();
  // The job list is out of the way while searching.
  await expect(page.getByRole("navigation", { name: "Filter jobs by status" })).toBeHidden();

  await customers.getByRole("link", { name: new RegExp(name) }).click();
  await page.waitForURL(/\/customers\//);
  await page.goto("/jobs");
  await field.click();
  const recent = page.getByRole("region", { name: "Recent" });
  await expect(recent.getByRole("link", { name: new RegExp(name) })).toBeVisible();

  // Nothing found.
  await field.fill(`zzqx${RUN}`);
  await expect(page.getByText(`No results for “zzqx${RUN}”.`)).toBeVisible();
  await expect(
    page.getByText("Check the spelling, or try a phone number or address."),
  ).toBeVisible();

  // Cancel puts the list back; Clear empties Recent.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("navigation", { name: "Filter jobs by status" })).toBeVisible();
  await field.click();
  await recent.getByRole("button", { name: "Clear" }).click();
  await expect(recent.getByRole("link")).toHaveCount(0);
});

test("on a computer, ⌘K or Ctrl+K searches from any office page", async ({ page }) => {
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const job = await makeJob(owner, `Keyboard Search ${RUN}`);
  await signIn(page, OWNER, "/today");

  const panel = page.getByRole("dialog", { name: "Search" });
  // Once the header is ready (the shortcut listens from then on).
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await panel.getByRole("combobox").fill(`Job ${job.number}`);
  await expect(
    panel.getByRole("link", { name: new RegExp(`Job #${job.number} `) }).first(),
  ).toBeVisible();
  // Only jobs, the exact number first; Return opens it.
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/jobs/${job.id}`);
  await expect(panel).toBeHidden();

  // The header field opens it too; Escape closes it.
  await page.getByRole("button", { name: /^Search \((⌘K|Ctrl\+K)\)$/ }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole("combobox").fill("Keyboard Search");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});
