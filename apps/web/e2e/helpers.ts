import { expect, type Page } from "@playwright/test";

export const OWNER = { email: "owner@demo.leakbook.test", password: "leakbook-demo" };
export const TECH = { email: "tech@demo.leakbook.test", password: "leakbook-demo" };

/** A unique suffix so repeated runs against a shared database don't collide. */
export const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function signIn(page: Page, who: { email: string; password: string }, next = "/jobs") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((url) => url.pathname === next);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign Out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign In" })).toBeVisible();
}
