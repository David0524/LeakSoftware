import { devices, expect, test } from "@playwright/test";
import {
  OWNER,
  RUN,
  TECH,
  finishChecklist,
  jobSection,
  openChecklist,
  signIn,
  signOut,
} from "./helpers";
import { signedInClient } from "./backend";
import { solidPng } from "./png";

test.describe.configure({ mode: "serial" });

test("signed-out visitors see the home page and are sent to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Clean the pool");
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fjobs/);

  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don’t match" })).toBeVisible();
});

test("owners land on the Dashboard on a computer, and on Today on a phone", async ({
  page,
  browser,
}) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  // The Dashboard leads the header; the logo comes back to it.
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link").first()).toHaveText("Dashboard");
  await page.goto("/jobs");
  await page.getByRole("link", { name: "Sundeck Pro, Home" }).click();
  await page.waitForURL((url) => url.pathname === "/dashboard");

  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await phone.newPage();
  await mobile.goto("/sign-in");
  await mobile.getByLabel("Email").fill(OWNER.email);
  await mobile.getByLabel("Password").fill(OWNER.password);
  await mobile.getByRole("button", { name: "Sign In", exact: true }).click();
  await mobile.waitForURL((url) => url.pathname === "/today");
  await phone.close();

  // Signed in, a crafted sign-in link stays on the site.
  await page.goto("/sign-in?next=//example.com");
  await page.waitForURL((url) => url.pathname === "/home" || url.pathname === "/dashboard");
  expect(new URL(page.url()).host).not.toBe("example.com");
});

test("owner views the M4 sample job", async ({ page }) => {
  await signIn(page, OWNER);
  await page.goto("/jobs?status=all&q=Sam%20Sample");
  const row = page.getByRole("row").filter({ hasText: "Sam Sample" });
  await row.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: /^Job #\d+/ })).toBeVisible();
  await expect(page.getByText("7408 E Osborn Rd, Scottsdale, AZ 85251").first()).toBeVisible();

  // Texts with Sam about this job (seed_demo_messages.sql): the latest few, then the whole
  // conversation in Messages.
  const texts = page.getByRole("list", { name: "Messages" });
  await expect(texts.getByText(/Return 3 line is leaking/)).toBeVisible();
  await expect(texts.getByText("How soon can you fix the return line?")).toBeVisible();
  await page.getByRole("link", { name: /^(See All Messages|Open Conversation)/ }).click();
  await expect(page.getByRole("heading", { name: "Sam Sample" })).toBeVisible();
  await expect(page.getByText(/auto-fill runs all the time/)).toBeVisible();
  await page.goBack();

  // Checklist: verdicts by section, the leaking line with where, the drain with its reason.
  await openChecklist(page);
  await expect(page.getByLabel("Return 3", { exact: true })).toHaveValue("leaking");
  await expect(page.getByLabel("Where: Return 3")).toHaveValue(/Under the deck/);
  await expect(
    page.getByRole("listitem").filter({ has: page.getByLabel("Main drain 1", { exact: true }) }),
  ).toContainText("No diver on site");
  await expect(
    page.getByText(/\d+ not leaking · 1 attention · 1 leaking · 1 not applicable · 0 to do/),
  ).toBeVisible();

  // Tests: the failing pressure test and the bucket test, worked out from the readings.
  await expect(page.getByText("Dropped 8 PSI in 15 min")).toBeVisible();
  await expect(page.getByText(/0\.69 in lost beyond evaporation/)).toBeVisible();

  // Findings with pins on the diagram.
  await expect(page.getByText("Return 3 line break", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Pool diagram with 2 finding pins/ })).toBeVisible();

  // Owners see the timeline: the latest three changes, the rest behind Show More.
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByRole("listitem").filter({ visible: true })).toHaveCount(3);
  await timeline.getByText(/^Show \d+ More$/).click();
  expect(await timeline.getByRole("listitem").filter({ visible: true }).count()).toBeGreaterThan(3);
  await expect(timeline.getByText("Show Less")).toBeVisible();
});

