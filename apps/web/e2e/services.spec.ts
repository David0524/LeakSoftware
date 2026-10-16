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
  // Thousands commas as it's typed.
  await expect(page.getByLabel("Gallons")).toHaveValue("20,000");
  await page.getByLabel("Free Chlorine").fill("1");
  await page.getByLabel("pH").fill("8.0");
  await page.getByLabel("Alkalinity").fill("100");
  await page.getByLabel("Stabilizer").fill("40");
  const doses = page.getByTestId("doses");
  // pH first (alkalinity is fine), then chlorine; amounts from packages/core chemistry, in
  // gallons first and fluid ounces under them.
  await expect(doses.getByRole("listitem")).toHaveCount(2);
  await expect(doses.getByRole("listitem").nth(0)).toContainText("½ gallon");
  await expect(doses.getByRole("listitem").nth(0)).toContainText("About 65 fl oz");
  await expect(doses.getByRole("listitem").nth(0)).toContainText("Muriatic acid 31.45%");
  await expect(doses.getByRole("listitem").nth(1)).toContainText("About 64 fl oz");
  await expect(doses.getByRole("listitem").nth(1)).toContainText("Liquid chlorine 12.5%");
});

test("on a phone, what to add is a bar at the bottom that opens a sheet", async ({ browser }) => {
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await phone.newPage();
  await signIn(page, OWNER, "/chemicals");
  const bar = page.getByRole("button", { name: /What to Add/ });
  await expect(bar).toContainText("Add the gallons and a reading");
  await page.getByLabel("Gallons").fill("20000");
  await page.getByLabel("pH").fill("8.0");
  await page.getByLabel("Alkalinity").fill("100");
  await expect(bar).toContainText("½ gallon muriatic acid");
  await bar.click();
  const sheet = page.getByRole("dialog", { name: "What to Add" });
  await expect(sheet.getByTestId("doses").getByRole("listitem")).toHaveCount(1);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await phone.close();
});

test("a pool visit item added in settings lands on pool visits", async ({ page }) => {
  // It used to land on the leak checklist (owner, 2026-10-16: "be more thorough").
  await signIn(page, OWNER, "/settings/components");
  await page.goto("/settings/components?list=pool");
  const name = `E2E salt cell check ${Date.now().toString(36)}`;
  await page.getByRole("button", { name: "Add Component", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add Component" });
  await add.getByLabel("Name").fill(name);
  await add.getByRole("button", { name: "Add Component" }).click();
  await expect(add).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
  await page.getByRole("link", { name: "Leak Inspections" }).click();
  await expect(page.getByRole("button", { name: new RegExp(name) })).toHaveCount(0);

  // Clean up: remove it from new visits.
  await page.getByRole("link", { name: "Pool Visits" }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page
    .getByRole("dialog", { name })
    .getByRole("button", { name: "Remove Component" })
    .click();
  await page
    .getByRole("alertdialog", { name: "Remove this component from new visits?" })
    .getByRole("button", { name: "Remove Component" })
    .click();
  await expect(page.getByRole("button", { name: new RegExp(name) })).toHaveCount(0);
});
