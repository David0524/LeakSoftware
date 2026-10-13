import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { adminClient, signedEvent, signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";

// M8 "Done when": a customer accepts a quote and pays the deposit by card and by bank (ACH)
// from a phone-sized browser; statuses update through webhooks; a replayed webhook changes
// nothing. Stripe itself is not called: the tests send the signed events Stripe would send.

test.describe.configure({ mode: "serial" });

const SAMPLE_JOB = "00000000-0000-4000-8000-00000000e001";
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

/** A draft quote on the sample job, written the way the phone app writes it. */
async function draftQuote(lines: [string, number][]) {
  const db = await signedInClient(TECH.email, TECH.password);
  const { data: job } = await db.from("job").select("company_id").eq("id", SAMPLE_JOB).single();
  const { data: quote, error } = await db
    .from("quote")
    .insert({ company_id: job!.company_id, job_id: SAMPLE_JOB })
    .select("id, number, company_id")
    .single();
  if (error) throw error;
  const { error: lineError } = await db.from("quote_line_item").insert(
    lines.map(([description, cents], i) => ({
      company_id: quote.company_id,
      quote_id: quote.id,
      description: `${description} (${RUN})`,
      unit_price_cents: cents,
      sort_order: i,
    })),
  );
  if (lineError) throw lineError;
  return quote as { id: string; number: number; company_id: string };
}

async function sendFromOffice(page: Page, number: number): Promise<string> {
  await signIn(page, OWNER, `/jobs/${SAMPLE_JOB}`);
  const panel = page.getByTestId("quote").filter({ hasText: `Quote #${number} ·` });
  await expect(panel).toContainText("Draft");
  await panel.getByRole("button", { name: "Send Quote" }).click();
  await expect(panel).toContainText("Sent");
  return panel.getByLabel("Customer link").inputValue();
}

function sessionEvent(
  eventId: string,
  type: string,
  sessionId: string,
  quote: { id: string; company_id: string },
  paymentStatus: "paid" | "unpaid",
  amount: number,
) {
  return signedEvent({
    id: eventId,
    object: "event",
    type,
    account: "acct_e2e_demo",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: paymentStatus,
        amount_total: amount,
        payment_intent: `pi_${sessionId}`,
        metadata: { kind: "quote_deposit", quote_id: quote.id, company_id: quote.company_id },
      },
    },
  });
}

async function webhook(request: APIRequestContext, event: ReturnType<typeof signedEvent>) {
  const res = await request.post("/api/stripe/webhook", event);
  expect(res.status()).toBe(200);
  return (await res.json()) as { outcome: string };
}

let bankQuote: { id: string; number: number; company_id: string };
let bankLink = "";

test("the office sends a quote and the customer accepts it on a phone", async ({
  page,
  browser,
}) => {
  bankQuote = await draftQuote([
    ["Repair return line under deck", 85_000],
    ["Replace return fitting", 12_500],
  ]);
  bankLink = await sendFromOffice(page, bankQuote.number);

  const phone = await browser.newContext(PHONE);
  const customer = await phone.newPage();
  await customer.goto(bankLink);
  await expect(
    customer.getByRole("heading", { name: `Repair Quote #${bankQuote.number}` }),
  ).toBeVisible();
  await expect(customer.getByText(`Repair return line under deck (${RUN})`)).toBeVisible();
  await expect(customer.getByText("$975.00").first()).toBeVisible();
  // Nothing scrolls sideways at phone width.
  expect(await customer.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    390,
  );

  await customer.getByRole("button", { name: "Accept Quote" }).click();
  // The browser's own check stops it until the box is ticked.
  await expect(customer.getByText(/^Accepted by/)).toHaveCount(0);
  await customer.getByLabel("Your name").fill("Sam Sample");
  await customer.getByLabel(/I accept this quote/).check();
  await customer.getByRole("button", { name: "Accept Quote" }).click();
  await expect(customer.getByText(/^Accepted by Sam Sample/)).toBeVisible();
  await phone.close();
});

