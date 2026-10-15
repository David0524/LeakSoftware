import { expect, test } from "@playwright/test";

// The public home page: Pool Maintenance first, Leak Detection one switch away, each with only
// its own content, and the price by team size (owner, 2026-10-15).

test("the home page shows one package at a time and prices a team", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toContainText("Clean the pool");
  await expect(page.getByRole("heading", { name: "A checklist on every visit." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reports that sell the repair." })).toHaveCount(0);

  // Two people are included; each after that adds $20 (Maintenance) or $25 (Leak Detection).
  await expect(page.getByTestId("team-size")).toHaveText("4");
  await expect(page.getByTestId("plan-maintenance")).toBeVisible();
  await expect(page.getByTestId("plan-leak")).toHaveCount(0);
  await expect(page.getByTestId("price")).toHaveText("$109");

  await page
    .getByRole("radiogroup", { name: "Show Tidemark for" })
    .getByRole("radio", { name: "Leak Detection" })
    .click();
  await expect(h1).toContainText("Find the leak");
  await expect(page.getByRole("heading", { name: "Reports that sell the repair." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A checklist on every visit." })).toHaveCount(0);
  await expect(page.getByTestId("price")).toHaveText("$150");

  await page.getByRole("button", { name: "Fewer people" }).click();
  await page.getByRole("button", { name: "Fewer people" }).click();
  await expect(page.getByTestId("price")).toHaveText("$100");
  await page.getByRole("button", { name: "Fewer people" }).click();
  await expect(page.getByTestId("team-size")).toHaveText("1");
  await expect(page.getByRole("button", { name: "Fewer people" })).toBeDisabled();
  await expect(page.getByTestId("price")).toHaveText("$100");

  // The switch in the pricing section moves the whole page back.
  await page
    .getByRole("radiogroup", { name: "Show pricing for" })
    .getByRole("radio", { name: "Pool Maintenance" })
    .click();
  await expect(page.getByTestId("price")).toHaveText("$69");
  await expect(h1).toContainText("Clean the pool");
});
