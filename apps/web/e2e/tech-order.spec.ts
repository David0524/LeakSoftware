import { expect, test } from "@playwright/test";
import { signedInClient } from "./backend";
import { OWNER, TECH, signIn } from "./helpers";

// Reorder Techs (owner, 2026-10-21: "Make a way to reorder techs in the schedule";
// docs/design/2026-10-21-tech-order.md): an owner moves a tech in the sheet, Done saves, and the
// Schedule's columns follow at once. Techs don't get the action.

test("an owner reorders techs and the Schedule follows", async ({ page }) => {
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const ownerId = (await owner.auth.getUser()).data.user!.id;
  const { data: mine } = await owner
    .from("membership")
    .select("company_id")
    .eq("user_id", ownerId)
    .limit(1)
    .single();
  const company = mine!.company_id as string;
  const reset = () =>
    owner.from("membership").update({ schedule_order: null }).eq("company_id", company);
  await reset();

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, OWNER, "/schedule?view=day");
    const routes = page.getByTestId("route");
    await expect(routes.first()).toBeVisible();
    const names = async () =>
      (
        await routes.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))
      ).filter((n, i, all) => all.indexOf(n) === i);
    const before = await names();
    expect(before.length).toBeGreaterThan(1);

    await page.getByRole("button", { name: "Reorder Techs" }).click();
    const sheet = page.getByRole("dialog", { name: "Reorder Techs" });
    await expect(sheet).toBeVisible();
    const list = sheet.getByTestId("reorder-techs").locator("li");
    await expect(list).toHaveCount(before.length);
    await expect(list.first()).toContainText(before[0]!);

    // Cancel leaves the order as it was.
    await sheet.getByRole("button", { name: `Move Down, ${before[0]}` }).click();
    await expect(list.nth(1)).toContainText(before[0]!);
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet).toBeHidden();
    expect(await names()).toEqual(before);

    // Move Down, then Done: the first tech's column is second.
    await page.getByRole("button", { name: "Reorder Techs" }).click();
    await expect(list.first()).toContainText(before[0]!);
    await sheet.getByRole("button", { name: `Move Down, ${before[0]}` }).click();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toBeHidden();
    const after = [before[1]!, before[0]!, ...before.slice(2)];
    await expect.poll(names).toEqual(after);

    // Saved for the shop: it holds after a reload.
    await page.reload();
    await expect.poll(names).toEqual(after);
  } finally {
    await reset();
  }
});

test("a tech doesn't get Reorder Techs", async ({ page }) => {
  await signIn(page, TECH, "/schedule?view=day");
  await expect(page.getByRole("heading", { name: "Schedule" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reorder Techs" })).toHaveCount(0);
});