test("owner edits the price book", async ({ page }) => {
  await signIn(page, OWNER, "/settings/price-book");
  const name = `E2E fitting ${RUN}`;
  // Items are rows that open in a sheet; Add Item opens an empty one. When a save works, the
  // sheet closes and the page says what happened.
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add Item" });
  await add.getByLabel("Name").fill(name);
  await add.getByLabel("Price ($)").fill("123.45");
  await add.getByLabel("Category").fill("Test items");
  await add.getByRole("button", { name: "Add Item" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Added ${name}.` })).toBeVisible();
  await expect(add).toHaveCount(0);

  const item = page.getByTestId("price-item").filter({ hasText: name });
  await expect(item).toContainText("$123.45");
  await item.getByRole("button").click();
  const edit = page.getByRole("dialog", { name });
  await edit.getByLabel("Price ($)").fill("150");
  await edit.getByRole("button", { name: "Save Item" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(item).toContainText("$150.00");
  await page.reload();
  await expect(page.getByTestId("price-item").filter({ hasText: name })).toContainText("$150.00");

  // Clean up.
  const saved = page.getByTestId("price-item").filter({ hasText: name });
  await saved.getByRole("button").click();
  await page.getByRole("dialog", { name }).getByRole("button", { name: "Remove Item" }).click();
  await page
    .getByRole("alertdialog", { name: "Remove this item from the price book?" })
    .getByRole("button", { name: "Remove Item" })
    .click();
  await expect(page.getByTestId("price-item").filter({ hasText: name })).toHaveCount(0);
});

test("owner invites a tech, who joins and cannot reach settings", async ({ page, browser }) => {
  const email = `e2e-tech-${RUN}@demo.leakbook.test`;
  await signIn(page, OWNER, "/settings/team");
  // Invite Someone opens the invite form in a sheet; it closes once the invite is made.
  await page.getByRole("button", { name: "Invite Someone", exact: true }).click();
  const invite = page.getByRole("dialog", { name: "Invite Someone" });
  await invite.getByLabel("Email").fill(email);
  await invite.getByRole("button", { name: "Create Invite" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Invite created for ${email}` }),
  ).toBeVisible();

  // The open invite is a row; its sheet holds the link.
  const card = page.getByTestId("invite").filter({ hasText: email });
  await card.getByRole("button").click();
  const link = await page
    .getByRole("dialog", { name: email })
    .getByLabel("Invite link")
    .inputValue();
  expect(link).toMatch(/\/invite\/[0-9a-f]{48}$/);

  // The invitee opens the link in a fresh browser.
  const guest = await browser.newContext();
  const tech = await guest.newPage();
  await tech.goto(new URL(link).pathname);
  await expect(tech.getByText(/invited you to Sundeck Pro as a tech/)).toBeVisible();
  await tech.getByLabel("Your name").fill("E2E Tech");
  await tech.getByLabel("Choose a password").fill("e2e-password-123");
  await tech.getByRole("button", { name: "Create Account and Join" }).click();
  await tech.waitForURL("**/today");
  const nav = tech.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Jobs" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

  await tech.goto("/settings/price-book");
  await expect(tech.getByText(/^Settings are for owners and admins\./)).toBeVisible();
  await expect(tech.getByRole("button", { name: "Add Item" })).toHaveCount(0);

  // The invite is used up.
  await tech.goto(new URL(link).pathname);
  await expect(tech.getByText("This invite link is no longer valid.")).toBeVisible();
  await guest.close();

  // The owner sees the new tech, then turns their access off (keeps reruns tidy).
  await page.reload();
  const person = page.locator("li").filter({ hasText: email });
  await expect(person).toContainText("E2E Tech");
  // The person's row opens their role and access in a sheet.
  await person.getByRole("button").click();
  const member = page.getByRole("dialog", { name: "E2E Tech" });
  await member.getByLabel("Access").selectOption("disabled");
  await member.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(person).toContainText("Turned off");
});

