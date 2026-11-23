import { expect, test } from "@playwright/test";
import { OWNER, TECH, signIn } from "./helpers";

// Give a Month, Get a Month on More and in the account menu (owner, 2026-11-23: "Referral
// links should be more visible"). Owners only, the demo shop included; nothing is changed.

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the owner sees the referral card on More; the sheet has Copy Code", async ({ page }) => {
    await signIn(page, OWNER, "/more");
    const card = page.getByTestId("referral-offer");
    await expect(card.getByRole("heading", { name: "Give a Month, Get a Month" })).toBeVisible();
    await expect(
      card.getByText("Share your code. They get an extra month free, and so do you."),
    ).toBeVisible();
    await expect(card.getByTestId("referral-offer-code")).toContainText(/[A-Z0-9]{3,}/);
    await expect(card.getByRole("button", { name: "Share", exact: true })).toBeVisible();

    // The card body opens the full card in a sheet.
    await card.getByRole("button", { name: /^Give a Month, Get a Month: your code/ }).click();
    const sheet = page.getByRole("dialog", { name: "Give a Month, Get a Month" });
    await expect(sheet.getByRole("button", { name: "Copy Code" })).toBeVisible();
    await expect(sheet.getByTestId("referral-count")).toBeVisible();
  });

  test("a tech doesn't see it", async ({ page }) => {
    await signIn(page, TECH, "/more");
    await expect(page.getByRole("heading", { name: "More" })).toBeVisible();
    await expect(page.getByRole("link", { name: /My Profile/ })).toBeVisible();
    await expect(page.getByTestId("referral-offer")).toHaveCount(0);
  });
});

test("on a computer the owner's account menu has it; a tech's doesn't", async ({ browser }) => {
  for (const who of [OWNER, TECH]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await signIn(page, who, "/jobs");
    const account = page.getByRole("button", { name: /: account$/ });
    const signOut = page.getByRole("button", { name: "Sign Out" });
    await expect(async () => {
      if (!(await signOut.isVisible())) await account.click();
      await expect(signOut).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    const item = page.getByTestId("referral-menu-item");
    if (who === OWNER) {
      await expect(item).toContainText("Give a Month, Get a Month");
      await item.click();
      await expect(
        page
          .getByRole("dialog", { name: "Give a Month, Get a Month" })
          .getByRole("button", { name: "Copy Code" }),
      ).toBeVisible();
    } else {
      await expect(page.getByRole("link", { name: "Account and Help" })).toBeVisible();
      await expect(item).toHaveCount(0);
    }
    await context.close();
  }
});
