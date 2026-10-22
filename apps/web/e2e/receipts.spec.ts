import { expect, test, type Page } from "@playwright/test";
import { adminClient, signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn, wrapUpStep } from "./helpers";
import { lastEmailTo } from "./outbox";
import { PHONE, SAMPLE_JOB } from "./money";

// Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check"): a check
// recorded with its number offers Send Receipt at once and the email lands with the payment, the
// total, and what's left; the customer's page shows the check and the balance; cash pays the
// rest, Not Now, then Send Receipt again from the invoice. Activity records each send. Techs
// record payments too (owner, 2026-10-22: "Techs should be able to record payments"; needs
// 20261022001800_tech_payments.sql).

test.describe.configure({ mode: "serial" });

const SCREENS = process.env.E2E_SCREENSHOTS;
const TO = `receipt-${RUN}@example.com`;

async function sentInvoiceJob(assignedUserId: string | null = null) {
  const admin = adminClient()!;
  const { data: sample } = await admin
    .from("job")
    .select("company_id, property_id, bill_to_customer_id")
    .eq("id", SAMPLE_JOB)
    .single();
  const { data: job, error } = await admin
    .from("job")
    .insert({
      company_id: sample!.company_id,
      property_id: sample!.property_id,
      bill_to_customer_id: sample!.bill_to_customer_id,
      type: "detection",
      status: "in_progress",
      fee_cents: 64_900,
      assigned_user_id: assignedUserId,
    })
    .select("id")
    .single();
  if (error) throw error;
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: invoiceId, error: e1 } = await owner.rpc("create_invoice", { target_job: job!.id });
  if (e1) throw e1;
  const { data: sent, error: e2 } = await owner.rpc("send_invoice", { target_invoice: invoiceId });
  if (e2) throw e2;
  return { jobId: job!.id as string, token: (sent as { token: string }).token };
}

async function openInvoice(page: Page, jobId: string) {
  await page.goto(`/jobs/${jobId}`);
  await wrapUpStep(page, "Invoice");
  return page.getByTestId("invoice");
}

