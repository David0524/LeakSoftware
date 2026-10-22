import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";

// The Type menu on Jobs and Activity (owner, 2026-10-22: "Add a filter on the jobs and activity
// pages for job type"): it narrows the status filter and the search, is kept in the address, and
// on Activity keeps the events about jobs of that type.

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

/** An unscheduled job of a type, given to Tony (so Activity records "assigned to Tony"). */
async function makeJob(db: SupabaseClient, name: string, type: string, assignee: string) {
  const { data: id, error } = await db.rpc("create_job", {
    target_company: await companyOf(db),
    new_customer: { name },
    existing_customer: null,
    new_property: { address_line1: "1 E Washington St", city: "Phoenix", state: "AZ" },
    existing_property: null,
    job: { status: "unscheduled", type, assigned_user_id: assignee },
    components: [],
  });
  if (error) throw error;
  return id as string;
}

test.describe("job type filter", () => {
  const repair = `TypeFilter ${RUN} Repair`;
  const leak = `TypeFilter ${RUN} Leak`;
  const ids: string[] = [];
  let owner: SupabaseClient;

  test.beforeAll(async () => {
    owner = await signedInClient(OWNER.email, OWNER.password);
    const tech = await signedInClient(TECH.email, TECH.password);
    const { data: tony } = await tech.auth.getUser();
    ids.push(await makeJob(owner, repair, "repair", tony.user!.id));
    ids.push(await makeJob(owner, leak, "detection", tony.user!.id));
  });

  test.afterAll(async () => {
    // The demo shop keeps no test jobs.
    const at = new Date().toISOString();
    if (ids.length) await owner.from("job").update({ deleted_at: at }).in("id", ids);
    const { data: people } = await owner.from("customer").select("id").in("name", [repair, leak]);
    const who = (people ?? []).map((c) => c.id as string);
    await owner.from("property").update({ deleted_at: at }).in("customer_id", who);
    await owner.from("customer").update({ deleted_at: at }).in("id", who);
  });

  test("Jobs: Type narrows the status filter and the search, and stays in the address", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, OWNER, `/jobs?q=${encodeURIComponent(`TypeFilter ${RUN}`)}`);
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(2);
    const type = page.getByRole("combobox", { name: "Type" });
    await expect(type).toHaveValue("all");
    // All Types, then the demo shop's job types, in New Job's order.
    await expect(type.locator("option")).toHaveText([
      "All Types",
      "Maintenance",
      "Repair",
      "Leak Detection",
      "Pool Inspection",
    ]);
    await type.selectOption("repair");
    await expect(page).toHaveURL(/[?&]type=repair/);
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(repair);
    await expect(rows.first()).toContainText("Repair");
    // The status pills, Sort and the search keep it.
    await expect(page.getByRole("link", { name: "All", exact: true })).toHaveAttribute(
      "href",
      /type=repair/,
    );
    await expect(page.locator('form[role="search"] input[name="type"]')).toHaveValue("repair");
    await page.getByRole("combobox", { name: "Sort" }).selectOption("customer");
    await expect(page).toHaveURL(/[?&]type=repair/);
    await expect(rows).toHaveCount(1);
    // A status with none of them says so.
    await page.getByRole("link", { name: "Paid", exact: true }).click();
    await expect(page).toHaveURL(/[?&]status=paid/);
    await expect(page.getByText(`No jobs match “TypeFilter ${RUN}”.`)).toBeVisible();
    // Leak Detection shows the other one; All Types both, and leaves the address.
    await page.getByRole("link", { name: "Open", exact: true }).click();
    await type.selectOption("detection");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(leak);
    await type.selectOption("all");
    await expect(rows).toHaveCount(2);
    await expect(page).not.toHaveURL(/type=/);
  });

  test("Jobs on a phone: Type sits beside Sort, in one row", async ({ browser }) => {
    const page = await (
      await browser.newContext({ viewport: { width: 390, height: 844 } })
    ).newPage();
    await signIn(page, OWNER, "/jobs?type=repair");
    const type = page.getByRole("combobox", { name: "Type" });
    const sort = page.getByRole("combobox", { name: "Sort" });
    await expect(type).toHaveValue("repair");
    const a = (await type.boundingBox())!;
    const b = (await sort.boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(4);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    // Every job listed is a repair.
    const rows = page.getByRole("main").getByRole("listitem");
    await expect(rows.first()).toBeVisible();
    for (const text of await rows.allInnerTexts()) {
      expect(text).toMatch(/· Repair/);
      expect(text).not.toMatch(/· (Leak detection|Maintenance|Pool inspection)/);
    }
  });

  test("Activity: Type keeps the events about jobs of that type", async ({ page }) => {
    await signIn(page, OWNER, "/activity");
    const event = (name: string) =>
      page.getByRole("link", { name: new RegExp(`assigned to Tony.*${name}`) });
    await expect(event(repair)).toBeVisible();
    await expect(event(leak)).toBeVisible();
    const type = page.getByRole("combobox", { name: "Type" });
    await type.selectOption("repair");
    await expect(page).toHaveURL(/\/activity\?type=repair$/);
    await expect(event(repair)).toBeVisible();
    await expect(event(leak)).toHaveCount(0);
    // A text is about a conversation, not a job: none under a type.
    await expect(page.getByRole("link", { name: /^Text from/ })).toHaveCount(0);
    await type.selectOption("detection");
    await expect(event(leak)).toBeVisible();
    await expect(event(repair)).toHaveCount(0);
    await type.selectOption("all");
    await expect(page).toHaveURL(/\/activity$/);
    await expect(event(repair)).toBeVisible();
    await expect(event(leak)).toBeVisible();
  });
});
