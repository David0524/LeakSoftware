import { expect, test } from "@playwright/test";
import { OWNER, signIn } from "./helpers";

// Swipe actions and touch-and-hold menus on every list (owner, 2026-10-20; gestures.md
// section 12), on a computer: right-click a row for its menu, or use the "⋯" button that
// shows on hover and keyboard focus. The menu is a real menu: titled with the row's name,
// arrow keys and Home and End move through it, and Escape puts focus back.

test.describe.configure({ mode: "serial" });

test("Jobs: a right-click opens the row's menu, and Open goes to the job", async ({ page }) => {
  await signIn(page, OWNER, "/jobs?status=all");
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible();

  await row.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toHaveCount(1);
  // Titled with the customer, plus the job number when it has one.
  await expect(menu).toHaveAccessibleName(/\S/);
  await expect(menu.getByRole("menuitem", { name: "Open", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Open", exact: true })).toBeFocused();

  // Escape closes it; a click outside does too.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await row.click({ button: "right" });
  await expect(menu).toHaveCount(1);
  await page.mouse.click(5, 5);
  await expect(menu).toHaveCount(0);

  await row.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Open", exact: true }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}/);
});

test("Jobs: the keyboard opens the same menu from its ⋯ button", async ({ page }) => {
  await signIn(page, OWNER, "/jobs?status=all");
  const row = page.locator("tbody tr").first();
  const more = row.getByRole("button", { name: /^More: / });
  // Tab from the row's link to its ⋯ button, which shows once it has focus.
  await row.getByRole("link").first().focus();
  await page.keyboard.press("Tab");
  await expect(more).toBeFocused();
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute("aria-haspopup", "menu");

  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toHaveCount(1);
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const items = menu.getByRole("menuitem");
  await expect(items.first()).toBeFocused();
  const count = await items.count();
  expect(count).toBeGreaterThan(1);
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(items.nth(count - 1)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(items.first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(items.nth(count - 1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(items.first()).toBeFocused();

  // Escape closes it and puts focus back on the button.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

test("Invoices: a right-click opens the row's menu, without what a void invoice can't do", async ({
  page,
}) => {
  await signIn(page, OWNER, "/invoices");
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible();
  await row.click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(menu).toHaveCount(1);
  await expect(menu).toHaveAccessibleName(/\S/);
  await expect(menu.getByRole("menuitem", { name: "Open", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // A void invoice: no payment to record, nothing to void, no link to copy.
  await page.goto("/invoices?filter=void");
  const voided = page.locator("tbody tr").first();
  if (await voided.isVisible()) {
    await voided.click({ button: "right" });
    await expect(menu.getByRole("menuitem", { name: "Open", exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Void…", exact: true })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Record Payment…", exact: true })).toHaveCount(
      0,
    );
    await expect(
      menu.getByRole("menuitem", { name: "Copy Payment Link", exact: true }),
    ).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Open", exact: true }).click();
    await page.waitForURL(/\/jobs\/[0-9a-f-]{36}#invoice/);
  }
});
