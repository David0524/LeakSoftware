import { expect, test } from "@playwright/test";
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find it");
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fjobs/);

  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don’t match" })).toBeVisible();
});

test("signing in opens Today", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/today");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
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
  await page.goto("/jobs?status=all&q=Sam%20Sample");
  const row = page.getByRole("row").filter({ hasText: "Sam Sample" });
  await row.getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: /^Job #\d+/ })).toBeVisible();
  await expect(page.getByText("7408 E Osborn Rd, Scottsdale, AZ 85251").first()).toBeVisible();

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
  await expect(tech.getByText(/invited you to Tidemark as a tech/)).toBeVisible();
  await tech.getByLabel("Your name").fill("E2E Tech");
  await tech.getByLabel("Choose a password").fill("e2e-password-123");
  await tech.getByRole("button", { name: "Create Account and Join" }).click();
  await tech.waitForURL("**/today");
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
  await expect(page.getByRole("img", { name: "Tidemark" }).first()).toBeVisible();

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
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete Customer" }).click();
  await expect(
    page.getByText(/^Sam Sample has \d+ open jobs?\. Finish or cancel them first\.$/),
  ).toBeVisible();

  await page.goto(`/customers/${added!.id}`);
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete Customer" }).click();
  await page.waitForURL((url) => url.pathname === "/customers");
  await expect(page.getByText(name)).toHaveCount(0);
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
  });
  const page = await phone.newPage();
  await signIn(page, OWNER);
  const tabs = page.getByRole("navigation", { name: "Main" });
  for (const [label, heading] of [
    ["Today", "Today"],
    ["Schedule", "Schedule"],
    ["Customers", "Customers"],
    ["More", "More"],
    ["Jobs", "Jobs"],
  ] as const) {
    await tabs.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  }
  // A tap just beside or below the floating bar lands on the bar's layer, not on the
  // page underneath (the Jobs list's cards run under it).
  const before = page.url();
  await page.touchscreen.tap(4, 844 - 40);
  await page.touchscreen.tap(195, 844 - 4);
  await expect(page).toHaveURL(before);
  // Invoices, Warranties, and Settings are under More.
  await tabs.getByRole("link", { name: "More" }).click();
  await page.getByRole("main").getByRole("link", { name: "Invoices" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Invoices" })).toBeVisible();
  await tabs.getByRole("link", { name: "More" }).click();
  await page.getByRole("link", { name: "Warranties" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Warranties" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "More" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "More" }).click();
  await page.getByRole("main").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Company and Branding" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await tabs.getByRole("link", { name: "Jobs" }).click();

  // Jobs are cards on a phone; one opens its job.
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
  await tech.getByRole("button", { name: "Add Test" }).click();
  await tech.getByLabel("Test", { exact: true }).selectOption({ label: "Pressure test" });
  await tech.getByLabel("Line", { exact: true }).fill(itemName);
  await tech.getByLabel("Start pressure (PSI)").fill("20");
  await tech.getByLabel("End pressure (PSI)").fill("12");
  await tech.getByLabel("Duration (min)").fill("15");
  await expect(tech.getByText("Dropped 8 PSI in 15 min").first()).toBeVisible();
  await tech.locator("form").getByRole("button", { name: "Add Test" }).click();
  await expect(tech.getByRole("button", { name: "Edit Pressure test" })).toBeVisible();
  await expect(tech.getByText("Fail", { exact: true })).toBeVisible();

  // A finding, pinned on the pool diagram.
  await tech.getByRole("button", { name: "Add Finding" }).click();
  await tech.getByLabel("What").fill(`Line break ${RUN}`);
  await tech.getByLabel("Severity").selectOption({ label: "Major" });
  await tech.getByLabel("Where (optional)").fill("Return line under the deck");
  await tech.getByTestId("pin-picker").click({ position: { x: 60, y: 40 } });
  await expect(tech.getByText("Pin placed.")).toBeVisible();
  await tech.locator("form").getByRole("button", { name: "Add Finding" }).click();
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
