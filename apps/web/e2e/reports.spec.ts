import { expect, test, type Page } from "@playwright/test";
import { OWNER, RUN, openChecklist, sendUnsigned, signIn, wrapUpStep } from "./helpers";
import { adminClient } from "./backend";
import { lastEmailTo } from "./outbox";

// M7 "Done when": both templates as a web page and a PDF on the sample job, and the email a
// customer gets has a link that opens.

test.describe.configure({ mode: "serial" });

async function openSampleJob(page: Page, customer = "Sam Sample", signedIn = false) {
  if (!signedIn) await signIn(page, OWNER);
  await page.goto(`/jobs?status=all&q=${encodeURIComponent(customer)}`);
  await page.getByRole("row").filter({ hasText: customer }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "Wrap-Up" })).toBeVisible();
}

async function writeDraft(page: Page, template: "homeowner" | "partner") {
  // The report opens from Wrap-Up's finish list, in a sheet (owner, 2026-10-22).
  await wrapUpStep(page, "Report");
  const panel = page.getByTestId(`report-${template}`);
  // Writing again over an existing draft asks first, in an action sheet (reruns against a
  // shared database).
  const again = (await panel.getByRole("button", { name: "Write the Draft Again" }).count()) > 0;
  await panel.getByRole("button", { name: /^Write (Draft|the Draft Again)$/ }).click();
  if (again)
    await page.getByRole("alertdialog").getByRole("button", { name: "Replace Draft" }).click();
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
  // The text saves by itself a second after typing stops (owner, 2026-10-20: no Save Text).
  await expect(panel.getByText("Saved", { exact: true })).toBeVisible();

  // The text folds away under Report Text and comes back with the edits still there, also
  // after a reload.
  const reportText = panel.getByRole("button", { name: "Report Text" });
  await reportText.click();
  await expect(summary).toBeHidden();
  await page.reload();
  await wrapUpStep(page, "Report");
  await panel.getByRole("button", { name: "Report Text" }).click();
  await expect(summary).toHaveValue(new RegExp(note.replace(/[.]/g, "\\.")));

  const to = `customer-${RUN}@example.com`;
  const unsigned = panel.getByTestId("send-unsigned");
  await unsigned.getByText("Send Without a Signature").click();
  await unsigned.getByLabel("Customer email").fill(to);
  await unsigned.getByRole("button", { name: "Send by Email" }).click();
  await expect(panel.getByText(`Sent to ${to}.`)).toBeVisible();

  await expect.poll(() => lastEmailTo(to)).not.toBeNull();
  const email = (await lastEmailTo(to))!;
  expect(email.subject).toContain("Your leak detection report from");
  expect(email.attachments[0]?.bytes ?? 0).toBeGreaterThan(10_000);
  const link = email.text.match(/https?:\/\/\S+\/r\/([a-f0-9]+)/);
  expect(link).not.toBeNull();
  const token = link![1]!;

  // The customer opens the link signed out.
  const admin = adminClient();
  const viewsOf = async () =>
    (await admin!.from("share_link").select("view_count").eq("token", token).single()).data
      ?.view_count as number;
  const before = admin ? await viewsOf() : 0;
  await page.context().clearCookies();
  await page.goto(`/r/${token}`);
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  // The browser tab names the report (owner, 2026-10-22), and naming it doesn't open the link
  // twice: the page and the title share one lookup, so one visit counts one view.
  await expect(page).toHaveTitle(/Leak Detection Report/);
  if (admin) expect(await viewsOf()).toBe(before + 1);
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByText("Return 3 line break").first()).toBeVisible();
  await expect(page.getByText("Not applicable", { exact: true })).toBeVisible();
  await expect(page.getByText(/No diver on site/).first()).toBeVisible();
  await expect(page.getByText("Powered by Sundeck Pro")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
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

  await page.goto("/jobs?status=all&q=Riley%20Rivera");
  await page.getByRole("row").filter({ hasText: "Riley Rivera" }).getByRole("link").first().click();
  // The second tech: the "With" row in Assigned To shows their name.
  await expect(
    page
      .getByRole("listitem")
      .filter({ has: page.getByText("With", { exact: true }) })
      .filter({ hasText: "Dana Owner" }),
  ).toBeVisible();
  await expect(page.getByText("$649.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Pool water level dropping")).toBeVisible();
  await openChecklist(page);
  await expect(
    page
      .getByRole("radiogroup", { name: "Skimmer seam", exact: true })
      .getByRole("radio", { name: "Leaking", exact: true }),
  ).toHaveAttribute("aria-checked", "true");

  const panel = await writeDraft(page, "homeowner");
  await sendUnsigned(panel, "Send by Text");
  await expect(panel.getByText("Report sent. Copy the message below.")).toBeVisible();
  const href = await panel.getByRole("link", { name: /^View version \d+$/ }).getAttribute("href");
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
