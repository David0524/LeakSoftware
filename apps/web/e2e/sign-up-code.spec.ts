import { BOT_MIN_FILL_MS } from "@leakbook/core";
import { expect, test, type Page } from "@playwright/test";
import { adminClient } from "./backend";
import { RUN } from "./helpers";

// A sign-up link that carries a code (owner, 2026-11-23: the meetup's handout card,
// /sign-up?code=CANNONBALL90). The sign-up form shows the offer, the code goes with the account,
// and the trial page applies it to the new shop. Codes are made here, never in seed.sql.

test.use({ viewport: { width: 390, height: 844 } });

/** A promo code for this run, 3 months free, made the way Admin › Codes makes one. */
async function makeCode(name: string): Promise<string> {
  const { data, error } = await adminClient()!.rpc("admin_add_promo_code", {
    new_code: name,
    free_months: 3,
    percent_off: null,
    percent_months: null,
    ends_at: null,
    max_uses: null,
    note: "e2e: sign-up link",
    staff_email: "e2e@sundeck.test",
  });
  if (error) throw error;
  return String(data);
}

async function turnOff(code: string) {
  const { error } = await adminClient()!.rpc("admin_set_promo_code_active", {
    target_code: code,
    on_now: false,
  });
  if (error) throw error;
}

async function fillSignUp(page: Page, label: string) {
  await page.getByLabel("Your name").fill("Casey Cannon");
  await page.getByLabel("Company name").fill(`Cannonball Pools ${label} ${RUN}`);
  await page.getByLabel("Email").fill(`code-${label}-${RUN}@newshop.test`);
  await page.getByLabel("Mobile phone").fill("480-555-0190");
  await page.getByLabel("Password", { exact: true }).fill("Sundeck-pool-shop-1");
  // A person takes a few seconds; a form sent sooner is a bot's (core BOT_MIN_FILL_MS).
  await page.waitForTimeout(BOT_MIN_FILL_MS);
}

async function shopCode(label: string) {
  const db = adminClient()!;
  const { data: shop } = await db
    .from("company")
    .select("id")
    .eq("name", `Cannonball Pools ${label} ${RUN}`)
    .single();
  const { data: sub } = await db
    .from("subscription")
    .select("promo_code, promo_kind, heard_from")
    .eq("company_id", shop!.id)
    .single();
  return sub;
}

test.describe("a sign-up link with a code", () => {
  test.skip(
    !adminClient(),
    "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).",
  );

  test("shows the offer and applies it to the new shop", async ({ page }) => {
    const code = await makeCode(`SPLASH${RUN}`);
    // Any case, alongside the mailer's ?from=card.
    await page.goto(`/sign-up?code=${code.toLowerCase()}&from=card`);
    await expect(page.getByTestId("sign-up-code")).toContainText(`Code ${code}: 3 months free.`);
    await expect(page.getByText("3 months free. You’ll set up your shop next")).toBeVisible();
    await expect(page.getByLabel("How did you hear about us?")).toHaveValue("card");
    await fillSignUp(page, "ok");
    await page.getByRole("button", { name: "Start Free Trial" }).click();

    await page.waitForURL((url) => url.pathname === "/welcome");
    await expect(page.getByTestId("applied-code")).toContainText(`Code ${code}: 3 months free.`);
    // CI has no Stripe keys: the button can't start, but it names the longer trial.
    await expect(page.getByRole("button", { name: "Start 3-Month Free Trial" })).toBeVisible();
    // One code per shop: the field is gone.
    await expect(page.getByLabel("Code", { exact: true })).toHaveCount(0);
    expect(await shopCode("ok")).toEqual({
      promo_code: code,
      promo_kind: "promo",
      heard_from: "card",
    });

    // Applied once: coming back changes nothing.
    await page.reload();
    await expect(page.getByTestId("applied-code")).toBeVisible();
  });

  test("a code turned off since shows in the field, and sign-up goes on", async ({ page }) => {
    const code = await makeCode(`GONE${RUN}`);
    await page.goto(`/sign-up?code=${code}`);
    await expect(page.getByTestId("sign-up-code")).toBeVisible();
    await fillSignUp(page, "off");
    await turnOff(code);
    await page.getByRole("button", { name: "Start Free Trial" }).click();

    await page.waitForURL((url) => url.pathname === "/welcome");
    await expect(page.getByTestId("applied-code")).toHaveCount(0);
    await expect(page.getByLabel("Code", { exact: true })).toHaveValue(code);
    await expect(page.getByText("That code isn’t valid.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start 30-Day Free Trial" })).toBeVisible();
    expect((await shopCode("off"))?.promo_code).toBeNull();
  });

  test("an unknown code shows nothing", async ({ page }) => {
    await page.goto("/sign-up?code=NOPE");
    await expect(page.getByLabel("Your name")).toBeVisible();
    await expect(page.getByTestId("sign-up-code")).toHaveCount(0);
    await expect(page.getByText("30 days free. You’ll set up your shop next")).toBeVisible();
  });
});
