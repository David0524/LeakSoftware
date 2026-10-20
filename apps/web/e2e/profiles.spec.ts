import { expect, test } from "@playwright/test";
import { OWNER, RUN, signIn } from "./helpers";

// Owner, 2026-10-20: a profile for each tech or employee, kept by owners and admins; phone
// numbers put in their parentheses and dash as they're typed.

test("owners keep a profile for each person, and phone numbers format as they're typed", async ({
  page,
}) => {
  await signIn(page, OWNER, "/settings/team");
  // Team is one list: each person's row opens their profile (owner, 2026-10-20).
  const profiles = page.getByTestId("member");
  const open = () =>
    profiles
      .filter({ hasText: "Tony Tech" })
      .getByRole("button", { name: /^Tony Tech/ })
      .click();
  await open();
  const sheet = page.getByRole("dialog", { name: "Tony Tech" });

  const phone = sheet.getByLabel("Phone").first();
  await phone.fill("");
  await phone.pressSequentially("6025550142");
  await expect(phone).toHaveValue("(602) 555-0142");
  // Deleting digit by digit drops the dash with the last digit after it.
  await phone.press("End");
  for (let i = 0; i < 4; i++) await phone.press("Backspace");
  await phone.press("Backspace");
  await expect(phone).toHaveValue("(602) 55");

  const note = `Allergic to bees (${RUN}).`;
  await phone.fill("");
  await phone.pressSequentially("4805550111");
  await sheet.getByLabel("Name").nth(1).fill("Jordan Tech");
  await sheet.getByLabel("Phone").nth(1).pressSequentially("4805550199");
  await sheet.getByLabel("Notes").fill(note);
  await sheet.getByRole("button", { name: /^Save( Profile)?$/ }).click();
  await expect(page.getByText(/^(Saved\.|Added Tony Tech\.)$/)).toBeVisible();

  await page.reload();
  await open();
  const again = page.getByRole("dialog", { name: "Tony Tech" });
  await expect(again.getByLabel("Phone").first()).toHaveValue("(480) 555-0111");
  await expect(again.getByLabel("Phone").nth(1)).toHaveValue("(480) 555-0199");
  await expect(again.getByLabel("Notes")).toHaveValue(note);
});
