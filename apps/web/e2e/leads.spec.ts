import { expect, test } from "@playwright/test";
import { adminClient } from "./backend";
import { RUN } from "./helpers";

// Leads (owner, 2026-10-16): what someone types on the sign-up form is kept once the email
// is valid, even if they leave without signing up, so Sundeck Pro can call them.

test("a sign-up form left half done is on the leads list", async ({ page }) => {
  const admin = adminClient();
  test.skip(!admin, "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).");
  const email = `walkaway-${RUN}@newshop.test`;
  await page.goto("/sign-up?package=leak");
  await expect(page.getByText("We may call or text to help you get set up.")).toBeVisible();
  await page.getByLabel("Your name").fill("Wally Walkaway");
  await page.getByLabel("Company name").fill(`Halfway Leak Co ${RUN}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile phone").fill("(480) 555-0177");
  await page.getByLabel("Password", { exact: true }).focus();

  // They leave here. The lead is kept, with the number to call.
  await expect
    .poll(async () => {
      const { data } = await admin!.rpc("lead_list");
      return (data as { email: string; phone: string | null; services: string | null }[]).find(
        (l) => l.email === email,
      );
    })
    .toMatchObject({ phone: "+14805550177", services: "leak" });
});