test("deposits by bank and by card update through webhooks, and replays change nothing", async ({
  page,
  browser,
  request,
}) => {
  const admin = adminClient();
  test.skip(!admin, "Needs SUPABASE_SERVICE_ROLE_KEY (CI runs it against Supabase in Docker).");

  // The shop finishes Stripe onboarding: account.updated turns on charges.
  await admin!.from("stripe_account").upsert(
    {
      company_id: bankQuote.company_id,
      stripe_account_id: "acct_e2e_demo",
      charges_enabled: false,
    },
    { onConflict: "company_id" },
  );
  await webhook(
    request,
    signedEvent({
      id: `evt_acct_${RUN}`,
      object: "event",
      type: "account.updated",
      data: {
        object: {
          id: "acct_e2e_demo",
          object: "account",
          charges_enabled: true,
          payouts_enabled: true,
          details_submitted: true,
        },
      },
    }),
  );

  const phone = await browser.newContext(PHONE);
  const customer = await phone.newPage();
  await customer.goto(bankLink);
  await expect(customer.getByRole("button", { name: "Pay $487.50 Deposit" })).toBeVisible();

  // Bank payment: completed but unpaid, then it clears days later.
  const completed = sessionEvent(
    `evt_ach1_${RUN}`,
    "checkout.session.completed",
    `cs_ach_${RUN}`,
    bankQuote,
    "unpaid",
    48_750,
  );
  expect((await webhook(request, completed)).outcome).toBe("applied");
  await customer.reload();
  await expect(customer.getByText(/bank payment of \$487\.50 is processing/)).toBeVisible();
  await expect(customer.getByRole("button", { name: /Deposit$/ })).toHaveCount(0);

  await webhook(
    request,
    sessionEvent(
      `evt_ach2_${RUN}`,
      "checkout.session.async_payment_succeeded",
      `cs_ach_${RUN}`,
      bankQuote,
      "paid",
      48_750,
    ),
  );
  await customer.reload();
  await expect(customer.getByText("Deposit of $487.50 received. Thank you!")).toBeVisible();

  // Stripe resends the first event: nothing changes.
  expect((await webhook(request, completed)).outcome).toBe("duplicate");
  const { data: payments } = await admin!
    .from("payment")
    .select("status, method")
    .eq("quote_id", bankQuote.id);
  expect(payments).toEqual([{ status: "succeeded", method: "ach" }]);
  await customer.reload();
  await expect(customer.getByText("Deposit of $487.50 received. Thank you!")).toBeVisible();

  // Card payment on a second quote: paid at once.
  const cardQuote = await draftQuote([["Skimmer throat repair", 40_000]]);
  const cardLink = await sendFromOffice(page, cardQuote.number);
  await customer.goto(cardLink);
  await customer.getByLabel("Your name").fill("Sam Sample");
  await customer.getByLabel(/I accept this quote/).check();
  await customer.getByRole("button", { name: "Accept Quote" }).click();
  await expect(customer.getByRole("button", { name: "Pay $200.00 Deposit" })).toBeVisible();
  await webhook(
    request,
    sessionEvent(
      `evt_card_${RUN}`,
      "checkout.session.completed",
      `cs_card_${RUN}`,
      cardQuote,
      "paid",
      20_000,
    ),
  );
  await customer.reload();
  await expect(customer.getByText("Deposit of $200.00 received. Thank you!")).toBeVisible();
  const { data: card } = await admin!
    .from("payment")
    .select("status, method")
    .eq("quote_id", cardQuote.id);
  expect(card).toEqual([{ status: "succeeded", method: "card" }]);
  await phone.close();
});

test("the office opens the repair job from the accepted quote and schedules it", async ({
  page,
}) => {
  await signIn(page, OWNER, `/jobs/${SAMPLE_JOB}`);
  const panel = page.getByTestId("quote").filter({ hasText: `Quote #${bankQuote.number} ·` });
  await expect(panel).toContainText("Accepted by Sam Sample");
  await panel.getByRole("link", { name: /^Repair job/ }).click();
  await expect(page.getByRole("heading", { name: /^Job #\d+/ })).toBeVisible();
  await expect(page.getByText("Repair", { exact: true }).first()).toBeVisible();

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Tech").selectOption({ label: "Tony Tech" });
  await page.getByLabel("Date").fill(tomorrow);
  await page.getByLabel("Start").fill("09:00");
  await page.getByRole("button", { name: "Save Schedule" }).click();
  await expect(page.getByText("Scheduled.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByText("SCHEDULED", { exact: true })
      .or(page.getByText("Scheduled", { exact: true }))
      .first(),
  ).toBeVisible();
});
