import { expect, test } from "@playwright/test";
import { adminClient, signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";
import { lastEmailTo } from "./outbox";
import { PHONE, draftQuote, sendFromOffice, sessionEvent, webhook } from "./money";

// M9 "Done when" (the handoff's definition of done, web part): a quote accepted and its
// deposit paid, the repair invoiced with the deposit credited, a check recorded by the office,
// the rest paid online, the job paid, a receipt. Then a detection fee invoiced from the
// phone's API and voided, and the CSV export. Stripe itself is not called: the tests send the
// signed events Stripe would send. docs/testing/M9-checklist.md covers the device steps.

test.describe.configure({ mode: "serial" });

const PARTNER_JOB = "00000000-0000-4000-8000-00000000e002";

test("a repair is invoiced with its deposit credited, paid by check and card, with a receipt", async ({
  page,
  browser,
  request,
}) => {
  const admin = adminClient();
  test.skip(!admin, "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).");

  // The quote: sent, accepted on a phone, and its $425.00 deposit paid by card.
  const quote = await draftQuote([["Repair skimmer line", 85_000, 12]]);
  await admin!
    .from("stripe_account")
    .upsert(
      { company_id: quote.company_id, stripe_account_id: "acct_e2e_demo", charges_enabled: true },
      { onConflict: "company_id" },
    );
  const quoteLink = await sendFromOffice(page, quote.number);
  const phone = await browser.newContext(PHONE);
  const customer = await phone.newPage();
  await customer.goto(quoteLink);
  await customer.getByLabel("Your name").fill("Sam Sample");
  await customer.getByLabel(/I accept this quote/).check();
  await customer.getByRole("button", { name: "Accept Quote" }).click();
  await expect(customer.getByRole("button", { name: "Pay $425.00 Deposit" })).toBeVisible();
  await webhook(
    request,
    sessionEvent(
      `evt_dep_${RUN}`,
      "checkout.session.completed",
      `cs_dep_${RUN}`,
      quote,
      "paid",
      42_500,
    ),
  );

  // The tech does the repair.
  const tech = await signedInClient(TECH.email, TECH.password);
  const { data: q } = await tech.from("quote").select("repair_job_id").eq("id", quote.id).single();
  const repairJob = q!.repair_job_id as string;
  await tech.from("job").update({ status: "in_progress" }).eq("id", repairJob);

  // The office invoices it: the quote's work, the deposit credited, one more line.
  // Still signed in as the owner from sending the quote.
  await page.goto(`/jobs/${repairJob}`);
  await page.getByRole("button", { name: "Create Invoice" }).click();
  const panel = page.getByTestId("invoice");
  await expect(panel).toContainText("Draft");
  await expect(panel).toContainText(`Repair skimmer line (${RUN})`);
  await expect(panel).toContainText(`Deposit paid on quote #${quote.number}`);
  await expect(panel).toContainText("$425.00");
  await panel.getByLabel("Description").fill("Replace skimmer lid");
  await panel.getByLabel("Price ($)").fill("125");
  await panel.getByRole("button", { name: "Add Line" }).click();
  await expect(panel.getByText("Line added.")).toBeVisible();
  await expect(panel.getByText("Replace skimmer lid")).toBeVisible();
  await panel.getByRole("button", { name: "Send Without Email" }).click();
  await expect(panel.getByText("Invoice sent. Copy the link for the customer.")).toBeVisible();
  const link = await panel.getByLabel("Customer link").inputValue();
  const token = link.split("/").pop()!;
  const { data: job } = await tech.from("job").select("status").eq("id", repairJob).single();
  expect(job!.status).toBe("invoiced");

  // The customer sees the balance on a phone: $850 + $125 - $425 deposit.
  await customer.goto(link);
  await expect(customer.getByRole("heading", { name: /^Invoice #\d+$/ })).toBeVisible();
  await expect(customer.getByText(`Deposit paid on quote #${quote.number}`)).toBeVisible();
  await expect(customer.getByRole("button", { name: "Pay $550.00" })).toBeVisible();
  // No Stripe key on the test server: the button opens a demo preview that charges nothing.
  await expect(customer.getByText(/^Demo only/)).toBeVisible();
  await customer.getByRole("button", { name: "Pay $550.00" }).click();
  const preview = customer.getByRole("region", { name: "Payment form preview (demo)" });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("button", { name: "Pay $550.00" })).toBeDisabled();
  await expect(preview.getByRole("textbox")).toHaveCount(0);
  expect(await customer.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    390,
  );

  // A $200 check, recorded by the owner.
  await page.reload();
  await panel.getByLabel("Amount received ($)").fill("200");
  await panel.getByRole("button", { name: "Record Payment" }).click();
  await expect(panel.getByText("Payment recorded.")).toBeVisible();
  await expect(panel).toContainText("Partly paid");
  await customer.reload();
  await expect(customer.getByRole("button", { name: "Pay $350.00" })).toBeVisible();

  // The rest by card through Stripe; a replay changes nothing.
  // The invoice id comes from the database, as Stripe would echo it from checkout metadata.
  const { data: inv } = await tech
    .from("share_link")
    .select("invoice_id")
    .eq("token", token)
    .single();
  const event = sessionEvent(
    `evt_inv_${RUN}`,
    "checkout.session.completed",
    `cs_inv_${RUN}`,
    quote,
    "paid",
    35_000,
    {
      kind: "invoice_payment",
      invoice_id: inv!.invoice_id as string,
      company_id: quote.company_id,
    },
  );
  expect((await webhook(request, event)).outcome).toBe("applied");
  expect((await webhook(request, event)).outcome).toBe("duplicate");

  await customer.reload();
  await expect(customer.getByRole("heading", { name: /^Receipt #\d+$/ })).toBeVisible();
  await expect(customer.getByRole("heading", { name: "Paid in Full" })).toBeVisible();
  await expect(customer.getByRole("button", { name: /^Pay / })).toHaveCount(0);
  const { data: done } = await tech.from("job").select("status").eq("id", repairJob).single();
  expect(done!.status).toBe("paid");

  // Paid: the repaired line's 12-month warranty is on record (M10).
  await page.goto("/warranties");
  const warranty = page.getByRole("listitem").filter({ hasText: `Repair skimmer line (${RUN})` });
  await expect(warranty).toContainText("Active");
  await expect(warranty).toContainText("12-month warranty on parts and labor");
  const { data: payments } = await admin!
    .from("payment")
    .select("amount_cents, method, status")
    .eq("invoice_id", inv!.invoice_id)
    .order("amount_cents");
  expect(payments).toEqual([
    { amount_cents: 20_000, method: "other", status: "succeeded" },
    { amount_cents: 35_000, method: "card", status: "succeeded" },
  ]);

  // The receipt email and the PDF.
  await expect
    .poll(async () => (await lastEmailTo("sam@example.com"))?.text.includes(token) ?? false)
    .toBe(true);
  expect((await lastEmailTo("sam@example.com"))!.subject).toBe("Receipt from Demo Leak Co.");
  const pdf = await request.get(`/i/${token}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await phone.close();
});

test("the phone invoices a detection fee, and the owner voids it", async ({ page, request }) => {
  const tech = await signedInClient(TECH.email, TECH.password);
  const { data: session } = await tech.auth.getSession();
  const auth = { authorization: `Bearer ${session.session!.access_token}` };

  const created = await request.post(`/api/jobs/${PARTNER_JOB}/invoice`, { headers: auth });
  expect(created.status()).toBe(200);
  const { invoiceId } = (await created.json()) as { invoiceId: string };
  const sent = await request.post(`/api/invoices/${invoiceId}/send`, {
    headers: auth,
    data: { channel: "sms_device" },
  });
  expect(sent.status()).toBe(200);
  const { link, message } = (await sent.json()) as { link: string; message: string };
  expect(message).toBe(`Demo Leak Co.: your invoice. View and pay it here: ${link}`);

  await page.goto(link);
  await expect(page.getByText("Leak detection", { exact: true })).toBeVisible();
  await expect(page.getByText("$649.00").first()).toBeVisible();

  await signIn(page, OWNER, `/jobs/${PARTNER_JOB}`);
  const panel = page.getByTestId("invoice");
  page.once("dialog", (d) => void d.accept());
  await panel.getByRole("button", { name: "Void Invoice" }).click();
  await expect(page.getByText(/^Voided:/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Invoice" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto(link);
  await expect(page.getByText(/This invoice was canceled/)).toBeVisible();
});

test("owners see every invoice and export them as CSV", async ({ page }) => {
  await signIn(page, OWNER, "/invoices");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Void" }).first()).toBeVisible();

  const invoices = await page.request.get("/invoices/export?kind=invoices");
  expect(invoices.status()).toBe(200);
  expect(invoices.headers()["content-type"]).toContain("text/csv");
  expect(await invoices.text()).toMatch(/^Invoice,Job,Customer,Status,/);

  const payments = await page.request.get("/invoices/export?kind=payments");
  expect(await payments.text()).toMatch(/^Date,For,Number,Amount,Method,Status,/);
});

test("the owner's dashboard shows money collected; techs can't open it", async ({ page }) => {
  await signIn(page, OWNER, "/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const collected = page.locator("dl > div").filter({ hasText: "Collected" });
  await expect(collected).not.toContainText("$0.00");
  await expect(page.getByRole("heading", { name: "Jobs by Status" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Collected");

  await page.context().clearCookies();
  await signIn(page, TECH, "/jobs");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/jobs$/);
});
