import { expect, test, type Page } from "@playwright/test";
import { OWNER, TECH, signIn } from "./helpers";

// The walkthrough (owner, 2026-10-16): a tip on each screen until it's closed, remembered on
// the account; More › Show Tips Again brings them back; owners get Getting Started.

/** More › Show Tips Again, waiting for it to be saved before leaving the page. */
async function showTipsAgain(page: Page) {
  const saved = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/more",
  );
  await page.getByRole("button", { name: "Show Tips Again" }).click();
  await saved;
}

test("a tip shows once, stays closed, and comes back on request", async ({ page }) => {
  await signIn(page, TECH, "/more");
  await showTipsAgain(page);
  await page.goto("/messages?list=1");
  const tip = page.getByRole("complementary", { name: "Tip: One inbox for the whole shop" });
  await expect(tip).toBeVisible();
  await tip.getByRole("button", { name: "Close Tip" }).click();
  await expect(tip).toHaveCount(0);
  // Remembered on the account, not just the page.
  await expect(async () => {
    await page.reload();
    await expect(tip).toHaveCount(0, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  // A tech gets no owner tips.
  await page.goto("/schedule");
  await expect(page.getByRole("complementary", { name: /^Tip: Day, week, or month/ })).toHaveCount(
    0,
  );

  await page.goto("/more");
  await showTipsAgain(page);
  await page.goto("/messages?list=1");
  await expect(tip).toBeVisible();
});

test("owners see Getting Started for the shop's packages", async ({ page }) => {
  await signIn(page, OWNER, "/more");
  await showTipsAgain(page);
  await page.goto("/today");
  // On a computer it waits in the corner (owner, 2026-10-18) and opens from there.
  await page.getByRole("button", { name: /^Getting Started, \d+ of \d+ done$/ }).click();
  const start = page.getByTestId("getting-started-dock");
  // The demo shop does both and has its techs, so inviting is already done.
  await expect(start.getByRole("link", { name: /Invite your techs \(done\)/ })).toBeVisible();
  await expect(start.getByRole("link", { name: /Give each pool a visit plan/ })).toBeVisible();
  await expect(start.getByRole("link", { name: /Book your first leak job/ })).toBeVisible();
});
