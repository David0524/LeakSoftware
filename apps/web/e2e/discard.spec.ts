import { expect, test, type Page } from "@playwright/test";
import { OWNER, signIn } from "./helpers";
import { SAMPLE_JOB } from "./money";

// Discard changes, everywhere (owner, 2026-10-20): an editor with unsaved changes asks
// "Discard changes?" before Cancel, Escape, a tap outside, Back, or a link leaves it; nothing
// asks when nothing changed. Nothing here saves: the sample job and the shop stay as they are.
test.use({ viewport: { width: 390, height: 844 } });

const ask = (page: Page) => page.getByRole("alertdialog", { name: "Discard changes?" });

test("a sheet with changes asks before it closes, and a clean one doesn't", async ({ page }) => {
  await signIn(page, OWNER, `/jobs/${SAMPLE_JOB}`);
  await page.getByRole("tab", { name: /^Findings/ }).click();
  const bar = page.getByRole("toolbar", { name: "Next step" });
  const sheet = page.getByRole("dialog", { name: "Add Test" });

  // Nothing typed: Cancel closes at once.
  await bar.getByRole("button", { name: "Add Test" }).click();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(ask(page)).toHaveCount(0);

  // Typed: Escape, then Back, ask; Keep Editing keeps the text; Discard Changes closes.
  await bar.getByRole("button", { name: "Add Test" }).click();
  await sheet.getByLabel("Line").fill("Main drain");
  await page.keyboard.press("Escape");
  await expect(ask(page).getByRole("button")).toHaveText(["Keep Editing", "Discard Changes"]);
  await ask(page).getByRole("button", { name: "Keep Editing" }).click();
  await expect(sheet.getByLabel("Line")).toHaveValue("Main drain");
  await page.goBack();
  await expect(ask(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/jobs/${SAMPLE_JOB}`));
  await ask(page).getByRole("button", { name: "Discard Changes" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/jobs/${SAMPLE_JOB}\\?tab=findings$`));
});

test("a page form with changes asks before a tab leaves it", async ({ page }) => {
  await signIn(page, OWNER, "/jobs/new");
  const today = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" });
  await page.getByLabel("Name", { exact: true }).fill("Not saved");
  await today.click();
  await ask(page).getByRole("button", { name: "Keep Editing" }).click();
  await expect(page).toHaveURL(/\/jobs\/new$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Not saved");
  await today.click();
  await ask(page).getByRole("button", { name: "Discard Changes" }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test("a field typed into while the page is still loading still asks", async ({ page }) => {
  // The guard sits in its own Suspense boundary and can start listening after the page is
  // usable (company-save.spec.ts was flaky on it): hold the scripts back, type into the page's
  // HTML, then let them load.
  await signIn(page, OWNER, "/jobs");
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/_next/static/**/*.js", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/jobs/new", { waitUntil: "commit" });
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("Typed early");
  release();
  await page.waitForLoadState("networkidle");
  await expect(name).toHaveValue("Typed early");
  const today = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" });
  await today.click();
  await expect(ask(page)).toBeVisible();
  await ask(page).getByRole("button", { name: "Keep Editing" }).click();
  await expect(page).toHaveURL(/\/jobs\/new$/);
});
