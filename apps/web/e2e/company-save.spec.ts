import { expect, test } from "@playwright/test";
import { OWNER, RUN, signIn } from "./helpers";
import { PHONE } from "./money";

// Settings › Company and Branding has one Save, floating at the bottom (owner, 2026-10-22:
// "Any time you leave the branding/compliance on iOS it says 'discard changes' even after
// hitting save. Let's remove all the save buttons on that page and just have one floating one
// on the bottom"). It's dimmed until something changes, says "Saved." after a save, and leaving
// after a save doesn't ask. The accent's More colors are seven since slate went.

const SCREENS = process.env.E2E_SCREENSHOTS;

test.use({ ...PHONE });

test("one floating Save for the whole page; leaving after it doesn't ask", async ({ page }) => {
  await signIn(page, OWNER, "/settings/company");
  await expect(page.getByRole("heading", { level: 1, name: "Company and Branding" })).toBeVisible();
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toHaveCount(1);
  // (A shop still on the default color with a logo opens with the logo's color suggested, which
  // lights Save; otherwise it's dimmed until something changes. Checked after the save below.)
  // It floats in view at the bottom while the page is at the top.
  await expect(save).toBeInViewport();
  if (SCREENS) await page.screenshot({ path: `${SCREENS}/company-save-top.png` });

  // The accent's swatches: None and the seven presets, without slate.
  const accent = page.getByRole("group", { name: /Accent color swatches|More colors/ }).last();
  await expect(accent.getByRole("button", { name: "#3C4450" })).toHaveCount(0);

  // Keep the demo shop's own color: a suggestion from its logo means it's on the default.
  await page.waitForLoadState("networkidle");
  if (await page.getByText("Color picked from your logo.").isVisible()) {
    await page.getByLabel("Main color hex code").fill("#12263A");
    await page.getByLabel("Main color hex code").blur();
  }

  const legal = page.getByLabel("Legal name");
  // What the demo shop had (a run that failed half way left its own name: put back as empty).
  const was = await legal.inputValue();
  const before = was.startsWith("Pool Leak Pros LLC ") ? "" : was;
  await legal.fill(`Pool Leak Pros LLC ${RUN}`);
  // While a field has the keyboard, the bar steps aside on phones (as the Next Step bar does).
  await expect(save).toHaveCount(0);
  await legal.blur();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByTestId("save-bar").getByText("Saved.", { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(legal).toHaveValue(`Pool Leak Pros LLC ${RUN}`);
  if (SCREENS) {
    await page.getByRole("heading", { name: "Branding", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENS}/company-save-saved.png` });
  }

  // Saved, so leaving doesn't ask "Discard changes?".
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings$/);

  // A change not saved still asks.
  await page.goto("/settings/company");
  await legal.fill(before);
  await legal.blur();
  await expect(save).toBeEnabled();
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("alertdialog", { name: "Discard changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep Editing" }).click();
  // Put the demo shop's legal name back.
  await save.click();
  await expect(page.getByTestId("save-bar").getByText("Saved.", { exact: true })).toBeVisible();
  if (SCREENS) {
    await page.getByLabel("Legal name").fill("Typed, not saved");
    await page.getByLabel("Legal name").blur();
    await page.getByRole("heading", { name: "Branding", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SCREENS}/company-save-branding.png` });
    await page.getByLabel("Legal name").fill(before);
    await page.getByLabel("Legal name").blur();
  }
});

test("Customers' search and pickers aren't clipped on a phone", async ({ page }) => {
  await signIn(page, OWNER, "/customers");
  const search = page.getByPlaceholder("Name, phone, or email");
  await expect(search).toBeVisible();
  const box = await search.boundingBox();
  expect(box && box.x).toBeGreaterThanOrEqual(0);
  expect(box && box.x + box.width).toBeLessThanOrEqual(PHONE.viewport.width);
  if (SCREENS) await page.screenshot({ path: `${SCREENS}/customers-fields.png` });
});