test("a check recorded with its number sends a receipt with the balance left", async ({
  page,
  browser,
}) => {
  test.skip(
    !adminClient(),
    "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).",
  );
  const { jobId, token } = await sentInvoiceJob();
  await signIn(page, OWNER, `/jobs/${jobId}`);
  let panel = await openInvoice(page, jobId);

  // Record Payment: $200 by check #1234.
  const form = panel.getByTestId("record-payment");
  await form.getByLabel("Amount received ($)").fill("200");
  await form.getByRole("radio", { name: "Check" }).click();
  await form.getByLabel("Check number").fill("#1234");
  await form.getByRole("button", { name: "Record Payment" }).click();

  // Send Receipt opens at once, filled in and saying what was recorded.
  const sheet = page.getByRole("dialog", { name: "Send Receipt" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Payment recorded. Send the customer a receipt?");
  await expect(sheet).toContainText("$200.00 · Check #1234 · Balance remaining $449.00");
  await sheet.getByLabel("Customer email").fill(TO);
  if (SCREENS) await page.screenshot({ path: `${SCREENS}/receipt-sheet-desktop.png` });
  await sheet.getByRole("button", { name: "Send Receipt" }).click();
  await expect(page.getByText(`Receipt emailed to ${TO}.`)).toBeVisible();
  await expect(sheet).toHaveCount(0);

  const email = await lastEmailTo(TO);
  expect(email!.subject).toBe("Receipt from Demo Leak Co.");
  for (const line of [
    "Method: Check #1234",
    "Amount paid: $200.00",
    "Invoice total: $649.00",
    "Balance remaining: $449.00",
    `/i/${token}`,
  ])
    expect(email!.text).toContain(line);

  // The customer's page on a phone: the check, and what's left to pay.
  const phone = await browser.newContext(PHONE);
  const customer = await phone.newPage();
  await customer.goto(`/i/${token}`);
  await expect(customer.getByText(/^Check #1234, /)).toBeVisible();
  await expect(customer.getByTestId("payment-received")).toContainText(
    "Thank you for your payment of $200.00 (Check #1234",
  );
  await expect(customer.getByTestId("payment-received")).toContainText(
    "The balance due is $449.00.",
  );
  if (SCREENS)
    await customer.screenshot({ path: `${SCREENS}/receipt-page-phone.png`, fullPage: true });
  await phone.close();

  // Cash for the rest: Paid in full; Not Now, then Send Receipt from the invoice.
  panel = await openInvoice(page, jobId);
  await panel.getByTestId("record-payment").getByLabel("Amount received ($)").fill("449");
  await panel.getByTestId("record-payment").getByRole("button", { name: "Record Payment" }).click();
  await expect(sheet).toContainText("Paid in full. Send the customer a receipt?");
  await sheet.getByRole("button", { name: "Not Now" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(panel).toContainText("Paid");
  await panel.getByRole("button", { name: "Send Receipt" }).click();
  await expect(sheet).toContainText("$449.00 · Cash · Paid in full");
  await sheet.getByLabel("Customer email").fill(TO);
  await sheet.getByRole("button", { name: "Send Receipt" }).click();
  await expect(page.getByText(`Receipt emailed to ${TO}.`)).toBeVisible();
  await expect
    .poll(async () => (await lastEmailTo(TO))?.text.includes("Method: Cash") ?? false)
    .toBe(true);
  expect((await lastEmailTo(TO))!.text).toContain("Balance: Paid in full");

  // Activity: who sent each, and how.
  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: me } = await owner.auth.getUser();
  const { data: sends } = await owner
    .from("activity")
    .select("kind, amount_cents, preview, actor_id")
    .eq("job_id", jobId)
    .eq("kind", "receipt_sent")
    .order("created_at");
  expect(sends).toEqual([
    { kind: "receipt_sent", amount_cents: 20_000, preview: "email", actor_id: me.user!.id },
    { kind: "receipt_sent", amount_cents: 44_900, preview: "email", actor_id: me.user!.id },
  ]);
});

test("Record Payment and Send Receipt on a phone", async ({ browser }) => {
  test.skip(
    !adminClient(),
    "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).",
  );
  const { jobId } = await sentInvoiceJob();
  const phone = await browser.newContext(PHONE);
  const page = await phone.newPage();
  await signIn(page, OWNER, `/jobs/${jobId}`);
  const panel = await openInvoice(page, jobId);
  const form = panel.getByTestId("record-payment");
  await form.getByLabel("Amount received ($)").fill("100");
  await form.getByRole("radio", { name: "Check" }).click();
  await form.getByLabel("Check number").fill("5521");
  if (SCREENS) await page.screenshot({ path: `${SCREENS}/record-payment-phone.png` });
  await form.getByRole("button", { name: "Record Payment" }).click();
  const sheet = page.getByRole("dialog", { name: "Send Receipt" });
  await expect(sheet).toContainText("$100.00 · Check #5521 · Balance remaining $549.00");
  if (SCREENS) await page.screenshot({ path: `${SCREENS}/receipt-sheet-phone.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await sheet.getByRole("button", { name: "Not Now" }).click();
  await expect(panel.getByRole("button", { name: "Send Receipt" })).toBeVisible();
  await phone.close();
});

test("a tech records cash on their own job, then Send Receipt; no Void", async ({ browser }) => {
  test.skip(
    !adminClient(),
    "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).",
  );
  const tech = await signedInClient(TECH.email, TECH.password);
  const { data: me } = await tech.auth.getUser();
  const { jobId } = await sentInvoiceJob(me.user!.id);
  const phone = await browser.newContext(PHONE);
  const page = await phone.newPage();
  await signIn(page, TECH, `/jobs/${jobId}`);
  const panel = await openInvoice(page, jobId);
  await expect(panel.getByRole("button", { name: "Void Invoice" })).toHaveCount(0);
  const form = panel.getByTestId("record-payment");
  await form.getByLabel("Amount received ($)").fill("150");
  await expect(form.getByRole("radio", { name: "Cash" })).toBeChecked();
  if (SCREENS) await page.screenshot({ path: `${SCREENS}/record-payment-tech-phone.png` });
  await form.getByRole("button", { name: "Record Payment" }).click();
  const sheet = page.getByRole("dialog", { name: "Send Receipt" });
  await expect(sheet).toContainText("Payment recorded. Send the customer a receipt?");
  await expect(sheet).toContainText("$150.00 · Cash · Balance remaining $499.00");
  if (SCREENS) await page.screenshot({ path: `${SCREENS}/receipt-sheet-tech-phone.png` });
  await sheet.getByRole("button", { name: "Not Now" }).click();
  await expect(panel).toContainText("Partly paid");
  await expect(panel.getByRole("button", { name: "Send Receipt" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Void Invoice" })).toHaveCount(0);
  await phone.close();
});
