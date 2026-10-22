import { expect, test } from "@playwright/test";
import { adminClient } from "./backend";
import { RUN } from "./helpers";

// New-shop onboarding for Pool Maintenance (owner, 2026-10-16): its own questions and
// a sample visit whose What to Add follows the readings. The
// leak detection flow runs in new-shop.spec.ts. Phones: an iPhone-sized window.

test.use({ viewport: { width: 390, height: 844 } });

test("a new pool company sets up its shop and tries a visit", async ({ page }) => {
  test.skip(
    !adminClient(),
    "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).",
  );
  await page.goto("/sign-up?package=pool");
  await page.getByLabel("Your name").fill("Robin Route");
  await page.getByLabel("Company name").fill(`Blue Lagoon Pools ${RUN}`);
  await page.getByLabel("Email").fill(`pool-owner-${RUN}@newshop.test`);
  await page.getByLabel("Mobile phone").fill("480-555-0142");
  await page.getByLabel("Password").fill("sundeck-pool-shop");
  await page.getByRole("button", { name: "Start Free Trial" }).click();

  await page.waitForURL((url) => url.pathname === "/welcome");
  await expect(
    page.getByRole("heading", { name: "Every pool on your route, handled." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get Started" }).click();
  // The phone's Back goes to the step before, not out to the sign-up form (owner, 2026-10-22).
  await expect(
    page.getByRole("heading", { name: "What should Sundeck Pro fix first?" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Every pool on your route, handled." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Get Started" }).click();
  // The questions can be skipped; the usual three answers show.
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("heading", { name: /^Set up Blue Lagoon Pools/ })).toBeVisible();
  await page.getByRole("button", { name: "Save and Continue" }).click();

  await expect(page.getByRole("heading", { name: "Try a visit" })).toBeVisible();
  const steps = page.getByTestId("demo-steps");
  // No chlorine question anymore (owner, 2026-10-19): the sample doses liquid chlorine.
  await expect(steps).toContainText("Liquid chlorine 12.5%");
  // Raise the chlorine to the target: chlorine drops off the list.
  for (let i = 0; i < 6; i++)
    await page.getByRole("button", { name: "Raise Free chlorine" }).click();
  await expect(steps).not.toContainText("Liquid chlorine");
  await page.getByRole("button", { name: "Finish Visit" }).click();
  await expect(page.getByTestId("onboarding-sample")).toContainText("Pool service");
  await page.getByRole("button", { name: "Keep Going" }).click();
  await expect(page.getByTestId("onboarding-price")).toContainText("$79");
  await expect(page.getByText("Unlimited pools", { exact: false })).toBeVisible();
  // The payment page (owner, 2026-10-16). CI has no Stripe keys, so cards can't be taken and
  // the demo code is the way in; a wrong code is refused.
  await expect(page.getByRole("button", { name: "Start 30-Day Free Trial" })).toBeDisabled();
  await page.getByLabel("Demo code").fill("VIP25");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("That code isn’t valid.")).toBeVisible();
  await page.getByLabel("Demo code").fill("vip26");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL((url) => url.pathname === "/welcome/done");
  await expect(page.getByTestId("next-steps")).toContainText("Add your customers");
});
