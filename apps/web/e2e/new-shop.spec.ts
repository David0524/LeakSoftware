import { expect, test } from "@playwright/test";
import { adminClient, signedEvent, signedInClient } from "./backend";
import { RUN, closeWrapUpStep, finishChecklist, jobSection, wrapUpStep } from "./helpers";
import { PHONE, sessionEvent, webhook } from "./money";

// M10 "Done when": a new shop signs up, starts its free trial, connects Stripe, and runs the
// whole loop from the website without help: a job booked, inspected, reported, quoted,
// accepted with a deposit, repaired, invoiced, and paid, with the money on the dashboard. Then it subscribes to Sundeck Pro, and an unpaid shop turns read-only
// without losing anything. Stripe itself is not called: the tests send the signed events
// Stripe would send.

const OWNER = {
  name: "Pat Newshop",
  company: `Clearwater Leak Pros ${RUN}`,
  email: `owner-${RUN}@newshop.test`,
  password: "Sundeck-new-shop-1",
};
const CUSTOMER = { name: `Casey Rivers ${RUN}`, email: `casey-${RUN}@example.com` };

test("a new shop signs up and runs the whole loop, then subscribes", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(420_000);
  const admin = adminClient();
  test.skip(!admin, "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).");

  // 1. Sign up: the account and the shop in one form, straight into the office.
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(OWNER.name);
  await page.getByLabel("Company name").fill(OWNER.company);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Mobile phone").fill("480-555-0142");
  await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
  // One app, two packages: this shop does leak detection.
  await page.getByRole("radio", { name: "Leak Detection" }).click();
  // Under the button, the terms line with its two links (owner, 2026-10-24). Recently visited
  // pages stay mounted, hidden, so another page's copy of the line may still be in the DOM.
  const consent = page.getByTestId("terms-consent").filter({ visible: true });
  await expect(consent).toHaveText(
    "By creating an account, you agree to the Terms and Privacy Policy.",
  );
  await expect(consent.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(consent.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
  await page.getByRole("button", { name: "Start Free Trial" }).click();

  // Straight to the trial page (owner, 2026-10-24: no questionnaire first).
  await page.waitForURL((url) => url.pathname === "/welcome");
  // The account recorded when it agreed.
  const { data: agreed } = await admin!
    .from("profile")
    .select("accepted_terms_at")
    .eq("email", OWNER.email.toLowerCase())
    .single();
  expect(agreed?.accepted_terms_at).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "Reports that sell the repair, starting today." }),
  ).toBeVisible();
  await expect(page.getByTestId("onboarding-price")).toContainText("$49");
  // In with the demo code (CI has no Stripe keys), then back on an ordinary trial as if the
  // card were in, since this test goes on to subscribe and to be locked when canceled.
  await page.getByLabel("Demo code").fill("VIP26");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL((url) => url.pathname === "/welcome/done");
  const { data: shop } = await admin!
    .from("company")
    .select("id")
    .eq("name", OWNER.company)
    .single();
  await admin!
    .from("subscription")
    .update({ plan: "standard", status: "trialing", access_code: null })
    .eq("company_id", shop!.id);
  await expect(page.getByTestId("next-steps")).toContainText("Set up customer payments");
  await page.getByRole("link", { name: "Start Using Sundeck Pro" }).click();
  // A new owner on a computer lands on the Dashboard; onboarding doesn't come back.
  await page.waitForURL((url) => url.pathname === "/dashboard");
  await page.goto("/settings/billing");
  await expect(page.getByText(/Free trial: (29|30) days left/)).toBeVisible();

  const owner = await signedInClient(OWNER.email, OWNER.password);
  const { data: membership } = await owner.from("membership").select("company_id").single();
  const companyId = membership!.company_id as string;
  // A new shop starts on the defaults (navy, no deposit); the owner asks for a 25% deposit,
  // as in Settings › Payments.
  const { data: chosen } = await owner
    .from("company")
    .select("brand_primary, settings")
    .eq("id", companyId)
    .single();
  expect(chosen!.brand_primary).toBe("#12263A");
  expect(chosen!.settings.deposit.value_bps).toBe(0);
  const { error: depositError } = await owner
    .from("company")
    .update({
      settings: {
        ...chosen!.settings,
        deposit: { ...chosen!.settings.deposit, type: "percent", value_bps: 2500 },
      },
    })
    .eq("id", companyId);
  expect(depositError).toBeNull();

  // 2. Connect Stripe: onboarding made the account; Stripe reports it ready.
  const account = `acct_new_${RUN}`;
  await admin!.from("stripe_account").insert({ company_id: companyId, stripe_account_id: account });
  await webhook(
    request,
    signedEvent({
      id: `evt_acct_${RUN}`,
      object: "event",
      type: "account.updated",
      account,
      data: {
        object: {
          id: account,
          object: "account",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    }),
  );

  // 3. Book a detection job for a new customer.
  await page.goto("/jobs/new");
  await page.getByLabel("Name").fill(CUSTOMER.name);
  await page.getByLabel("Email", { exact: true }).fill(CUSTOMER.email);
  await page.getByLabel("Street address").fill("88 Lagoon Ln");
  await page.getByLabel("City").fill("Chandler");
  await page.getByLabel("State", { exact: true }).fill("AZ");
  await page.getByLabel("Date").fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Tech", { exact: true }).selectOption({ label: OWNER.name });
  // The price is under More Details (owner, 2026-10-29: "New Job in 20 seconds").
  await page.getByRole("button", { name: /^More Details/ }).click();
  await page
    .getByLabel("Detection price")
    .selectOption({ label: "Leak detection - pool ($375.00)" });
  await page.getByRole("button", { name: "Create Job" }).click();
  await expect(page.getByText(/^Job #\d+$/).first()).toBeVisible();
  const detectionJob = new URL(page.url()).pathname;

  // 4. Inspect: start, one leak with where, the rest not leaking; a finding.
  await page.getByRole("button", { name: "Start Job" }).click();
  // Steps back are in the ••• menu (owner, 2026-10-29).
  await expect(page.getByRole("button", { name: "More Job Actions" })).toBeVisible();
  // The job page shows one tab at a time on every screen (owner, 2026-10-22).
  await jobSection(page, "Checklist");
  await page
    .getByRole("radiogroup", { name: "Skimmer", exact: true })
    .getByRole("radio", { name: "Leaking", exact: true })
    .click();
  const where = page.getByLabel("Where: Skimmer");
  await where.fill("Throat seam");
  await where.blur();
  await expect(page.getByText(/^1 leaking · \d+ to do$/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Where: Skimmer")).toHaveValue("Throat seam");
  await finishChecklist(page);
  await expect(page.getByText(/ · 1 leaking$/)).toBeVisible();

  await jobSection(page, "Findings");
  await page.getByRole("button", { name: "Add Finding" }).click();
  const addFinding = page.getByRole("dialog", { name: "Add Finding" });
  await addFinding.getByLabel("What").fill("Cracked skimmer throat");
  await addFinding.getByLabel("Severity").selectOption({ label: "Major" });
  await addFinding.getByLabel("Item (optional)").selectOption({ label: "Skimmer" });
  await addFinding.getByRole("button", { name: "Add Finding" }).click();
  await expect(addFinding).toBeHidden();
  await expect(page.getByText("Cracked skimmer throat", { exact: true })).toBeVisible();

  // 5. Report: nobody home to sign, so it is finished with Customer Not Here, then texted.
  await wrapUpStep(page, "Report");
  const report = page.getByTestId("report-homeowner");
  await report.getByRole("button", { name: "Write Draft" }).click();
  await expect(report.getByText(/^Draft written\./)).toBeVisible();
  await report.getByRole("button", { name: "Review with Customer" }).click();
  await page.getByRole("button", { name: "Customer Not Here" }).click();
  await page.waitForURL(/\/jobs\/[^/]+\?tab=wrap-up$/);
  await expect(page.getByTestId("wrap-up-sign")).toContainText("Not signed: customer not present");
  await wrapUpStep(page, "Report");
  const finished = report.getByTestId("finished-report");
  await finished.getByRole("button", { name: "Send by Text" }).click();
  await expect(report.getByText("Report sent. Copy the message below.")).toBeVisible();
  const reportHref = await report
    .getByRole("link", { name: /^View version \d+$/ })
    .getAttribute("href");
  const customerPage = await page.context().newPage();
  await customerPage.goto(reportHref!);
  await expect(customerPage.getByTestId("unsigned")).toHaveText(
    "Not signed: customer not present.",
  );
  await expect((await customerPage.request.get(`${reportHref}/pdf`)).status()).toBe(200);
  await customerPage.close();
  await closeWrapUpStep(page);

  // 6. Quote from the finding's suggested price, sent.
  await page.getByRole("button", { name: "New Quote" }).click();
  const quotePanel = page.getByTestId("quote");
  await quotePanel
    .getByLabel("Add from the price book")
    .selectOption({ label: "Skimmer throat repair ($225.00)" });
  await quotePanel.getByRole("button", { name: "Add Item" }).click();
  await expect(quotePanel.getByTestId("quote-line")).toHaveCount(1);
  await quotePanel.getByRole("button", { name: "Send Quote" }).click();
  const quoteLink = await quotePanel.getByLabel("Customer link").inputValue();
  await closeWrapUpStep(page);

  // 7. The customer accepts on a phone and pays the 25% deposit set above.
  const phone = await browser.newContext(PHONE);
  const customer = await phone.newPage();
  await customer.goto(quoteLink);
  await customer.getByLabel("Your name").fill(CUSTOMER.name);
  await customer.getByLabel(/I accept this quote/).check();
  await customer.getByRole("button", { name: "Accept Quote" }).click();
  await expect(customer.getByRole("button", { name: "Pay $56.25 Deposit" })).toBeVisible();
  const { data: quote } = await owner
    .from("quote")
    .select("id, company_id, repair_job_id")
    .eq("status", "accepted")
    .single();
  await webhook(
    request,
    sessionEvent(
      `evt_dep_new_${RUN}`,
      "checkout.session.completed",
      `cs_dep_new_${RUN}`,
      quote!,
      "paid",
      5_625,
      undefined,
      account,
    ),
  );

  // 8. The repair: started, invoiced with the deposit credited, paid online.
  await page.goto(`/jobs/${quote!.repair_job_id}`);
  await page.getByRole("button", { name: "Start Job" }).click();
  // Steps back are in the ••• menu (owner, 2026-10-29).
  await expect(page.getByRole("button", { name: "More Job Actions" })).toBeVisible();
  // A repair job's finish list has no quote rows; the invoice opens in a sheet.
  await expect(page.getByTestId("wrap-up-quote")).toHaveCount(0);
  await wrapUpStep(page, "Invoice");
  await expect(page.getByRole("button", { name: "Create Invoice" })).toBeVisible();
  await page.getByRole("button", { name: "Create Invoice" }).click();
  const invoice = page.getByTestId("invoice");
  await expect(invoice).toContainText("Deposit paid on quote");
  await invoice.getByRole("button", { name: "Send Without Email" }).click();
  const invoiceLink = await invoice.getByLabel("Customer link").inputValue();
  await customer.goto(invoiceLink);
  await expect(customer.getByRole("button", { name: "Pay $168.75" })).toBeVisible();
  const { data: inv } = await owner
    .from("invoice")
    .select("id")
    .eq("job_id", quote!.repair_job_id)
    .single();
  await webhook(
    request,
    sessionEvent(
      `evt_inv_new_${RUN}`,
      "checkout.session.completed",
      `cs_inv_new_${RUN}`,
      quote!,
      "paid",
      16_875,
      {
        kind: "invoice_payment",
        invoice_id: inv!.id as string,
        company_id: companyId,
      },
      account,
    ),
  );
  await customer.reload();
  await expect(customer.getByRole("heading", { name: "Paid in Full" })).toBeVisible();
  await phone.close();

  // 9. The money is on the dashboard.
  await page.goto("/dashboard");
  await expect(page.locator("dl > div").filter({ hasText: "Collected" })).toContainText("$225.00");

  // 10. Subscribe to Sundeck Pro: Checkout finishes, Stripe reports the subscription active.
  const renews = Math.floor(Date.now() / 1000) + 30 * 86_400;
  await webhook(
    request,
    signedEvent({
      id: `evt_sub_co_${RUN}`,
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_sub_${RUN}`,
          object: "checkout.session",
          customer: `cus_${RUN}`,
          subscription: `sub_${RUN}`,
          metadata: { kind: "tidemark_subscription", company_id: companyId },
        },
      },
    }),
  );
  const subscription = (status: string, id: string) =>
    signedEvent({
      id,
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: `sub_${RUN}`,
          object: "subscription",
          customer: `cus_${RUN}`,
          status,
          trial_end: null,
          metadata: { company_id: companyId },
          items: { data: [{ current_period_end: renews }] },
        },
      },
    });
  await webhook(request, subscription("active", `evt_sub_up_${RUN}`));
  await page.goto("/settings/billing");
  await expect(page.getByText(/^Active\. Renews on /)).toBeVisible();

  // 11. Canceled: read-only. Everything is still there; nothing can be changed.
  await webhook(request, subscription("canceled", `evt_sub_off_${RUN}`));
  // The finding is on its tab (one tab at a time on every screen, owner 2026-10-22); the
  // notes are in Details.
  await page.goto(`${detectionJob}?tab=findings`);
  await expect(page.getByRole("alert").filter({ hasText: /^Read-only/ })).toBeVisible();
  await expect(page.getByText("Cracked skimmer throat", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Details/ }).click();
  await page.getByLabel("Job notes").fill("Trying to change this");
  const onSite = page.locator("form").filter({ has: page.getByLabel("Job notes") });
  await onSite.getByRole("button", { name: "Save" }).click();
  await expect(
    onSite.getByText(/read-only until its Sundeck Pro subscription is paid/),
  ).toBeVisible();

  // Paid again: back to work.
  await webhook(request, subscription("active", `evt_sub_back_${RUN}`));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: /^Read-only/ })).toHaveCount(0);
  await page.getByLabel("Job notes").fill("Back to work");
  await onSite.getByRole("button", { name: "Save" }).click();
  await expect(onSite.getByText("Saved.")).toBeVisible();
});