test("on a computer, Settings is a gear and More holds Customers, Invoices, and Chemicals", async ({
  page,
}) => {
  await signIn(page, OWNER, "/jobs");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Jobs" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Invoices" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Customers" })).toHaveCount(0);
  const more = nav.getByRole("button", { name: "More" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await nav.getByRole("link", { name: "Invoices" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Invoices" })).toBeVisible();
  // The menu closed on the new page, and More shows where you are.
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toHaveClass(/bg-white\/15/);
  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
});

test("the demo tech cannot reach settings", async ({ page }) => {
  await signIn(page, TECH);
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }),
  ).toHaveCount(0);
  // Needs a Time is the office's list; techs don't see it (owner, 2026-10-18).
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  await expect(page.getByTestId("tray")).toHaveCount(0);
  for (const path of ["/settings", "/settings/team", "/settings/company"]) {
    await page.goto(path);
    await expect(page.getByText(/^Settings are for owners and admins\./)).toBeVisible();
  }
});

test("the site starts light; the sun/moon button switches it and remembers", async ({ page }) => {
  // The device's dark setting is not followed: light by default (owner, 2026-10-13).
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("img", { name: "Sundeck Pro" }).first()).toBeVisible();

  // The office header has the button too.
  await signIn(page, OWNER);
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Light mode" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await signOut(page);
});

test("owners delete a customer only when no work is open", async ({ page }) => {
  // A customer with no jobs, added the way the phone adds one.
  const tech = await signedInClient(TECH.email, TECH.password);
  const { data: job } = await tech
    .from("job")
    .select("company_id")
    .eq("id", "00000000-0000-4000-8000-00000000e001")
    .single();
  const name = `Delete Me ${RUN}`;
  const { data: added } = await tech
    .from("customer")
    .insert({ company_id: job!.company_id, name })
    .select("id")
    .single();

  await signIn(page, OWNER, "/customers/00000000-0000-4000-8000-00000000c003");
  // Delete asks first, in an action sheet.
  await page.getByRole("button", { name: "Delete Customer" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete Sam Sample?" })
    .getByRole("button", { name: "Delete Customer" })
    .click();
  await expect(
    page.getByText(/^Sam Sample has \d+ open jobs?\. Finish or cancel them first\.$/),
  ).toBeVisible();

  await page.goto(`/customers/${added!.id}`);
  await page.getByRole("button", { name: "Delete Customer" }).click();
  await page
    .getByRole("alertdialog", { name: `Delete ${name}?` })
    .getByRole("button", { name: "Delete Customer" })
    .click();
  await page.waitForURL((url) => url.pathname === "/customers");
  await expect(page.getByText(name)).toHaveCount(0);
});

// Owner request, 2026-10-15: "There is no way to change a homeowner's address."
test("the office edits a customer's contact details and pool address", async ({ page }) => {
  const tech = await signedInClient(TECH.email, TECH.password);
  const { data: job } = await tech
    .from("job")
    .select("company_id")
    .eq("id", "00000000-0000-4000-8000-00000000e001")
    .single();
  const name = `Moving ${RUN}`;
  const { data: added } = await tech
    .from("customer")
    .insert({ company_id: job!.company_id, name })
    .select("id")
    .single();
  await tech.from("property").insert({
    company_id: job!.company_id,
    customer_id: added!.id,
    address_line1: "1 Old Street",
    city: "Phoenix",
    state: "AZ",
  });

  await signIn(page, OWNER, `/customers/${added!.id}`);
  await page.getByRole("button", { name: "Edit Contact Details" }).click();
  const contact = page.getByRole("dialog", { name: "Contact Details" });
  await contact.getByLabel("Phone").fill("(602) 555-0199");
  await contact.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(contact).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: "Phone" })).toContainText(
    "(602) 555-0199",
  );

  await page.getByRole("button", { name: /1 Old Street/ }).click();
  const pool = page.getByRole("dialog", { name: "Pool Details" });
  await pool.getByLabel("Street").fill("2 New Street");
  await pool.getByLabel("ZIP").fill("85004");
  await pool.getByRole("button", { name: "Save" }).click();
  await expect(pool).toHaveCount(0);
  await expect(page.getByRole("button", { name: /2 New Street, Phoenix, AZ 85004/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /2 New Street, Phoenix, AZ 85004/ })).toBeVisible();

  // Tidy up: no jobs, so the customer can go.
  await page.getByRole("button", { name: "Delete Customer" }).click();
  await page
    .getByRole("alertdialog", { name: `Delete ${name}?` })
    .getByRole("button", { name: "Delete Customer" })
    .click();
  await page.waitForURL((url) => url.pathname === "/customers");
});

