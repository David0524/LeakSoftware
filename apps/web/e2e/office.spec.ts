import { expect, test } from "@playwright/test";
import { OWNER, RUN, TECH, signIn, signOut } from "./helpers";

test.describe.configure({ mode: "serial" });

test("signed-out visitors see the home page and are sent to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find it");
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fjobs/);

  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don’t match" })).toBeVisible();
});

test("owner signs in and sees jobs", async ({ page }) => {
  await signIn(page, OWNER);
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }),
  ).toBeVisible();
  await signOut(page);
});

test("owner views the M4 sample job", async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto("/jobs?status=all");
  const row = page.getByRole("row").filter({ hasText: "Sam Sample" });
  await row.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: /^Job #\d+/ })).toBeVisible();
  await expect(page.getByText("9 Sample Way, Scottsdale, AZ 85251").first()).toBeVisible();

  // Checklist: inspected lines and the excluded drain with its reason.
  const checklist = page.getByRole("table").first();
  await expect(checklist.getByRole("row").filter({ hasText: "Return 3" })).toContainText(
    "Inspected",
  );
  await expect(checklist.getByRole("row").filter({ hasText: "Main drain 1" })).toContainText(
    "No diver on site",
  );
  await expect(page.getByText(/inspected · 1 excluded · 0 to do/)).toBeVisible();

  // Tests: the failing pressure test and the bucket test, worked out from the readings.
  await expect(page.getByText("Dropped 8 PSI in 15 min")).toBeVisible();
  await expect(page.getByText(/0\.69 in lost beyond evaporation/)).toBeVisible();

  // Findings with pins on the diagram.
  await expect(page.getByText("Return 3 line break", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Pool diagram with 2 finding pins/ })).toBeVisible();

  // Owners see the timeline.
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
});

test("owner edits the price book", async ({ page }) => {
  await signIn(page, OWNER, "/settings/price-book");
  const name = `E2E fitting ${RUN}`;
  const add = page.locator("form").filter({ has: page.getByRole("button", { name: "Add Item" }) });
  await add.getByLabel("Name").fill(name);
  await add.getByLabel("Price ($)").fill("123.45");
  await add.getByLabel("Category").fill("Test items");
  await add.getByRole("button", { name: "Add Item" }).click();
  await expect(add.getByText(`Added ${name}.`)).toBeVisible();

  const item = page.getByTestId("price-item").filter({ hasText: name });
  await expect(item).toContainText("$123.45");
  await item.locator("summary").click();
  await item.getByLabel("Price ($)").fill("150");
  await item.getByRole("button", { name: "Save Item" }).click();
  await expect(item.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("price-item").filter({ hasText: name })).toContainText("$150.00");

  // Clean up.
  const saved = page.getByTestId("price-item").filter({ hasText: name });
  await saved.locator("summary").click();
  page.once("dialog", (d) => void d.accept());
  await saved.getByRole("button", { name: "Remove Item" }).click();
  await expect(page.getByTestId("price-item").filter({ hasText: name })).toHaveCount(0);
});

test("owner invites a tech, who joins and cannot reach settings", async ({ page, browser }) => {
  const email = `e2e-tech-${RUN}@demo.leakbook.test`;
  await signIn(page, OWNER, "/settings/team");
  const invite = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Create Invite" }) });
  await invite.getByLabel("Email").fill(email);
  await invite.getByRole("button", { name: "Create Invite" }).click();
  await expect(invite.getByText(`Invite created for ${email}`)).toBeVisible();

  const card = page.getByTestId("invite").filter({ hasText: email });
  const link = await card.getByLabel("Invite link").inputValue();
  expect(link).toMatch(/\/invite\/[0-9a-f]{48}$/);

  // The invitee opens the link in a fresh browser.
  const guest = await browser.newContext();
  const tech = await guest.newPage();
  await tech.goto(new URL(link).pathname);
  await expect(tech.getByText(/invited you to LeakBook as a tech/)).toBeVisible();
  await tech.getByLabel("Your name").fill("E2E Tech");
  await tech.getByLabel("Choose a password").fill("e2e-password-123");
  await tech.getByRole("button", { name: "Create Account and Join" }).click();
  await tech.waitForURL("**/jobs");
  const nav = tech.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Jobs" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

  await tech.goto("/settings/price-book");
  await expect(tech.getByText("Settings are for owners.")).toBeVisible();
  await expect(tech.getByRole("button", { name: "Add Item" })).toHaveCount(0);

  // The invite is used up.
  await tech.goto(new URL(link).pathname);
  await expect(tech.getByText("This invite link is no longer valid.")).toBeVisible();
  await guest.close();

  // The owner sees the new tech, then turns their access off (keeps reruns tidy).
  await page.reload();
  const person = page.locator("li").filter({ hasText: email });
  await expect(person).toContainText("E2E Tech");
  await person.getByLabel("Access").selectOption("disabled");
  await person.getByRole("button", { name: "Save" }).click();
  await expect(person.getByText("Saved.")).toBeVisible();
});

test("the demo tech cannot reach settings", async ({ page }) => {
  await signIn(page, TECH);
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }),
  ).toHaveCount(0);
  for (const path of ["/settings", "/settings/team", "/settings/company"]) {
    await page.goto(path);
    await expect(page.getByText("Settings are for owners.")).toBeVisible();
  }
});

test("the appearance switch picks light or dark and remembers it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const html = page.locator("html");
  const appearance = page.getByRole("radiogroup", { name: "Appearance" });
  // Auto follows the device.
  await expect(appearance.getByRole("radio", { name: "Auto" })).toBeChecked();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await appearance.getByRole("radio", { name: "Light" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("img", { name: "LeakBook" }).first()).toBeVisible();

  // The office header has the switch too.
  await signIn(page, OWNER);
  const office = page.getByRole("radiogroup", { name: "Appearance" });
  await expect(office.getByRole("radio", { name: "Light" })).toBeChecked();
  await office.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await office.getByRole("radio", { name: "Auto" }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");
  await signOut(page);
});
