import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatAddress,
  formatSchedule,
  jobNotification,
  paymentNotification,
  quoteNotification,
  reportNotification,
  textNotification,
} from "@leakbook/core";
import { jobTechs, notify, shopManagers } from "./push";

// Who hears about what (docs/plans/live-activities-and-notifications.md, section 2). Each
// takes the service-role client: these run from webhooks and customer pages, where nobody on
// the team is signed in. None throws.

const name = (c: { name?: string | null } | null | undefined, fallback: string) =>
  c?.name?.trim() || fallback;

/** A customer texted the shop: their open jobs' techs, else the owners and admins. */
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
  }
  const userIds = techs.length ? techs : await shopManagers(db, input.companyId);
  await notify(db, {
    userIds,
    kind: "text",
    text: textNotification(name(customer, input.from), input.body),
    data: { conversation: input.conversationId },
  });
}

/** A customer paid a deposit or an invoice: the owners and admins. */
async function notifyPaymentUnsafe(
  db: SupabaseClient,
  input: {
    companyId: string;
    customerId: string | null;
    amountCents: number;
    what: string;
    jobId?: string | null;
  },
) {
  const { data: c } = input.customerId
    ? await db.from("customer").select("name").eq("id", input.customerId).maybeSingle()
    : { data: null };
  await notify(db, {
    userIds: await shopManagers(db, input.companyId),
    kind: "payment",
    text: paymentNotification(name(c, "A customer"), input.amountCents, input.what),
    data: input.jobId ? { job: input.jobId } : {},
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

/** Stripe took a deposit (on a quote) or an invoice payment: who paid, and for what. */
async function notifyPaidUnsafe(
  db: SupabaseClient,
  input: { table: "quote" | "invoice"; id: string; amountCents: number },
) {
  const { data: row } = await db
    .from(input.table)
    .select("company_id, job_id, number")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return;
  const { data: j } = await db
    .from("job")
    .select("bill_to_customer_id")
    .eq("id", row.job_id)
    .maybeSingle();
  await notifyPaymentUnsafe(db, {
    companyId: row.company_id as string,
    customerId: (j?.bill_to_customer_id as string | null) ?? null,
    amountCents: input.amountCents,
    what:
      input.table === "quote"
        ? "deposit"
        : row.number
          ? `invoice ${row.number as number}`
          : "invoice",
    jobId: row.job_id as string,
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
export const notifyPayment = quietly(notifyPaymentUnsafe);
export const notifyQuoteAccepted = quietly(notifyQuoteAcceptedUnsafe);
export const notifyReportSigned = quietly(notifyReportSignedUnsafe);
export const notifyJobChanged = quietly(notifyJobChangedUnsafe);
export const notifyPaid = quietly(notifyPaidUnsafe);