test("the office adds a job for a new customer, with its checklist ready", async ({ page }) => {
  await signIn(page, OWNER);
  await page.getByRole("link", { name: "New Job" }).click();
  await expect(page.getByRole("heading", { name: "New Job" })).toBeVisible();

  const name = `Web Customer ${RUN}`;
  await page.getByRole("radio", { name: "New", exact: true }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Phone").fill("(480) 555-0199");
  await page.getByLabel("Street address").fill("12 Office Way");
  await page.getByLabel("City").fill("Tempe");
  await page.getByLabel("State").fill("az");
  await page.getByLabel("Has a spa").check();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Date").fill(tomorrow);
  await page.getByLabel("Tech", { exact: true }).selectOption({ label: "Tony Tech" });
  await page.getByLabel("Detection price").selectOption({ index: 1 });
  await expect(page.getByLabel("Detection fee ($)")).not.toHaveValue("");
  await page.getByRole("button", { name: "Create Job" }).click();

  await expect(page.getByRole("heading", { name: /^Job #\d+$/ })).toBeVisible();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(page.getByText("12 Office Way, Tempe, AZ").first()).toBeVisible();
  await expect(page.getByText("Tony Tech").first()).toBeVisible();
  // The checklist is ready for the tech, every item to do.
  await expect(
    page.getByText(/0 not leaking · 0 attention · 0 leaking · 0 not applicable · \d+ to do/),
  ).toBeVisible();
});

test("on a phone: a tab bar moves between sections and nothing scrolls sideways", async ({
  browser,
}) => {
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    // An iPhone's browser: Messages shows the list first on phones.
    userAgent: devices["iPhone 13"].userAgent,
  });
  const page = await phone.newPage();
  await signIn(page, OWNER);
  const tabs = page.getByRole("navigation", { name: "Main" });
  for (const [label, heading] of [
    ["Today", "Today"],
    ["Schedule", "Schedule"],
    ["Messages", "Messages"],
    ["More", "More"],
    ["Jobs", "Jobs"],
  ] as const) {
    await tabs.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  }
  // Customers is under More (owner, 2026-10-18), which stays selected there.
  await tabs.getByRole("link", { name: "More" }).click();
  await page.getByRole("main").getByRole("link", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "More" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Messages" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
  // A tap just beside or below the floating bar lands on the bar's layer, not on the
  // page underneath (the Jobs list's cards run under it).
  const before = page.url();
  await page.touchscreen.tap(4, 844 - 40);
  await page.touchscreen.tap(195, 844 - 4);
  await expect(page).toHaveURL(before);
  // Invoices, the Dashboard, and Settings are under More.
  await tabs.getByRole("link", { name: "More" }).click();
  await page.getByRole("main").getByRole("link", { name: "Invoices" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Invoices" })).toBeVisible();
  await tabs.getByRole("link", { name: "More" }).click();
  await page.getByRole("main").getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "More" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "More" }).click();
  // Phones have no header sun/moon button: More › Appearance switches it.
  const appearance = page.getByRole("radiogroup", { name: "Appearance" });
  await appearance.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await appearance.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // Settings lists its sections; each one's navigation bar goes back to Settings.
  await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: /^Company and Branding/ })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Company and Branding" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await tabs.getByRole("link", { name: "Jobs" }).click();

  // Jobs are rows of a grouped list on a phone; one opens its job.
  await page
    .getByRole("link", { name: /Sam Sample/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /^Job #\d+$/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await phone.close();
});

// M9.5 step 2: a tech works a job from the website on a phone, the same way as in the app.
test("on a phone: a tech starts a job, fills the checklist, and records a test and a pinned finding", async ({
  page,
  browser,
}) => {
  // The whole visit, start to quote: longer than one page test.
  test.setTimeout(300_000);
  // The office books it for Tony Tech.
  await signIn(page, OWNER, "/jobs/new");
  const name = `Phone Work ${RUN}`;
  await page.getByRole("radio", { name: "New", exact: true }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Street address").fill("40 Phone Lane");
  await page.getByLabel("City").fill("Mesa");
  await page.getByLabel("State").fill("AZ");
  await page.getByLabel("Date").fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Tech", { exact: true }).selectOption({ label: "Tony Tech" });
  await page.getByRole("button", { name: "Create Job" }).click();
  await expect(page.getByRole("heading", { name: /^Job #\d+$/ })).toBeVisible();
  const jobUrl = new URL(page.url()).pathname;

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const tech = await phone.newPage();
  await signIn(tech, TECH, jobUrl);
  const wide = () => tech.evaluate(() => document.documentElement.scrollWidth);

  // Start Job.
  await tech.getByRole("button", { name: "Start Job" }).click();
  await expect(tech.getByText("In progress", { exact: true }).first()).toBeVisible();
  await expect(tech.getByRole("button", { name: "Move Back to Scheduled" })).toBeVisible();

  // Checklist: one item leaking with where, the rest marked with the section shortcuts.
  await jobSection(tech, "Checklist");
  const verdict = tech.locator("#part-checklist select[aria-label]").first();
  const itemName = (await verdict.getAttribute("aria-label"))!;
  await verdict.selectOption("leaking");
  await expect(verdict).toHaveValue("leaking");
  const where = tech.getByLabel(`Where: ${itemName}`);
  await where.fill("Under the deck by the steps");
  await where.blur();
  await expect(tech.getByText(/0 not leaking · 0 attention · 1 leaking/)).toBeVisible();
  await tech.reload();
  await expect(tech.getByLabel(`Where: ${itemName}`)).toHaveValue("Under the deck by the steps");
  expect(await wide()).toBeLessThanOrEqual(390);
  await finishChecklist(tech);
  await expect(tech.getByText(/ · 1 leaking · 0 not applicable · 0 to do/)).toBeVisible();

  // A pressure test: the calculator works it out as it's typed.
  await jobSection(tech, "Findings");
  // Add Test opens a sheet; adding closes it.
  await tech.getByRole("button", { name: "Add Test" }).click();
  const addTest = tech.getByRole("dialog", { name: "Add Test" });
  await addTest.getByLabel("Test", { exact: true }).selectOption({ label: "Pressure test" });
  await addTest.getByLabel("Line", { exact: true }).fill(itemName);
  await addTest.getByLabel("Start pressure (PSI)").fill("20");
  await addTest.getByLabel("End pressure (PSI)").fill("12");
  await addTest.getByLabel("Duration (min)").fill("15");
  await expect(addTest.getByText("Dropped 8 PSI in 15 min").first()).toBeVisible();
  await addTest.getByRole("button", { name: "Add Test" }).click();
  await expect(addTest).toBeHidden();
  await expect(tech.getByRole("button", { name: "Edit Pressure test" })).toBeVisible();
  await expect(tech.getByText("Fail", { exact: true })).toBeVisible();

  // A finding, pinned on the pool diagram.
  await tech.getByRole("button", { name: "Add Finding" }).click();
  const addFinding = tech.getByRole("dialog", { name: "Add Finding" });
  await addFinding.getByLabel("What").fill(`Line break ${RUN}`);
  await addFinding.getByLabel("Severity").selectOption({ label: "Major" });
  await addFinding.getByLabel("Where (optional)").fill("Return line under the deck");
  await addFinding.getByTestId("pin-picker").click({ position: { x: 60, y: 40 } });
  await expect(addFinding.getByText("Pin placed.")).toBeVisible();
  await addFinding.getByRole("button", { name: "Add Finding" }).click();
  await expect(addFinding).toBeHidden();
  await expect(tech.getByText(`Line break ${RUN}`, { exact: true })).toBeVisible();
  await expect(tech.getByText(/Major · Open · Pinned on the diagram/)).toBeVisible();
  await expect(tech.getByRole("img", { name: "Pool diagram with 1 finding pins" })).toBeVisible();
  expect(await wide()).toBeLessThanOrEqual(390);

  // A photo from the camera (here, a file), marked up with a circle.
  await jobSection(tech, "Photos");
  await tech.getByLabel("Add Photo").setInputFiles({
    name: "leak.png",
    mimeType: "image/png",
    buffer: solidPng(400, 300, [40, 120, 170]),
  });
  await expect(tech.getByText("Photo added.")).toBeVisible();
  await tech.getByRole("button", { name: /^Mark Up: Photo/ }).click();
  const editor = tech.getByRole("dialog", { name: "Mark Up" });
  await editor.getByTestId("markup-canvas").click({ position: { x: 120, y: 80 } });
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(tech.getByRole("button", { name: /^Edit Markup: Photo/ })).toBeVisible();

  // Wrap-up: the report is written, then the customer reads it on the phone and signs at
  // the bottom; signing finishes it.
  await jobSection(tech, "Wrap-Up");
  const report = tech.getByTestId("report-homeowner");
  await report.getByRole("button", { name: "Write Draft" }).click();
  await expect(report.getByText(/^Draft written\./)).toBeVisible();
  await report.getByRole("button", { name: "Review with Customer" }).click();
  await tech.waitForURL(/\/sign-off\//);
  await expect(tech.getByText(`Line break ${RUN}`).first()).toBeVisible();
  const sign = tech.locator("#sign");
  await expect(sign).toContainText("inspected the pool at 40 Phone Lane");
  await expect(sign.getByLabel("Your name")).toHaveValue(name);
  expect(await wide()).toBeLessThanOrEqual(390);
  const padBox = sign.getByTestId("signature-pad");
  await padBox.scrollIntoViewIfNeeded();
  const pad = await padBox.boundingBox();
  await tech.mouse.move(pad!.x + 30, pad!.y + 100);
  await tech.mouse.down();
  for (const [x, y] of [
    [80, 60],
    [130, 120],
    [180, 50],
    [240, 110],
  ])
    await tech.mouse.move(pad!.x + x, pad!.y + y, { steps: 4 });
  await tech.mouse.up();
  await sign.getByRole("button", { name: "Sign", exact: true }).click();
  await tech.waitForURL(/\/jobs\/[^/]+#wrap-up$/);
  await expect(tech.getByRole("img", { name: `Signature of ${name}` })).toBeVisible();
  await expect(tech.getByText(/Inspection acknowledged ·/)).toBeVisible();

  // The finished version goes out by text, and the customer's page carries the signature.
  const finished = report.getByTestId("finished-report");
  await expect(finished).toContainText("Version 1 is finished");
  await finished.getByRole("button", { name: "Send by Text" }).click();
  await expect(report.getByText("Report sent. Copy the message below.")).toBeVisible();
  const reportHref = await report
    .getByRole("link", { name: /^View version \d+$/ })
    .getAttribute("href");
  const customerPage = await phone.newPage();
  await customerPage.goto(reportHref!);
  await expect(customerPage.getByRole("img", { name: `Signature of ${name}` })).toBeVisible();
  await customerPage.close();

  // A quote built on the phone from the price book and a custom line, then sent.
  await tech.getByRole("button", { name: "Start Quote" }).click();
  const quote = tech.getByTestId("quote");
  await quote.getByLabel("Add from the price book").selectOption({ index: 1 });
  await quote.getByRole("button", { name: "Add Item" }).click();
  await expect(quote.getByTestId("quote-line")).toHaveCount(1);
  await quote.getByLabel("Custom line").fill(`Haul away debris ${RUN}`);
  await quote.getByLabel("Price ($)", { exact: true }).fill("40");
  await quote.getByRole("button", { name: "Add Line" }).click();
  await expect(quote.getByTestId("quote-line")).toHaveCount(2);
  const line = quote.getByRole("listitem", { name: `Haul away debris ${RUN}` });
  await line.getByLabel("Qty").fill("2");
  await line.getByLabel("Qty").blur();
  await expect(line).toContainText("$80.00");
  expect(await wide()).toBeLessThanOrEqual(390);
  await quote.getByRole("button", { name: "Send Quote" }).click();
  await expect(quote.getByLabel("Customer link")).toHaveValue(/\/q\//);
  await expect(quote).toContainText("Sent");

  await jobSection(tech, "Details");
  await tech.getByLabel("Job notes").fill("Gate code 1234 worked.");
  await tech.getByLabel("Leak location marked").check();
  const onSite = tech.locator("form").filter({ has: tech.getByLabel("Job notes") });
  await onSite.getByRole("button", { name: "Save" }).click();
  await expect(onSite.getByText("Saved.")).toBeVisible();
  await phone.close();
});

// Owner, 2026-10-18: "a reports tab under JOBS - that just shows you reports".
test("Jobs has a Reports tab listing the reports", async ({ page }) => {
  await signIn(page, OWNER, "/jobs");
  const tabs = page.getByRole("navigation", { name: "Jobs and Reports" });
  await tabs.getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("navigation", { name: "Filter reports" })
    .getByRole("link", { name: "Drafts" })
    .click();
  await expect(page).toHaveURL(/status=draft/);
  await tabs.getByRole("link", { name: "Jobs" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
});

// Owner, 2026-10-18: "allow you to sort customers by a variety of filters".
test("customers sort and filter", async ({ page }) => {
  await signIn(page, OWNER, "/customers");
  const names = page.getByRole("main").getByRole("listitem").locator(".font-semibold");
  await expect(names.first()).toBeVisible();
  await page.getByLabel("Sort").selectOption("name_desc");
  await expect(page).toHaveURL(/sort=name_desc/);
  await expect(page.getByLabel("Sort")).toHaveValue("name_desc");
  // Read the list once the sorted page has rendered.
  await expect.poll(async () => (await names.allInnerTexts()).length).toBeGreaterThan(1);
  const all = await names.allInnerTexts();
  expect(all[0]!.localeCompare(all.at(-1)!)).toBeGreaterThanOrEqual(0);
  await page.getByLabel("Show").selectOption("pool_company");
  await expect(page).toHaveURL(/show=pool_company/);
  await expect(page.getByLabel("Sort")).toHaveValue("name_desc");
});

// Owner, Admin, Tech (owner, 2026-10-18): an owner invites an admin, who runs the office
// (the price book) but not the owner-only items (Sundeck Pro billing, payments setup).
test("an owner invites an admin, who edits the price book but not billing or payments setup", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const email = `e2e-admin-${RUN}@demo.leakbook.test`;
  await signIn(page, OWNER, "/settings/team");
  await page.getByRole("button", { name: "Invite Someone", exact: true }).click();
  const invite = page.getByRole("dialog", { name: "Invite Someone" });
  await invite.getByLabel("Email").fill(email);
  await invite.getByRole("radio", { name: "Admin" }).click();
  await invite.getByRole("button", { name: "Create Invite" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Invite created for ${email}` }),
  ).toBeVisible();
  const card = page.getByTestId("invite").filter({ hasText: email });
  await expect(card).toContainText("Admin");
  await card.getByRole("button").click();
  const link = await page
    .getByRole("dialog", { name: email })
    .getByLabel("Invite link")
    .inputValue();

  const guest = await browser.newContext();
  const admin = await guest.newPage();
  await admin.goto(new URL(link).pathname);
  await expect(admin.getByText(/invited you to Sundeck Pro as an admin/)).toBeVisible();
  await admin.getByLabel("Your name").fill("E2E Admin");
  await admin.getByLabel("Choose a password").fill("e2e-password-123");
  await admin.getByRole("button", { name: "Create Account and Join" }).click();
  await admin.waitForURL((url) => url.pathname !== new URL(link).pathname);

  // Runs the office: the price book.
  await admin.goto("/settings/price-book");
  await expect(admin.getByRole("button", { name: "Add Item" }).first()).toBeVisible();
  // Not the owner's: billing and payments setup.
  await admin.goto("/settings/billing");
  await expect(admin.getByText("Only the shop owner can do this.")).toBeVisible();
  await expect(admin.getByRole("button", { name: "Manage Billing" })).toHaveCount(0);
  await admin.goto("/settings/payments");
  await expect(
    admin.getByRole("button", { name: /Set Up Payments|Continue Stripe Setup/ }),
  ).toHaveCount(0);
  // Admins invite techs only.
  await admin.goto("/settings/team");
  await admin.getByRole("button", { name: "Invite Someone", exact: true }).click();
  await expect(
    admin.getByRole("dialog", { name: "Invite Someone" }).getByRole("radio", { name: "Admin" }),
  ).toHaveCount(0);
  await guest.close();

  // The owner turns the test admin off again (keeps reruns tidy).
  await page.reload();
  const person = page.locator("li").filter({ hasText: email });
  await expect(person).toContainText("Admin");
  await person.getByRole("button").click();
  const member = page.getByRole("dialog", { name: "E2E Admin" });
  await member.getByLabel("Access").selectOption("disabled");
  await member.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
});
