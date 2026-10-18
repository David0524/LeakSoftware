import { expect, test } from "@playwright/test";
import { OWNER, RUN, signIn } from "./helpers";

// M11 launch pieces: the pages the app stores link to, the status page an uptime monitor
// reads, and deleting an account from inside Sundeck Pro (App Store rule 5.1.1(v)).

test("privacy, terms, and status pages are public", async ({ page, request }) => {
  for (const [path, title] of [
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    // The final text is in (owner, 2026-10-18): no draft notice.
    await expect(page.getByText(/^Draft\./)).toHaveCount(0);
  }
  await page.goto("/status");
  await expect(page.getByRole("status")).toHaveText("Everything is working.");
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true });
});

test("a tech deletes their account and can't sign in again", async ({ page, browser }) => {
  const email = `e2e-leaver-${RUN}@demo.leakbook.test`;
  await signIn(page, OWNER, "/settings/team");
  // Invite Someone opens the invite form in a sheet; the open invite's row holds the link.
  await page.getByRole("button", { name: "Invite Someone", exact: true }).click();
  const invite = page.getByRole("dialog", { name: "Invite Someone" });
  await invite.getByLabel("Email").fill(email);
  await invite.getByRole("button", { name: "Create Invite" }).click();
  await page.getByTestId("invite").filter({ hasText: email }).getByRole("button").click();
  const link = await page
    .getByRole("dialog", { name: email })
    .getByLabel("Invite link")
    .inputValue();

  const guest = await browser.newContext();
  const tech = await guest.newPage();
  await tech.goto(new URL(link).pathname);
  await tech.getByLabel("Your name").fill("Leaving Tech");
  await tech.getByLabel("Choose a password").fill("e2e-password-123");
  await tech.getByRole("button", { name: "Create Account and Join" }).click();
  await tech.waitForURL("**/today");

  await tech.goto("/more");
  await tech.locator("summary", { hasText: "Delete My Account" }).click();
  const form = tech.locator("form").filter({ has: tech.getByLabel("Type DELETE to confirm") });
  await form.getByRole("button", { name: "Delete My Account" }).click();
  await expect(form.getByText("Type DELETE to confirm.")).toBeVisible();
  await form.getByLabel("Type DELETE to confirm").fill("DELETE");
  await form.getByRole("button", { name: "Delete My Account" }).click();
  await tech.waitForURL((url) => url.pathname === "/" && url.search === "?account=deleted");

  await tech.goto("/sign-in");
  await tech.getByLabel("Email").fill(email);
  await tech.getByLabel("Password").fill("e2e-password-123");
  await tech.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(tech.getByRole("alert")).toBeVisible();
  await guest.close();
});
