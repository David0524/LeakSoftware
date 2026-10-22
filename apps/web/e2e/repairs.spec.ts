import { expect, test, type Page } from "@playwright/test";
import { formatCents } from "@leakbook/core";
import { signedInClient } from "./backend";
import { OWNER, RUN, signIn } from "./helpers";
import { PHONE } from "./money";

// A repair job holds several repairs (owner, 2026-10-22: "On repair jobs, (in the intake and
// actually working the job) we need a button to 'add additional repair'"; docs/design/
// 2026-10-22-multiple-repairs.md): New Job › Repair books two, the job's Details lists them with
// their total, and Add Additional Repair and Remove work there. The job's price and invoice lines
// are checked in supabase/tests/670_job_repairs.test.sql. The job is removed at the end.

const cents = (text: string) => Math.round(Number(text.replace(/[^0-9.]/g, "")) * 100);

/** New Job for an existing customer and pool, as a repair, not scheduled yet. */
async function startRepair(page: Page) {
  await page.getByRole("radio", { name: "Existing", exact: true }).click();
  await page.getByRole("combobox", { name: "Customer", exact: true }).selectOption({ index: 1 });
  const pool = page.getByRole("combobox", { name: "Pool", exact: true });
  if (await pool.count()) await pool.selectOption({ index: 0 });
  await page.getByRole("radio", { name: "Repair" }).click();
  await page.getByRole("radio", { name: "Not Yet" }).click();
}

test("a repair job: two repairs booked in New Job, one added and one removed on the job", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const db = await signedInClient(OWNER.email, OWNER.password);
  let jobId: string | null = null;
  try {
    await signIn(page, OWNER, "/jobs/new");
    await startRepair(page);
    // A repair's price is its repairs': no Price field beside the visit.
    await expect(page.getByLabel("Price ($)")).toHaveCount(1);

    const repairs = page.getByTestId("new-job-repair");
    const first = repairs.nth(0);
    await first.getByLabel("What do they need?").selectOption({ index: 1 });
    // Picking fills its price.
    const firstPrice = cents(await first.getByLabel("Price ($)").inputValue());
    expect(firstPrice).toBeGreaterThan(0);
    const firstName = (
      await first.getByLabel("What do they need?").locator("option:checked").innerText()
    ).replace(/ \(\$[\d,.]+\)$/, "");

    await page.getByRole("button", { name: "Add Additional Repair" }).click();
    await expect(repairs).toHaveCount(2);
    const second = repairs.nth(1);
    await second.getByLabel("Repair", { exact: true }).selectOption({ label: "Something else" });
    await second.getByLabel("Describe the repair").fill(`Skimmer lid ${RUN}`);
    // A third, removed again.
    await page.getByRole("button", { name: "Add Additional Repair" }).click();
    await expect(repairs).toHaveCount(3);
    await page.getByRole("button", { name: "Remove additional repair 2" }).click();
    await expect(repairs).toHaveCount(2);

    // A repair with a name needs its price.
    await page.getByRole("button", { name: "Create Job" }).click();
    await expect(second.getByText("Enter a price like 185.")).toBeVisible();
    await second.getByLabel("Price ($)").fill("25");
    await expect(page.getByTestId("new-job-repairs-total")).toHaveText(
      `Total ${formatCents(firstPrice + 2500)}`,
    );
    await page.getByRole("button", { name: "Create Job" }).click();
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
    jobId = /\/jobs\/([0-9a-f-]{36})$/.exec(page.url())![1]!;

    // Details: each repair with its price, and the total.
    const rows = page.getByTestId("repair-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(firstName);
    await expect(rows.nth(0)).toContainText(formatCents(firstPrice));
    await expect(rows.nth(1)).toContainText(`Skimmer lid ${RUN}`);
    await expect(page.getByTestId("repairs-total")).toContainText(formatCents(firstPrice + 2500));

    // Add Additional Repair on the job: something else, typed.
    await page.getByRole("button", { name: "Add Additional Repair" }).click();
    const sheet = page.getByRole("dialog", { name: "Add Additional Repair" });
    await sheet.getByLabel("Repair", { exact: true }).selectOption({ label: "Something else" });
    await sheet.getByLabel("Describe the repair").fill(`Heater igniter ${RUN}`);
    await sheet.getByLabel("Price ($)").fill("185");
    await sheet.getByRole("button", { name: "Add Repair" }).click();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toContainText(`Heater igniter ${RUN}`);
    await expect(page.getByTestId("repairs-total")).toContainText(
      formatCents(firstPrice + 2500 + 18500),
    );

    // Remove one from its "⋯" menu (it asks first).
    await rows
      .filter({ hasText: `Skimmer lid ${RUN}` })
      .getByRole("button", { name: /^More:/ })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Remove Repair" }).click();
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("repairs-total")).toContainText(formatCents(firstPrice + 18500));

    // Saved as rows: the removed one soft-deleted, so phones drop it too.
    const saved = async () => {
      const { data } = await db
        .from("job_repair")
        .select("description, deleted_at, sort_order")
        .eq("job_id", jobId!)
        .order("sort_order");
      return (data ?? []) as { description: string; deleted_at: string | null }[];
    };
    await expect
      .poll(async () => (await saved()).filter((r) => !r.deleted_at).map((r) => r.description))
      .toEqual([firstName, `Heater igniter ${RUN}`]);
    expect(
      (await saved()).find((r) => r.description === `Skimmer lid ${RUN}`)?.deleted_at,
    ).toBeTruthy();

    // On a phone, the list and its button fit, and each row is a 44 pt target (on Details:
    // a phone opens a started job on its next step's tab).
    await page.setViewportSize(PHONE.viewport);
    await page.goto(`/jobs/${jobId}?tab=details`);
    await expect(rows).toHaveCount(2);
    for (const box of await rows.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    ))
      expect(box).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    if (jobId)
      await db.from("job").update({ deleted_at: new Date().toISOString() }).eq("id", jobId);
  }
});
