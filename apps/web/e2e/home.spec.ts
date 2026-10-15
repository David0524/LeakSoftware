import { expect, test } from "@playwright/test";

// The public home page: the package switch and the pricing calculator (owner, 2026-10-15).

test("the home page switches packages and prices a team", async ({ page }) => {
  await page.goto("/");
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toContainText("Find the leak");
  await page
    .getByRole("radiogroup", { name: "Show Tidemark for" })
    .getByRole("radio", { name: "Pool Maintenance" })
    .click();
  await expect(h1).toContainText("Clean the pool");

  // Two people are included; each after that adds $25 (Leak Detection) or $20 (Maintenance).
  await expect(page.getByTestId("team-size")).toHaveText("4");
  await expect(page.getByTestId("price-leak")).toHaveText("$150");
  await expect(page.getByTestId("price-maintenance")).toHaveText("$109");
  await page.getByRole("button", { name: "Fewer people" }).click();
  await page.getByRole("button", { name: "Fewer people" }).click();
  await expect(page.getByTestId("price-leak")).toHaveText("$100");
  await expect(page.getByTestId("price-maintenance")).toHaveText("$69");
  await page.getByRole("button", { name: "Fewer people" }).click();
  await expect(page.getByTestId("team-size")).toHaveText("1");
  await expect(page.getByRole("button", { name: "Fewer people" })).toBeDisabled();
  await expect(page.getByTestId("price-leak")).toHaveText("$100");
});
