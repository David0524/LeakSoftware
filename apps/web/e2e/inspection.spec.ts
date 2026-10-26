import { expect, test } from "@playwright/test";
import { OWNER, RUN, jobSection, sendUnsigned, signIn, wrapUpStep } from "./helpers";

// Pool Inspection (owner, 2026-10-20; docs/plans/pool-inspection.md): from New Job to a sent
// Pool Inspection Report, on the website.

test("a pool inspection: New Job, answers and gates, and its report", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const name = `Inspection Buyer ${RUN}`;

  await signIn(page, OWNER, "/jobs/new");
  await page.getByRole("radio", { name: "New", exact: true }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Street address").fill("1201 N Galvin Pkwy");
  await page.getByLabel("City").fill("Phoenix");
  await page.getByLabel("State", { exact: true }).fill("AZ");
  await page.getByRole("radio", { name: "Inspection", exact: true }).click();
  // The price book's Pool inspection price, and the inspection's own booking questions.
  await expect(page.getByLabel("Price ($)")).toHaveValue("495.00");
  await expect(page.getByText("Why they called")).toHaveCount(0);
  await page.getByLabel("If it is a real estate deal, it is for the:").selectOption("Buyer");
  await page.getByText("Spa", { exact: true }).click();
  await page.getByText("Deck Jets", { exact: true }).click();
  await page.getByLabel("Date").fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Tech", { exact: true }).selectOption({ label: "Tony Tech" });
  await page.getByRole("button", { name: "Create Job" }).click();

  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("Pool inspection", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Spa, Deck Jets")).toBeVisible();
  // The job page shows one tab at a time on every screen (owner, 2026-10-22).
  await jobSection(page, "Checklist");
  // The whole checklist's line, then each section's.
  await expect(page.getByText(/^0 of \d+ answered$/).first()).toBeVisible();

  // On a phone each question is one line (owner, 2026-10-22): Yes and No as icons, and a
  // question whose answers have no clear icons as one pill that opens a menu.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const tech = await phone.newPage();
  await signIn(tech, OWNER, new URL(page.url()).pathname);
  await jobSection(tech, "Checklist");
  const icons = tech.getByRole("group", { name: "Does the system show visible leaking?" });
  await expect(icons.getByRole("button", { name: "Yes", exact: true })).toBeVisible();
  await expect(icons.getByRole("button", { name: "No", exact: true })).toBeVisible();
  const pill = tech.getByRole("button", {
    name: "What type of filtration system is present?, To Do",
  });
  await expect(pill).toHaveText(/Choose/);
  // A scroll under an open menu closes it (scrolling the pill clear of the Start Job bar can),
  // so open it and choose in one step, again if the menu closed in between.
  const choose = (button: typeof pill, role: "menuitem" | "menuitemradio", name: string) =>
    expect(async () => {
      if (!(await tech.getByRole("menu").isVisible())) await button.click();
      await tech.getByRole(role, { name }).click({ timeout: 2_000 });
    }).toPass();
  await choose(pill, "menuitemradio", "Cartridge");
  const chosen = tech.getByRole("button", {
    name: "What type of filtration system is present?, Cartridge",
  });
  await expect(chosen).toBeVisible();
  // Not Done puts it back, so the rest of this test starts from nothing answered.
  await choose(chosen, "menuitem", "Not Done");
  await expect(pill).toBeVisible();
  expect(await tech.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await phone.close();
  await page.reload();
  // The whole checklist's line, then each section's.
  await expect(page.getByText(/^0 of \d+ answered$/).first()).toBeVisible();

  // Equipment opens first; a flagged answer counts as needing attention.
  const leaking = page.getByRole("radiogroup", { name: "Does the system show visible leaking?" });
  await leaking.getByRole("radio", { name: "Yes", exact: true }).click();
  await expect(leaking.getByRole("radio", { name: "Yes", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page
    .getByRole("button", { name: "Describe: Does the system show visible leaking?" })
    .click();
  const describe = page.getByRole("textbox", {
    name: "Describe: Does the system show visible leaking?",
  });
  await describe.fill("Drip at the filter union");
  await describe.blur();
  await expect(page.getByText(/· 1 needs attention$/)).toBeVisible();

  // No on a gate folds its group away.
  await page.getByRole("button", { name: "Fencing and Child Barriers" }).click();
  await expect(page.getByText("FOR ANY UNKNOWN GAS ISSUES", { exact: false })).toHaveCount(0);
  await expect(
    page.getByText(
      "DUE TO ACCIDENTS AND INJURIES, INFORM CUSTOMER THAT CHILD PROOF BARRIERS MUST BE INSTALLED",
    ),
  ).toBeVisible();
  const fence = page.getByRole("radiogroup", { name: "Is a perimeter fence present?" });
  await fence.getByRole("radio", { name: "No", exact: true }).click();
  await expect(page.getByText("Not present: 5 questions folded away.")).toBeVisible();
  await expect(
    page.getByRole("radiogroup", { name: "Are all gates self closing and self latching?" }),
  ).toHaveCount(0);

  // Plumbing: a leak.
  await page.getByRole("button", { name: "Plumbing Static Test" }).click();
  await page
    .getByRole("radiogroup", { name: "Main drain", exact: true })
    .getByRole("radio", { name: "Leaking", exact: true })
    .click();
  await expect(page.getByText(/· 1 needs attention · 1 leaking$/)).toBeVisible();

  // The report: Write Draft from the answers, then send.
  await wrapUpStep(page, "Report");
  const panel = page.getByTestId("report-homeowner");
  await expect(panel.getByText("Pool Inspection Report")).toBeVisible();
  await panel.getByRole("button", { name: "Write Draft" }).click();
  await expect(panel.getByText(/^Draft written\./)).toBeVisible();
  await expect(panel.getByLabel("Summary", { exact: true })).toHaveValue(
    /2 items need attention, 1 of them leaking\./,
  );
  await sendUnsigned(panel, "Send by Text");
  await expect(panel.getByText("Report sent. Copy the message below.")).toBeVisible();
  const href = await panel.getByRole("link", { name: /^View version \d+$/ }).getAttribute("href");
  const token = href!.split("/").pop()!;

  await page.context().clearCookies();
  await page.goto(`/r/${token}`);
  await expect(page.getByRole("heading", { name: "Pool Inspection Report" })).toBeVisible();
  const attention = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Needs attention" }) });
  await expect(attention.getByRole("listitem").first()).toContainText("Main drain");
  await expect(attention).toContainText("Drip at the filter union");
  await expect(page.getByText("Fencing · Not present")).toBeVisible();
  // The form's banners, word for word, as the report's recommendations.
  await expect(
    page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Recommendations" }) })
      .getByRole("listitem")
      .filter({
        hasText:
          "DUE TO ACCIDENTS AND INJURIES, INFORM CUSTOMER THAT CHILD PROOF BARRIERS MUST BE INSTALLED",
      }),
  ).toBeVisible();
  await expect(page.getByText("$495.00").first()).toBeVisible();
});
