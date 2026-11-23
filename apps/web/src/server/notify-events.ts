import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autopayFailedNotification,
  formatAddress,
  feedbackNotification,
  formatSchedule,
  jobNotification,
  paymentNotification,
  quoteNotification,
  reportNotification,
  reportOpenedNotification,
  textNotification,
} from "@leakbook/core";
import { contactUsers, jobTechs, notify, shopManagers } from "./push";

// Who hears about what (docs/plans/live-activities-and-notifications.md, section 2). Each
// takes the service-role client: these run from webhooks and customer pages, where nobody on
// the team is signed in. None throws.

const name = (c: { name?: string | null } | null | undefined, fallback: string) =>
  c?.name?.trim() || fallback;

/**
 * A customer texted the shop: their open jobs' techs who may contact customers, else the owners
 * and admins.
 */
async function notifyTextUnsafe(
  db: SupabaseClient,
  input: {
    companyId: string;
    conversationId: string;
    customerId: string | null;
    from: string;
    body: string;
  },
) {
  let customer: { name: string | null } | null = null;
  let techs: string[] = [];
  if (input.customerId) {
    const [{ data: c }, { data: jobs }] = await Promise.all([
      db.from("customer").select("name").eq("id", input.customerId).maybeSingle(),
      db
        .from("job")
        .select("assigned_user_id, second_tech_id")
        .eq("bill_to_customer_id", input.customerId)
        .in("status", ["scheduled", "in_progress"])
        .is("deleted_at", null),
    ]);
    customer = c;
    techs = (jobs ?? []).flatMap((j) => [j.assigned_user_id, j.second_tech_id]).filter(Boolean);
    // Not techs without Text and Call Customers (owner, 2026-11-23).
    techs = await contactUsers(db, input.companyId, techs);
  }
  const userIds = techs.length ? techs : await shopManagers(db, input.companyId);
  await notify(db, {
    userIds,
    kind: "text",
    text: textNotification(name(customer, input.from), input.body),
    data: { conversation: input.conversationId },
  });
}

/** A customer accepted a quote: the job's techs and the owners and admins. */
async function notifyQuoteAcceptedUnsafe(db: SupabaseClient, quoteId: string) {
  const { data: quote } = await db
    .from("quote")
    .select("company_id, job_id, total_cents")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return;
  const { data: j } = await db
    .from("job")
    .select("customer:customer!job_bill_to_customer_id_company_id_fkey(name)")
    .eq("id", quote.job_id)
    .maybeSingle();
  const customer = (j as unknown as { customer: { name: string | null } | null } | null)?.customer;
  await notify(db, {
    userIds: [
      ...(await jobTechs(db, quote.job_id as string)),
      ...(await shopManagers(db, quote.company_id as string)),
    ],
    kind: "quote",
    text: quoteNotification(name(customer, "The customer"), quote.total_cents as number),
    data: { job: quote.job_id },
  });
}

/** A customer signed a report: the job's techs and the owners and admins. */
async function notifyReportSignedUnsafe(db: SupabaseClient, jobId: string) {
  const { data: j } = await db
    .from("job")
    .select("company_id, customer:customer!job_bill_to_customer_id_company_id_fkey(name)")
    .eq("id", jobId)
    .maybeSingle();
  if (!j) return;
  const job = j as unknown as { company_id: string; customer: { name: string | null } | null };
  await notify(db, {
    userIds: [...(await jobTechs(db, jobId)), ...(await shopManagers(db, job.company_id))],
    kind: "report",
    text: reportNotification(name(job.customer, "The customer")),
    data: { job: jobId },
  });
}

/**
 * A job was given to someone or its time changed (on the website): its techs, except whoever
 * made the change. `moved` when it already had a time.
 */
async function notifyJobChangedUnsafe(
  db: SupabaseClient,
  input: { jobId: string; moved: boolean; by: string; timeZone: string },
) {
  const { data: j } = await db
    .from("job")
    .select(
      "assigned_user_id, second_tech_id, scheduled_start, customer:customer!job_bill_to_customer_id_company_id_fkey(name), property:property!job_property_id_company_id_fkey(*)",
    )
    .eq("id", input.jobId)
    .maybeSingle();
  if (!j) return;
  const job = j as unknown as {
    assigned_user_id: string | null;
    second_tech_id: string | null;
    scheduled_start: string | null;
    customer: { name: string | null } | null;
    property: Parameters<typeof formatAddress>[0] | null;
  };
  const techs = [job.assigned_user_id, job.second_tech_id].filter(
    (t): t is string => !!t && t !== input.by,
  );
  if (techs.length === 0) return;
  await notify(db, {
    userIds: techs,
    kind: "job",
    text: jobNotification({
      moved: input.moved,
      customer: name(job.customer, "A customer"),
      address: job.property ? formatAddress(job.property) : null,
      when: job.scheduled_start
        ? formatSchedule(job.scheduled_start, new Date(), input.timeZone)
        : null,
    }),
    data: { job: input.jobId },
  });
}

/**
 * Stripe took a deposit (on a quote) or an invoice payment: the job's techs and the owners and
 * admins (owner, 2026-10-22: "Techs never hear the outcome"), "Rebecca Soto paid $650.00
 * (invoice 1042)." Claimed on the payment's Activity row first, so a webhook Stripe retries,
 * or the same payment's two events, notify once (claim_payment_notification).
 */
