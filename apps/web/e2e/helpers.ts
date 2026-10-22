import { expect, type Page, type Locator } from "@playwright/test";

export const OWNER = { email: "owner@demo.leakbook.test", password: "leakbook-demo" };
export const TECH = { email: "tech@demo.leakbook.test", password: "leakbook-demo" };

/** A unique suffix so repeated runs against a shared database don't collide. */
export const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function signIn(page: Page, who: { email: string; password: string }, next = "/jobs") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  // `next` may carry a query ("/jobs?status=all"): compare what it names.
  await page.waitForURL(
    (url) => (next.includes("?") ? url.pathname + url.search : url.pathname) === next,
  );
}

export async function signOut(page: Page) {
  // On a computer, Sign Out is in the account menu at the end of the header.
  const out = page.getByRole("button", { name: "Sign Out" });
  if (!(await out.isVisible())) await page.getByRole("button", { name: /: account$/ }).click();
  await out.click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign In" })).toBeVisible();
}

/** Phones: show one part of the job page (Details, Checklist, Findings, Photos, Wrap-Up). */
export async function jobSection(page: Page, name: string) {
  await page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
}

/** The Checklist tab, when another one is showing (every screen has tabs, owner 2026-10-22). */
async function showChecklist(page: Page) {
  if (!(await page.locator("#part-checklist").isVisible())) await jobSection(page, "Checklist");
}

/** Unfold every checklist section (finished ones start folded). */
export async function openChecklist(page: Page) {
  await showChecklist(page);
  await expect(page.getByText(/not leaking · .* to do$/)).toBeVisible();
  // Each click takes a section out of the set, so always open the first one left.
  const folded = page.locator('button[aria-controls^="checklist-"][aria-expanded="false"]');
  while ((await folded.count()) > 0) await folded.first().click();
}

/** Answer everything still to do with each section's "Mark … Remaining" shortcut. */
export async function finishChecklist(page: Page) {
  await showChecklist(page);
  const tally = page.getByText(/not leaking · .* to do$/);
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

/** Sends a report draft without the customer's signature (Send Without a Signature). */
export async function sendUnsigned(panel: Locator, via: "Send by Email" | "Send by Text") {
  const unsigned = panel.getByTestId("send-unsigned");
  await unsigned.getByText("Send Without a Signature").click();
  await unsigned.getByRole("button", { name: via }).click();
}

/**
 * Wrap-Up's finish list (owner, 2026-10-22): opens a step by its row's title ("Report",
 * "Quote", "Customer signs", "Invoice"; a quote or invoice row's title starts with its name) and
 * returns the step: in a sheet on phones and tablets, in the panel beside the list on computers.
 * Picks the Wrap-Up tab first when another one is showing.
 */
export async function wrapUpStep(page: Page, title: string) {
  if (!(await page.getByTestId("wrap-up").isVisible())) await jobSection(page, "Wrap-Up");
  await page
    .getByTestId("wrap-up")
    .getByRole("button", { name: new RegExp(`^Step \\d+ of \\d+, ${title}`) })
    .first()
    .click();
  const step = page.getByTestId("wrap-up-step");
  await expect(step).toBeVisible();
  return step;
}

/** Puts the open Wrap-Up step away with Done, back to the list. */
export async function closeWrapUpStep(page: Page) {
  await page
    .getByTestId("wrap-up-panel")
    .or(page.getByRole("dialog").filter({ has: page.getByTestId("wrap-up-step") }))
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await expect(page.getByTestId("wrap-up-step")).toHaveCount(0);
}
