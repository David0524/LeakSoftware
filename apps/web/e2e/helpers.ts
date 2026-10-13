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

/** Phones: show one part of the job page (Details, Checklist, Findings, Photos, Wrap-Up). */
export async function jobSection(page: Page, name: string) {
  await page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
}

/** Unfold every checklist section (finished ones start folded). */
export async function openChecklist(page: Page) {
  await expect(page.getByText(/ to do$/)).toBeVisible();
  for (const button of await page
    .locator('button[aria-controls^="checklist-"][aria-expanded="false"]')
    .all())
    await button.click();
}

/** Answer everything still to do with each section's "Mark … Remaining" shortcut. */
export async function finishChecklist(page: Page) {
  const tally = page.getByText(/ to do$/);
  const toDo = async () => Number(/(\d+) to do/.exec(await tally.innerText())![1]);
  for (;;) {
    const before = await toDo();
    if (before === 0) return;
    await page
      .getByRole("button", { name: /^(Mark|Answer) \d+ Remaining/ })
      .first()
      .click();
    await expect.poll(toDo).toBeLessThan(before);
  }
}
