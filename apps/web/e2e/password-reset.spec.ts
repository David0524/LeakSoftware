import { expect, test } from "@playwright/test";
import { adminClient } from "./backend";
import { RUN, signIn, signOut } from "./helpers";
import { lastEmailTo } from "./outbox";

// Password reset (owner, 2026-10-22): Forgot Password? on sign-in emails a link (from the
// server, so it works whichever app asked); the link opens Choose a New Password, once; the
// new password signs in and the old one doesn't.

test("a forgotten password is reset from the email's link", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = adminClient();
  test.skip(!admin, "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).");
  const who = { email: `forgot-${RUN}@demo.leakbook.test`, password: "The-old-password-1" };
  const { data: created } = await admin!.auth.admin.createUser({
    email: who.email,
    password: who.password,
    email_confirm: true,
    user_metadata: { full_name: "Forgetful Tech" },
  });
  const { data: demo } = await admin!
    .from("company")
    .select("id")
    .eq("name", "Demo Leak Co.")
    .single();
  await admin!
    .from("membership")
    .insert({ company_id: demo!.id, user_id: created.user!.id, role: "tech" });

  try {
    // Forgot Password? from sign-in, with the same answer for any address.
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Forgot Password?" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Reset Password" })).toBeVisible();
    // Recently visited pages stay mounted, hidden: Sign In's own Email field is still there.
    await page.getByLabel("Email").filter({ visible: true }).fill(who.email);
    await page.getByRole("button", { name: "Email Me a Reset Link" }).click();
    await expect(
      page.getByText(`If ${who.email} has a Sundeck Pro account, a reset link is on its way.`),
    ).toBeVisible();

    // The email's link.
    await expect
      .poll(async () => (await lastEmailTo(who.email))?.subject)
      .toBe("Reset your Sundeck Pro password");
    const email = (await lastEmailTo(who.email))!;
    const link = email.text.match(/https?:\/\/\S+\/auth\/confirm\?\S+/)![0];

    // Choose a New Password: typed twice the same.
    await page.goto(link);
    await page.waitForURL((url) => url.pathname === "/reset-password");
    await expect(
      page.getByRole("heading", { level: 1, name: "Choose a New Password" }),
    ).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("The-new-password-1");
    await page.getByLabel("Type it again", { exact: true }).fill("The-new-password-2");
    await page.getByRole("button", { name: "Save New Password" }).click();
    await expect(page.getByText("The two passwords don’t match.")).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("The-new-password-1");
    await page.getByLabel("Type it again", { exact: true }).fill("The-new-password-1");
    await page.getByRole("button", { name: "Save New Password" }).click();
    await expect(page.getByText(/Your password is changed\./)).toBeVisible();
    await expect
      .poll(async () => (await lastEmailTo(who.email))?.subject)
      .toBe("Your Sundeck Pro password was changed");
    await page.getByRole("link", { name: "Continue to Sundeck Pro" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/reset-password"));
    await signOut(page);

    // The link works once.
    await page.goto(link);
    await page.waitForURL((url) => url.pathname === "/forgot-password");
    await expect(page.getByText("That reset link has expired or was already used.")).toBeVisible();

    // The old password no longer signs in; the new one does.
    await page.goto("/sign-in?next=%2Fjobs");
    await page.getByLabel("Email").fill(who.email);
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page.getByText(/email and password don’t match/)).toBeVisible();
    await signIn(page, { email: who.email, password: "The-new-password-1" });
    await expect(page.getByRole("heading", { name: "Jobs", level: 1 })).toBeVisible();
    await signOut(page);
  } finally {
    // Turned off afterwards, like two-step's tech: later tests count the demo shop's techs.
    await admin!.from("membership").update({ status: "disabled" }).eq("user_id", created.user!.id);
  }
});

test("Choose a New Password needs a fresh reset link, not just a session", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByText("That reset link has expired or was already used.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Get a New Link" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});
