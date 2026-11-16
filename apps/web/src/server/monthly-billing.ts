import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NO_WAY_TO_SEND,
  friendlyError,
  sendAllResult,
  sendRoute,
  type MonthBilling,
  type SendAllResult,
} from "@leakbook/core";
import { Refusal, dbFailure } from "./failures";
import { sendInvoice } from "./invoices";
import { activeLine, sendCompanyText } from "./texting";

// Monthly Billing (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md): a month's
// drafts sent at once, each through the usual send (the send-once guard, the month's service
// report, the email allowance). Shared by the website's action and the apps' route.

export function validMonth(month: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(month);
}

export async function monthBilling(
  db: SupabaseClient,
  companyId: string,
  month: string,
): Promise<MonthBilling> {
  const { data, error } = await db.rpc("month_billing", { target_company: companyId, month });
  if (error) throw dbFailure(error);
  return data as MonthBilling;
}

/** A few at a time: quick, but kind to the email provider and the database. */
const AT_ONCE = 4;

/**
 * Send the month's drafts (all, or the ids given): by email, else by text from the shop's
 * number, else left as drafts with the reason. Never throws for one invoice.
 */
export async function sendMonthInvoices(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  month: string,
  origin: string,
  only?: string[] | null,
): Promise<SendAllResult> {
  if (!validMonth(month)) throw new Refusal("Pick a month.");
  const [billing, line] = await Promise.all([
    monthBilling(db, companyId, month),
    activeLine(db, companyId),
  ]);
  const texting = line?.status === "active";
  const drafts = billing.invoices.filter(
    (i) => i.status === "draft" && (!only || only.includes(i.id)),
  );
  let sent = 0;
  const failed: SendAllResult["failed"] = [];
  const queue = [...drafts];
  const worker = async () => {
    for (let inv = queue.shift(); inv; inv = queue.shift()) {
      try {
        await sendMonthlyInvoice(db, userId, inv, texting, origin);
        sent++;
      } catch (e) {
        failed.push({ id: inv.id, customer: inv.customer, reason: friendlyError(e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, drafts.length) }, worker));
  return { sent, failed, message: sendAllResult(sent, failed.length) };
}

/**
 * Send one monthly draft: by email, else by text from the shop's number, else refused with
 * "No email or mobile number". `userId` null: the shop itself (the daily run).
 */
export async function sendMonthlyInvoice(
  db: SupabaseClient,
  userId: string | null,
  inv: {
    id: string;
    customer_id: string;
    job_id: string;
    email: string | null;
    phone: string | null;
  },
  texting: boolean,
  origin: string,
): Promise<void> {
  const route = sendRoute(inv, texting);
  if (route.channel === "none") throw new Refusal(NO_WAY_TO_SEND);
  if (route.channel === "email") {
    await sendInvoice(db, inv.id, { channel: "email", to: route.to, origin });
    return;
  }
  const r = await sendInvoice(db, inv.id, { channel: "link", origin });
  try {
    await sendCompanyText(
      db,
      userId,
      { customerId: inv.customer_id, body: r.message, jobId: inv.job_id },
      origin,
    );
  } catch (e) {
    throw new Refusal(
      `Marked sent, but the text didn’t go: ${friendlyError(e)} Copy the link from the invoice.`,
    );
  }
}

/**
 * The daily run (owner, 2026-11-16: "Add auto-send on the invoice day too"): each shop that
 * sends by itself sends last month's drafts whose invoice day has come, as the shop. One that
 * can't go stays a draft with the reason, for the month's page. Returns how many went.
 */
export async function sendDueMonthlyInvoices(
  admin: SupabaseClient,
  origin: string,
  at: Date,
): Promise<{ sent: number; failed: number }> {
  const { data, error } = await admin.rpc("monthly_invoices_to_send", { at: at.toISOString() });
  if (error) throw new Error(error.message);
  const due = (data ?? []) as {
    invoice_id: string;
    company_id: string;
    customer_id: string;
    job_id: string;
    email: string | null;
    phone: string | null;
  }[];
  const texting = new Map<string, boolean>();
  let sent = 0;
  let failed = 0;
  const queue = [...due];
  const worker = async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      if (!texting.has(d.company_id))
        texting.set(d.company_id, (await activeLine(admin, d.company_id))?.status === "active");
      try {
        await sendMonthlyInvoice(
          admin,
          null,
          { ...d, id: d.invoice_id },
          texting.get(d.company_id)!,
          origin,
        );
        sent++;
      } catch (e) {
        failed++;
        await admin.rpc("record_auto_send", {
          target_invoice: d.invoice_id,
          failure: friendlyError(e),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, due.length) }, worker));
  return { sent, failed };
}
