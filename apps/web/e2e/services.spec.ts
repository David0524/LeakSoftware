import { expect, test, type Page } from "@playwright/test";
import { OWNER, signIn } from "./helpers";

// Pool care and leak detection are separate experiences (owner, 2026-10-16): Settings ›
// Company › Services decides what the office shows. The demo shop does both; the setting is
// put back at the end.

async function setServices(page: Page, label: "Pool Care" | "Leak Detection" | "Both") {
  await page.goto("/settings/company");
  const card = page.locator("form").filter({ has: page.getByText("Your shop does") });
  await card.getByRole("radio", { name: label }).click();
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Saved.")).toBeVisible();
}

test("a shop's services decide what the office shows", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, OWNER, "/settings/company");
  const nav = page.getByRole("navigation").first();
  try {
    await setServices(page, "Pool Care");
    await page.goto("/jobs/new");
    await expect(nav.getByRole("link", { name: "Chemicals" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Warranties" })).toHaveCount(0);
    // Every new job is a pool service visit: no leak detection choice or detection fee.
    await expect(page.getByRole("radio", { name: "Leak Detection" })).toHaveCount(0);
    await expect(page.getByLabel("Detection fee ($)")).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: /Test Types/ })).toHaveCount(0);

    await setServices(page, "Leak Detection");
    await page.goto("/invoices");
    await expect(nav.getByRole("link", { name: "Warranties" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Chemicals" })).toHaveCount(0);
    await expect(page.getByText("Maintenance to Bill")).toHaveCount(0);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: /Test Types/ }).first()).toBeVisible();
  } finally {
    await setServices(page, "Both");
  }
  await page.goto("/jobs/new");
  await expect(page.getByRole("radio", { name: "Pool Service" })).toBeVisible();
});

test("the chemical calculator says what to add", async ({ page }) => {
  await signIn(page, OWNER, "/chemicals");
  await page.getByLabel("Gallons").fill("20000");
  await page.getByLabel("Free Chlorine").fill("1");
  await page.getByLabel("pH").fill("8.0");
  await page.getByLabel("Alkalinity").fill("100");
  await page.getByLabel("Stabilizer").fill("40");
  const doses = page.getByTestId("doses");
  // pH first (alkalinity is fine), then chlorine; amounts from packages/core chemistry.
  await expect(doses.getByRole("listitem")).toHaveCount(2);
  await expect(doses.getByRole("listitem").nth(0)).toContainText("80 fl oz");
  await expect(doses.getByRole("listitem").nth(0)).toContainText("Muriatic acid 31.45%");
  await expect(doses.getByRole("listitem").nth(1)).toContainText("64 fl oz");
  await expect(doses.getByRole("listitem").nth(1)).toContainText("Liquid chlorine 12.5%");
});
