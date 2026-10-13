import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { signedEvent, signedInClient } from "./backend";
import { OWNER, RUN, TECH, signIn } from "./helpers";

// Shared by the quote (M8) and invoice (M9) tests.

export const SAMPLE_JOB = "00000000-0000-4000-8000-00000000e001";
export const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

/** A draft quote on the sample job, written the way the phone app writes it. */
export async function draftQuote(lines: [string, number][]) {
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

export async function sendFromOffice(page: Page, number: number): Promise<string> {
  await signIn(page, OWNER, `/jobs/${SAMPLE_JOB}`);
  const panel = page.getByTestId("quote").filter({ hasText: `Quote #${number} ·` });
  await expect(panel).toContainText("Draft");
  await panel.getByRole("button", { name: "Send Quote" }).click();
  await expect(panel).toContainText("Sent");
  return panel.getByLabel("Customer link").inputValue();
}

export function sessionEvent(
  eventId: string,
  type: string,
  sessionId: string,
  quote: { id: string; company_id: string },
  paymentStatus: "paid" | "unpaid",
  amount: number,
  metadata: Record<string, string> = {
    kind: "quote_deposit",
    quote_id: quote.id,
    company_id: quote.company_id,
  },
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
        metadata,
      },
    },
  });
}

export async function webhook(request: APIRequestContext, event: ReturnType<typeof signedEvent>) {
  const res = await request.post("/api/stripe/webhook", event);
  expect(res.status()).toBe(200);
  return (await res.json()) as { outcome: string };
}
