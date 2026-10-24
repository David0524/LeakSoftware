import { expect, test } from "@playwright/test";
import { adminClient } from "./backend";
import { RUN } from "./helpers";

// A new pool company answers "How did you hear about us?" and goes from sign-up straight to
// the trial page (owner, 2026-10-24: the
// questionnaire before it is gone), then into the app. The leak detection shop's whole loop
// runs in new-shop.spec.ts. Phones: an iPhone-sized window.

test.use({ viewport: { width: 390, height: 844 } });

test("a new pool company goes straight from sign-up to its trial", async ({ page }) => {
  test.skip(
    !adminClient(),
    "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).",
  );
  // A laminate card's link picks its answer to "How did you hear about us?" (owner, 2026-10-24).
  await page.goto("/sign-up?package=pool&from=card");
  const heard = page.getByLabel("How did you hear about us?");
  await expect(heard).toHaveValue("card");
  await expect(page.getByPlaceholder("Tell us where")).toHaveCount(0);
  await heard.selectOption({ label: "Other" });
  await page.getByPlaceholder("Tell us where").fill("A truck wrap at the supply house");
  await page.getByLabel("Your name").fill("Robin Route");
  await page.getByLabel("Company name").fill(`Blue Lagoon Pools ${RUN}`);
  await page.getByLabel("Email").fill(`pool-owner-${RUN}@newshop.test`);
  await page.getByLabel("Mobile phone").fill("480-555-0142");
  await page.getByLabel("Password").fill("sundeck-pool-shop");
  await page.getByRole("button", { name: "Start Free Trial" }).click();

  await page.waitForURL((url) => url.pathname === "/welcome");
  await expect(
    page.getByRole("heading", { name: "Your route, sorted with Sundeck Pro." }),
  ).toBeVisible();
  await expect(page.getByTestId("onboarding-price")).toContainText("$79");
  await expect(page.getByText("Unlimited pools", { exact: false })).toBeVisible();
  // The office waits for the card: going elsewhere comes back here.
  await page.goto("/home");
  await page.waitForURL((url) => url.pathname === "/welcome");
  // CI has no Stripe keys, so cards can't be taken and the demo code is the way in; a wrong
  // code is refused.
  await expect(page.getByRole("button", { name: "Start 30-Day Free Trial" })).toBeDisabled();
  await page.getByLabel("Demo code").fill("VIP25");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("That code isn’t valid.")).toBeVisible();
  await page.getByLabel("Demo code").fill("vip26");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL((url) => url.pathname === "/welcome/done");
  await expect(page.getByTestId("next-steps")).toContainText("Add your customers");

  // The answer is kept with the new shop.
  const { data: shop } = await adminClient()!
    .from("company")
    .select("id")
    .eq("name", `Blue Lagoon Pools ${RUN}`)
    .single();
  const { data: sub } = await adminClient()!
    .from("subscription")
    .select("heard_from, heard_from_other")
    .eq("company_id", shop!.id)
    .single();
  expect(sub).toEqual({
    heard_from: "other",
    heard_from_other: "A truck wrap at the supply house",
  });
});
