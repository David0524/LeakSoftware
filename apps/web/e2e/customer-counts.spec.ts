import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";

// Customer counts (owner, 2026-10-22): every choice of the Customers list's Show menu has its
// count ("On a Plan (65)"), for the whole shop or what a search finds, and the Dashboard tracks
// Customers and On a plan with the same numbers, each opening Customers on that choice.

const SCREENS = process.env.E2E_SCREENSHOTS;

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

/** "On a Plan (1,204)" → 1204. */
function countIn(label: string): number {
  const m = /\(([\d,]+)\)$/.exec(label);
  expect(m, `${label} ends with its count`).not.toBeNull();
  return Number(m![1]!.replace(/,/g, ""));
}

async function showLabels(page: Page) {
  const options = page.getByRole("combobox", { name: "Show" }).locator("option");
  await expect(options.first()).toHaveText(/^All Customers \(/);
  return options.allTextContents();
}

test.describe("customer counts", () => {
  const name = `Counts ${RUN} Builder`;
  let owner: SupabaseClient;
  let customerId: string;

  test.beforeAll(async () => {
    owner = await signedInClient(OWNER.email, OWNER.password);
    const { data: id, error } = await owner.rpc("create_job", {
      target_company: await companyOf(owner),
      new_customer: { name },
      existing_customer: null,
      new_property: { address_line1: "1 E Washington St", city: "Phoenix", state: "AZ" },
      existing_property: null,
      job: { status: "unscheduled", type: "detection" },
      components: [],
    });
    if (error) throw error;
    const { data: job } = await owner
      .from("job")
      .select("bill_to_customer_id")
      .eq("id", id as string)
      .single();
    customerId = job!.bill_to_customer_id as string;
    await owner.from("customer").update({ kind: "builder" }).eq("id", customerId);
    await owner
      .from("job")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id as string);
  });

  test.afterAll(async () => {
    const at = new Date().toISOString();
    await owner.from("property").update({ deleted_at: at }).eq("customer_id", customerId);
    await owner.from("customer").update({ deleted_at: at }).eq("id", customerId);
  });

  test("the Show menu counts each choice, of the shop or a search", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, OWNER, "/customers");
    const { count: total } = await owner
      .from("customer")
      .select("id", { count: "exact", head: true })
      .eq("company_id", await companyOf(owner))
      .is("deleted_at", null);
    const labels = await showLabels(page);
    expect(labels[0]).toBe(`All Customers (${total!.toLocaleString("en-US")})`);
    const counts = Object.fromEntries(
      labels.map((l) => [l.replace(/ \([\d,]+\)$/, ""), countIn(l)] as const),
    );
    // No Plan is everyone else; the kinds add up to everyone.
    if ("On a Plan" in counts) {
      expect(counts["On a Plan"]! + counts["No Plan"]!).toBe(total);
    }
    const kinds = [
      "Homeowners",
      "Pool Companies",
      "Builders",
      "Insurers",
      "Property Managers",
      "Other",
    ];
    expect(kinds.reduce((s, k) => s + (counts[k] ?? 0), 0)).toBe(total);
    if (SCREENS) await page.screenshot({ path: `${SCREENS}/customers-desktop.png` });

    // Picking a choice lists as many as it says (lists show up to 300).
    if ("On a Plan" in counts && counts["On a Plan"]! <= 300) {
      await page.getByRole("combobox", { name: "Show" }).selectOption("plan");
      await expect(page).toHaveURL(/[?&]show=plan/);
      await expect(page.getByRole("combobox", { name: "Show" })).toHaveValue("plan");
    }

    // A search counts what it finds.
    await page.goto(`/customers?q=${encodeURIComponent(name)}`);
    const found = await showLabels(page);
    expect(found[0]).toBe("All Customers (1)");
    expect(found).toContain("Builders (1)");
    expect(found).toContain("Homeowners (0)");
  });

  test("the Dashboard tracks Customers and On a plan, and opens Customers on them", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, OWNER, "/customers");
    const labels = await showLabels(page);
    const all = countIn(labels[0]!);
    const plan = labels.find((l) => l.startsWith("On a Plan"));

    await page.goto("/dashboard");
    const customers = page.getByRole("link", { name: /^Customers: / });
    await expect(customers).toHaveAccessibleName(`Customers: ${all.toLocaleString("en-US")}`);
    await expect(page.getByText(/^(\+[\d,]+|None new) in 30 days$/)).toBeVisible();
    if (SCREENS) await page.screenshot({ path: `${SCREENS}/dashboard-desktop.png` });
    if (plan) {
      const onPlan = page.getByRole("link", { name: /^On a plan: / });
      await expect(onPlan).toHaveAccessibleName(
        `On a plan: ${countIn(plan).toLocaleString("en-US")}`,
      );
      await expect(page.getByText(/% of customers$/)).toBeVisible();
      await onPlan.click();
      await page.waitForURL(/\/customers\?show=plan$/);
      await expect(page.getByRole("combobox", { name: "Show" })).toHaveValue("plan");
    }
    await page.goto("/dashboard");
    await customers.click();
    await page.waitForURL(/\/customers$/);

    // Phones: the trackers are the first row of cards; the menu shows its count.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await expect(customers).toBeVisible();
    if (SCREENS) await page.screenshot({ path: `${SCREENS}/dashboard-phone.png` });
    await page.goto("/customers");
    await expect(page.getByRole("combobox", { name: "Show" })).toBeVisible();
    if (SCREENS) await page.screenshot({ path: `${SCREENS}/customers-phone.png` });
  });
});
