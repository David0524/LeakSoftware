import { expect, test } from "@playwright/test";

// The public home page: Pool Maintenance first, Leak Detection one switch away, each with only
// its own content, and the price by team size (owner, 2026-10-15).

test("the home page shows one package at a time and prices a team", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toContainText("Clean the pool");
  await expect(page.getByRole("heading", { name: "A checklist on every visit." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reports that sell the repair." })).toHaveCount(0);

  // Flat tiers by team size (owner, 2026-10-16): Pool Maintenance Starter $79 (2), Team $149 (6);
  // Leak Detection Solo $49 (1), Team $99 (4). Each starts at its lowest price (owner,
  // 2026-10-18): 2 people for Pool Maintenance, 1 for Leak Detection.
  await expect(page.getByTestId("team-size")).toHaveText("2");
  await expect(page.getByTestId("plan-maintenance")).toBeVisible();
  await expect(page.getByTestId("plan-leak")).toHaveCount(0);
  await expect(page.getByTestId("price")).toHaveText("$79");
  await expect(page.getByTestId("plan-maintenance")).toContainText("Starter");

  // The comparison: 2 people and 150 pools cost $300 at Skimmer, $115 at Pool Brain, $150 at
  // Pool Office Manager; Sundeck Pro is $79, saving $432 a year.
  const compare = page.getByTestId("compare");
  await expect(compare).toContainText("$300");
  await expect(compare.getByTestId("savings")).toHaveText(/\$432 a year/);
  await page.getByRole("button", { name: "More people" }).click();
  await page.getByRole("button", { name: "More people" }).click();
  await expect(page.getByTestId("price")).toHaveText("$149");

  await page
    .getByRole("radiogroup", { name: "Show Sundeck Pro for" })
    .getByRole("radio", { name: "Leak Detection" })
    .click();
  await expect(h1).toContainText("Find the leak");
  await expect(page.getByRole("heading", { name: "Reports that sell the repair." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A checklist on every visit." })).toHaveCount(0);
  await expect(page.getByTestId("team-size")).toHaveText("1");
  await expect(page.getByTestId("price")).toHaveText("$49");
  await expect(page.getByTestId("compare")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fewer people" })).toBeDisabled();
  await page.getByRole("button", { name: "More people" }).click();
  await expect(page.getByTestId("price")).toHaveText("$99");

  // The switch in the pricing section moves the whole page back, with its own count.
  await page
    .getByRole("radiogroup", { name: "Show pricing for" })
    .getByRole("radio", { name: "Pool Maintenance" })
    .click();
  await expect(page.getByTestId("team-size")).toHaveText("4");
  await expect(page.getByTestId("price")).toHaveText("$149");

  await expect(h1).toContainText("Clean the pool");
});