async function notifyPaidUnsafe(db: SupabaseClient, input: { sessionId: string }) {
  const { data, error } = await db.rpc("claim_payment_notification", {
    session_id: input.sessionId,
  });
  if (error || !data) return;
  const p = data as {
    company_id: string;
    job_id: string | null;
    invoice_id: string | null;
    quote_id: string | null;
    invoice_number: number | null;
    amount_cents: number;
    customer_name: string | null;
  };
  await notify(db, {
    userIds: [
      ...(p.job_id ? await jobTechs(db, p.job_id) : []),
      ...(await shopManagers(db, p.company_id)),
    ],
    kind: "payment",
    text: paymentNotification(
      p.customer_name?.trim() || "A customer",
      p.amount_cents,
      p.invoice_id ? (p.invoice_number ? `invoice ${p.invoice_number}` : "invoice") : "deposit",
    ),
    data: {
      ...(p.job_id ? { job: p.job_id } : {}),
      ...(p.invoice_id ? { invoice: p.invoice_id } : {}),
    },
  });
}

/**
 * The customer opened a report's link (/r/<token>): the first time only, the job's techs and
 * the owners and admins hear "Rebecca Soto opened the report." (owner, 2026-10-22). The
 * database records it once per report (record_report_opened), so reloads and later opens
 * don't notify. Visit reports are left out there.
 */
async function notifyReportOpenedUnsafe(db: SupabaseClient, token: string) {
  const { data, error } = await db.rpc("record_report_opened", { link_token: token });
  if (error || !data) return;
  const r = data as { company_id: string; job_id: string; customer_name: string | null };
  await notify(db, {
    userIds: [...(await jobTechs(db, r.job_id)), ...(await shopManagers(db, r.company_id))],
    kind: "opened",
    text: reportOpenedNotification(r.customer_name?.trim() || "The customer"),
    data: { job: r.job_id },
  });
}

/**
 * A customer gave a thumbs down (owner's competitor notes, 2026-11-16): the owners and admins
 * hear "Rebecca Soto: The pool is still green." The complaint is in Customer Feedback.
 */
async function notifyFeedbackUnsafe(
  db: SupabaseClient,
  input: { companyId: string; jobId: string; customer: string; comment: string },
) {
  await notify(db, {
    userIds: await shopManagers(db, input.companyId),
    kind: "feedback",
    text: feedbackNotification(input.customer, input.comment),
    data: { job: input.jobId },
  });
}

/** Each runs after what caused it already worked: an error in one is swallowed. */
const quietly =
  <A extends unknown[]>(f: (...args: A) => Promise<unknown>) =>
  async (...args: A): Promise<void> => {
    try {
      await f(...args);
    } catch {
      // A notification that doesn't go out never fails the text, payment, or signature.
    }
  };

export const notifyText = quietly(notifyTextUnsafe);
export const notifyQuoteAccepted = quietly(notifyQuoteAcceptedUnsafe);
export const notifyReportSigned = quietly(notifyReportSignedUnsafe);
export const notifyJobChanged = quietly(notifyJobChangedUnsafe);
export const notifyPaid = quietly(notifyPaidUnsafe);
export const notifyReportOpened = quietly(notifyReportOpenedUnsafe);
export const notifyFeedback = quietly(notifyFeedbackUnsafe);

/**
 * An autopay or Charge Card on File payment succeeded (docs/design/2026-11-16-autopay.md): told
 * as notifyPaid tells a Checkout payment, claimed on the payment's Activity row so the charge's
 * answer and Stripe's event notify once.
 */
async function notifyPaidIntentUnsafe(db: SupabaseClient, intentId: string) {
  const { data, error } = await db.rpc("claim_intent_notification", { intent_id: intentId });
  if (error || !data) return;
  const p = data as {
    company_id: string;
    job_id: string | null;
    invoice_id: string | null;
    invoice_number: number | null;
    amount_cents: number;
    customer_name: string | null;
  };
  await notify(db, {
    userIds: [
      ...(p.job_id ? await jobTechs(db, p.job_id) : []),
      ...(await shopManagers(db, p.company_id)),
    ],
    kind: "payment",
    text: paymentNotification(
      p.customer_name?.trim() || "A customer",
      p.amount_cents,
      p.invoice_number ? `invoice ${p.invoice_number}` : "invoice",
    ),
    data: {
      ...(p.job_id ? { job: p.job_id } : {}),
      ...(p.invoice_id ? { invoice: p.invoice_id } : {}),
    },
  });
}

/** An automatic payment didn't go through: the owners and admins. */
async function notifyAutopayFailedUnsafe(
  db: SupabaseClient,
  input: {
    companyId: string;
    invoiceId: string;
    customer: string | null;
    amountCents: number;
    number: number | null;
    reason: string | null;
  },
) {
  const { data: inv } = await db
    .from("invoice")
    .select("job_id")
    .eq("id", input.invoiceId)
    .maybeSingle();
  await notify(db, {
    userIds: await shopManagers(db, input.companyId),
    kind: "payment",
    text: autopayFailedNotification(
      input.customer?.trim() || "A customer",
      input.amountCents,
      input.number,
      input.reason,
    ),
    data: { invoice: input.invoiceId, ...(inv?.job_id ? { job: inv.job_id } : {}) },
  });
}

export const notifyPaidIntent = quietly(notifyPaidIntentUnsafe);
export const notifyAutopayFailed = quietly(notifyAutopayFailedUnsafe);
