import { expect, test, type Page } from "@playwright/test";
import { OWNER, RUN, jobSection, signIn } from "./helpers";

// Edge cases found by break testing (2026-10-20).

async function newJob(page: Page, name: string): Promise<string> {
  await page.goto("/jobs/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Street address").fill("1 Edge St");
  await page.getByLabel("City").fill("Mesa");
  await page.getByText("Not Yet", { exact: true }).click();
  await page.getByRole("button", { name: "Create Job" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
  return page.url();
}

test.describe("office edge cases", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, OWNER, "/jobs");
  });

  test("a bad date in the schedule link shows the schedule, not an error page", async ({
    page,
  }) => {
    await page.goto("/schedule?date=9999-99-99");
    await expect(page.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });

  for (const path of ["/customers/not-a-uuid", "/jobs/not-a-uuid", "/messages/not-a-uuid"]) {
    test(`${path} is not found, not an error page`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
    });
  }

  test("customer links with a malformed token answer 404", async ({ request }) => {
    for (const path of ["/q/abc", "/i/abc", "/r/abc", "/stop/abc", "/i/abc/pdf"])
      expect((await request.get(path)).status(), path).toBe(404);
  });

  test("New Job refuses a date outside 2000 to 2100", async ({ page }) => {
    await page.goto("/jobs/new");
    await page.getByLabel("Name").fill(`EDGE year ${RUN}`);
    await page.getByLabel("Street address").fill("1 Edge St");
    await page.getByLabel("Date").fill("9999-12-31");
    await page.getByLabel("Start").fill("09:00");
    await page.getByRole("button", { name: "Create Job" }).click();
    await expect(page.getByText("Pick a date between 2000 and 2100.")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/jobs/new");
  });

  test("the review link takes web addresses only", async ({ page }) => {
    await page.goto("/settings/company");
    await page.getByLabel("Review link").fill("javascript:alert(document.cookie)");
    await page
      .locator("form")
      .filter({ has: page.getByLabel("Review link") })
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.getByText("Enter a web address that starts with https://.")).toBeVisible();
  });

  test("a quote discount larger than the subtotal is refused", async ({ page }) => {
    await newJob(page, `EDGE discount ${RUN}`);
    // Quotes are on Wrap-Up's tab (owner, 2026-10-22: tabs on every screen).
    await jobSection(page, "Wrap-Up");
    await page.getByRole("button", { name: "New Quote" }).click();
    const custom = page.locator('input[name^="custom-"]:not([name^="custom-price"])').last();
    await expect(custom).toBeVisible();
    const quote = (await custom.getAttribute("name"))!.replace("custom-", "");
    await custom.fill("EDGE line");
    await page.locator(`input[name="custom-price-${quote}"]`).fill("100");
    await page.getByRole("button", { name: "Add Line" }).click();
    await expect(page.locator('input[value="EDGE line"]')).toBeVisible();
    const discount = page.locator(`input[name="discount-${quote}"]`);
    await discount.fill("5000");
    await discount.press("Tab");
    // Today: saved silently as -$100.00, so the quote total becomes $0.00 and the deposit $0.00.
    await expect(page.getByText("The discount can’t be more than the subtotal.")).toBeVisible();
  });
});
