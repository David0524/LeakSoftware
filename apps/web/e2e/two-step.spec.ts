import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminClient, signedInClient } from "./backend";
import { RUN, signIn, signOut } from "./helpers";

// Two-step sign-in (owner, 2026-10-16): turned on under More with an authenticator app; then
// the password alone opens no shop data, even straight through the API, and signing in asks
// for the code. The codes here are made the way an authenticator app makes them (RFC 6238).

function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Waits for a fresh 30-second window, so a code is never used twice. */
async function nextWindow() {
  await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 1_000));
}

test("two-step sign-in protects the shop's data until the code", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = adminClient();
  test.skip(!admin, "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).");
  const who = { email: `two-step-${RUN}@demo.leakbook.test`, password: "tidemark-two-step" };
  const { data: created } = await admin!.auth.admin.createUser({
    email: who.email,
    password: who.password,
    email_confirm: true,
    user_metadata: { full_name: "Two Step Tech" },
  });
  const { data: demo } = await admin!
    .from("company")
    .select("id")
    .eq("name", "Demo Leak Co.")
    .single();
  await admin!
    .from("membership")
    .insert({ company_id: demo!.id, user_id: created.user!.id, role: "tech" });

  // Turn it on: scan (here, read the key) and enter the first code.
  await signIn(page, who, "/more");
  await page.getByRole("link", { name: /Two-Step Sign-In/ }).click();
  await page.getByRole("button", { name: "Set Up Two-Step Sign-In" }).click();
  const secret = (await page.getByTestId("two-step-secret").textContent())!.trim();
  await page.getByLabel("Code").fill(totp(secret));
  await page.getByRole("button", { name: "Turn On Two-Step Sign-In" }).click();
  await expect(page.getByText("Two-step sign-in is on.")).toBeVisible();

  // The password alone: no shop data, even straight through the API.
  const passwordOnly = await signedInClient(who.email, who.password);
  const { count } = await passwordOnly.from("job").select("id", { count: "exact", head: true });
  expect(count).toBe(0);

  // Signing in asks for the code; a wrong one is refused.
  await page.goto("/more");
  await signOut(page);
  await page.goto("/sign-in?next=%2Fjobs");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/sign-in/verify");
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That code didn’t work. Try the newest one.")).toBeVisible();
  await nextWindow();
  await page.getByLabel("Code").fill(totp(secret));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/jobs");
  await expect(page.getByRole("heading", { name: "Jobs", level: 1 })).toBeVisible();

  // Turned off: the password works alone again.
  await page.goto("/more/two-step");
  await page.getByRole("button", { name: "Turn Off Two-Step Sign-In" }).click();
  await expect(page.getByText("Two-step sign-in is off.")).toBeVisible();
  await admin!.from("membership").update({ status: "disabled" }).eq("user_id", created.user!.id);
});
