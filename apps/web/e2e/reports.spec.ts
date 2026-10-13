import { expect, test, type Page } from "@playwright/test";
import { OWNER, RUN, signIn } from "./helpers";
import { lastEmailTo } from "./outbox";

// M7 "Done when": both templates as a web page and a PDF on the sample job, and the email a
// customer gets has a link that opens. Without ANTHROPIC_API_KEY the draft is the plain one.

test.describe.configure({ mode: "serial" });

async function openSampleJob(page: Page, customer = "Sam Sample") {
  await signIn(page, OWNER);
  await page.goto("/jobs?status=all");
  await page.getByRole("row").filter({ hasText: customer }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
}

async function writeDraft(page: Page, template: "homeowner" | "partner") {
  const panel = page.getByTestId(`report-${template}`);
  // Writing again over an existing draft asks first (reruns against a shared database).
  page.once("dialog", (d) => void d.accept());
  await panel.getByRole("button", { name: /^Write (Draft|the Draft Again)$/ }).click();
  await expect(panel.getByText(/^Draft written\./)).toBeVisible();
  await expect(panel.getByLabel("Summary", { exact: true })).not.toHaveValue("");
  return panel;
}

async function expectPdf(page: Page, token: string) {
  const res = await page.request.get(`/r/${token}/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const body = await res.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.length).toBeGreaterThan(10_000);
}

test("homeowner report: draft, edit, email, and the customer's link", async ({ page }) => {
  await openSampleJob(page);
  const panel = await writeDraft(page, "homeowner");

  const note = `Checked by the e2e run ${RUN}.`;
  const summary = panel.getByLabel("Summary", { exact: true });
  await summary.fill(`${await summary.inputValue()}\n\n${note}`);
  await panel.getByRole("button", { name: "Save Text" }).click();
  await expect(panel.getByText("Saved.", { exact: true })).toBeVisible();

  const to = `customer-${RUN}@example.com`;
  await panel.getByLabel("Customer email").fill(to);
  await panel.getByRole("button", { name: "Send by Email" }).click();
  await expect(panel.getByText(`Sent to ${to}.`)).toBeVisible();

  await expect.poll(() => lastEmailTo(to)).not.toBeNull();
  const email = (await lastEmailTo(to))!;
  expect(email.subject).toContain("Your leak detection report from");
  expect(email.attachments[0]?.bytes ?? 0).toBeGreaterThan(10_000);
  const link = email.text.match(/https?:\/\/\S+\/r\/([a-f0-9]+)/);
  expect(link).not.toBeNull();
  const token = link![1]!;

  // The customer opens the link signed out.
  await page.context().clearCookies();
  await page.goto(`/r/${token}`);
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByText("Return 3 line break").first()).toBeVisible();
  await expect(page.getByText("Not applicable", { exact: true })).toBeVisible();
  await expect(page.getByText(/No diver on site/).first()).toBeVisible();
  await expect(page.getByText("Powered by Tidemark")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await expectPdf(page, token);
});

test("partner report: draft, send by text, technical page and PDF", async ({ page }) => {
  await openSampleJob(page);
  const panel = await writeDraft(page, "partner");
  await panel.getByRole("button", { name: "Send by Text" }).click();
  await expect(panel.getByText("Report sent. Copy the message below.")).toBeVisible();

  const sentLink = panel.getByRole("link", { name: /^View sent version \d+$/ });
  await expect(sentLink).toBeVisible();
  const href = await sentLink.getAttribute("href");
  const token = href!.split("/").pop()!;

  await page.context().clearCookies();
  await page.goto(`/r/${token}`);
  await expect(page.getByText("Leak Detection Report (Technical)")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Pressure");
  await expect(page.getByText("Not applicable", { exact: true })).toBeVisible();
  await expectPdf(page, token);
});

// M8.5 "Done when": the job entered the partner's way (two techs, 27 items, a leak repaired
// on site) gives a report with the counts, every item's verdict, the fee, and the disclaimer,
// as a web page and a PDF.
test("field parity report: counts, verdicts, fee, and disclaimer", async ({ page }) => {
  await signIn(page, OWNER, "/settings/company");
  const terms = `Sample terms for the e2e run ${RUN}. Our liability is limited to the fee paid.`;
  await page.getByLabel("Disclaimer").fill(terms);
  const termsForm = page.locator("form").filter({ has: page.getByLabel("Disclaimer") });
  await termsForm.getByRole("button", { name: "Save" }).click();
  await expect(termsForm.getByText("Saved.", { exact: true })).toBeVisible();

  await page.goto("/jobs?status=all");
  await page.getByRole("row").filter({ hasText: "Riley Rivera" }).getByRole("link").first().click();
  await expect(page.getByText("With Dana Owner")).toBeVisible();
  await expect(page.getByText("$649.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Pool water level dropping")).toBeVisible();
  await expect(
    page
      .getByRole("radiogroup", { name: "Skimmer seam", exact: true })
      .getByRole("radio", { name: "Leaking", exact: true }),
  ).toHaveAttribute("aria-checked", "true");

  const panel = await writeDraft(page, "homeowner");
  await panel.getByRole("button", { name: "Send by Text" }).click();
  await expect(panel.getByText("Report sent. Copy the message below.")).toBeVisible();
  const href = await panel
    .getByRole("link", { name: /^View sent version \d+$/ })
    .getAttribute("href");
  const token = href!.split("/").pop()!;

  await page.context().clearCookies();
  for (const url of [`/r/${token}`, `/r/${token}?print=1`]) {
    await page.goto(url);
    const tiles = page.locator(".report-tally");
    const tile = (label: string) => tiles.getByText(label, { exact: true }).locator("..");
    await expect(tile("Items Pass")).toContainText("23");
    await expect(tile("Needs Attention")).toContainText("1");
    await expect(tile("Leaking")).toContainText("1");
    for (const section of ["Visual Leak Inspection", "Plumbing Static Test", "Bond Beam"]) {
      await expect(page.getByRole("heading", { name: section })).toBeVisible();
    }
    const items = page.locator(".report-checklist").getByRole("listitem");
    await expect(items).toHaveCount(27);
    const row = (label: string) => items.filter({ hasText: label });
    await expect(row("Skimmer seam")).toContainText("Leaking");
    await expect(row("Skimmer seam")).toContainText("Seam at the skimmer throat");
    await expect(row("Autofill EQ line")).toContainText("Not leaking");
    await expect(row("If vinyl, is vinyl stretched?")).toContainText("Not applicable");
    await expect(page.locator("p").filter({ hasText: "Leaks noted:" })).toContainText(
      "Skimmer seam (Seam at the skimmer throat)",
    );
    await expect(page.getByRole("listitem").filter({ hasText: "Skimmer seam leak" })).toContainText(
      "Repaired on site",
    );
    await expect(page.getByText("Tony Tech and Dana Owner")).toBeVisible();
    await expect(page.getByText("$649.00")).toBeVisible();
    await expect(page.getByText(terms)).toBeVisible();
  }
  await expectPdf(page, token);
});
