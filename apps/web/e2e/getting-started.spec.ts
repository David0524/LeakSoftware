import { expect, test } from "@playwright/test";
import { OWNER, signIn } from "./helpers";

// Getting Started (owner, 2026-10-16): owners get their shop's first steps.

test("owners see Getting Started for the shop's packages", async ({ page }) => {
  await signIn(page, OWNER, "/today");
  // On a computer it waits in the corner (owner, 2026-10-18) and opens from there.
  await page.getByRole("button", { name: /^Getting Started, \d+ of \d+ done$/ }).click();
  const start = page.getByTestId("getting-started-dock");
  // The demo shop does both and has its techs, so inviting is already done.
  await expect(start.getByRole("link", { name: /Invite your techs \(done\)/ })).toBeVisible();
  await expect(start.getByRole("link", { name: /Give each pool a visit plan/ })).toBeVisible();
  await expect(start.getByRole("link", { name: /Book your first leak job/ })).toBeVisible();
});
