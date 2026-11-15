import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  billingMonthName,
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
      const route = sendRoute(inv, texting);
      try {
        if (route.channel === "none") throw new Refusal("No email or mobile number");
        if (route.channel === "email") {
          await sendInvoice(db, inv.id, { channel: "email", to: route.to, origin });
        } else {
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
        sent++;
      } catch (e) {
        failed.push({ id: inv.id, customer: inv.customer, reason: friendlyError(e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, drafts.length) }, worker));
  return { sent, failed, message: sendAllResult(sent, failed.length) };
}

/** A month's name for the alert ("October"). */
export function monthWord(month: string): string {
  return billingMonthName(month, false);
}
