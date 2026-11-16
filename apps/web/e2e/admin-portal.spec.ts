import { expect, test } from "@playwright/test";
import { adminClient, signedInClient } from "./backend";
import { E2E_STAFF_EMAIL } from "./staff";
import { nextWindow, totp } from "./totp";

// The Admin portal (owner, 2026-10-22): Sundeck Pro staff only, after two-step sign-in, on a
// computer, at an unlisted address (owner, 2026-11-16: not /admin, and no footer link). Staff open a shop's own office to
// help (View Only here), with a banner, and every step is in the Activity Log.

const STAFF = { email: E2E_STAFF_EMAIL, password: "Sundeck-staff-e2e-1" };

test("the portal is at its own address only: no footer link, /admin is not found", async ({
  page,
}) => {
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "About Sundeck Pro" });
  await expect(footer.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  const old = await page.goto("/admin");
  expect(old?.status()).toBe(404);
  await page.goto("/k4cs4uxrntb27z");
  // Signed out: to sign-in first.
  await page.waitForURL((url) => url.pathname === "/sign-in");
});

test("staff sign in with two-step, see the business, and open a shop View Only", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const admin = adminClient();
  test.skip(!admin, "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).");

  // The staff account, with a fresh authenticator.
  const { data: list } = await admin!.auth.admin.listUsers({ perPage: 1000 });
  let id = list.users.find((u) => u.email === STAFF.email)?.id;
  if (!id) {
    const { data } = await admin!.auth.admin.createUser({
      email: STAFF.email,
      password: STAFF.password,
      email_confirm: true,
      user_metadata: { full_name: "Sam Staff" },
    });
    id = data.user!.id;
  } else {
    // Made before the password rules (2026-10-24): give it the current password.
    await admin!.auth.admin.updateUserById(id, { password: STAFF.password });
  }
  const { data: old } = await admin!.auth.admin.mfa.listFactors({ userId: id });
  for (const f of old?.factors ?? [])
    await admin!.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
  await admin!.rpc("admin_end_support", { staff_user: id });
  const me = await signedInClient(STAFF.email, STAFF.password);
  const { data: enrolled } = await me.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `e2e ${Date.now()}`,
  });
  const secret = enrolled!.totp.secret;
  const { error: verifyError } = await me.auth.mfa.challengeAndVerify({
    factorId: enrolled!.id,
    code: totp(secret),
  });
  expect(verifyError).toBeNull();
  await admin!.rpc("set_two_step", { target_user: id, enabled: true });

  // Admin Sign In: password, then the code.
  await nextWindow();
  await page.goto("/sign-in?next=/k4cs4uxrntb27z");
  await page.getByLabel("Email").fill(STAFF.email);
  await page.getByLabel("Password", { exact: true }).fill(STAFF.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in/verify");
  await page.getByLabel("Code").fill(totp(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/k4cs4uxrntb27z");

  // Overview.
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page.getByText("Monthly Revenue (MRR)")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();

  // Shops: find the demo shop and open its page.
  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Shops" })
    .click();
  await page.getByRole("searchbox", { name: /Search shops/ }).fill("Demo Leak");
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.searchParams.get("q") === "Demo Leak");
  await page.getByTestId("shop-row").getByRole("link", { name: "Demo Leak Co." }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Demo Leak Co." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();

  // Finances and People load.
  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Finances" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Finances" })).toBeVisible();
  // Company: the services we pay for, and an expense with who paid (owner, 2026-11-16).
  await expect(page.getByTestId("service-row").filter({ hasText: "Supabase" })).toBeVisible();
  await page.getByRole("button", { name: "Add Expense" }).first().click();
  const expense = page.getByRole("dialog", { name: "Add Expense" });
  await expense.getByLabel("What").fill("e2e business cards");
  await expense.getByLabel("Amount").fill("45.50");
  await expense.getByRole("radio", { name: "Cole" }).click();
  await expense.getByRole("button", { name: "Add Expense" }).click();
  await expect(expense).toBeHidden();
  const row = page.getByTestId("expense-row").filter({ hasText: "e2e business cards" });
  await expect(row).toContainText("Cole");
  await expect(row).toContainText("$45.50");
  await page.getByRole("link", { name: "Subscriptions" }).click();
  await expect(page.getByText("Monthly Revenue (MRR)")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "People" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
  await expect(page.getByTestId("person-row").first()).toBeVisible();
  // Back to the shop's page: People, Subscriptions, Finances.
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Demo Leak Co." })).toBeVisible();

  // Open Shop, View Only, with a reason.
  await page.getByRole("button", { name: "Open Shop" }).click();
  const sheet = page.getByRole("dialog", { name: "Open Demo Leak Co." });
  await sheet.getByLabel("Reason").fill("e2e: owner can't find an invoice");
  await sheet.getByRole("button", { name: "Open Shop" }).click();
  await page.waitForURL((url) => url.pathname === "/home");
  const banner = page.getByTestId("support-banner");
  await expect(banner).toContainText("Support: Demo Leak Co.");
  await expect(banner).toContainText("View Only");

  // The office shows the shop's work...
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await expect(banner).toBeVisible();
  // ...and the website refuses changes in View Only.
  const refused = await page.request.post("/api/feature-requests", {
    data: { request: "e2e: should be refused" },
  });
  expect(refused.status()).toBe(403);
  expect(await refused.text()).toContain("View Only");

  // End Session: back on the shop's page, with the session in its history and the log.
  await banner.getByRole("button", { name: "End Session" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/k4cs4uxrntb27z/shops/"));
  await expect(page.getByText("e2e: owner can't find an invoice").first()).toBeVisible();
  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Activity Log" })
    .click();
  await expect(page.getByRole("cell", { name: "Opened shop" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ended session" }).first()).toBeVisible();

  // On a phone, the portal is a message, not the pages.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/k4cs4uxrntb27z");
  await expect(page.getByText("The admin portal is made for a computer.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeHidden();
});
