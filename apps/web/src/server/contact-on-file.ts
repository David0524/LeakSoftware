import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The customer's email and phone on file for a job, a report, or an invoice, read through the
 * signed-in person's own access. A tech without Text and Call Customers (owner, 2026-11-23:
 * "fully off") still sends what's part of the work (reports, visit reports, invoices,
 * receipts), but only to these: the address they'd type is ignored, and they never see it.
 */
export async function customerOnFile(
  db: SupabaseClient,
  ref: { job?: string; report?: string; invoice?: string },
): Promise<{ email: string | null; phone: string | null }> {
  let jobId = ref.job ?? null;
  if (!jobId && (ref.report || ref.invoice)) {
    const { data } = await db
      .from(ref.report ? "report" : "invoice")
      .select("job_id")
      .eq("id", (ref.report ?? ref.invoice)!)
      .maybeSingle();
    jobId = (data?.job_id as string | undefined) ?? null;
  }
  if (!jobId) return { email: null, phone: null };
  const { data: job } = await db
    .from("job")
    .select(
      "bill_to:customer!job_bill_to_customer_id_company_id_fkey(email, phone), property:property!job_property_id_company_id_fkey(owner:customer!property_customer_id_company_id_fkey(email, phone))",
    )
    .eq("id", jobId)
    .maybeSingle();
  const j = job as unknown as {
    bill_to: { email: string | null; phone: string | null } | null;
    property: { owner: { email: string | null; phone: string | null } | null } | null;
  } | null;
  const c = j?.bill_to ?? j?.property?.owner ?? null;
  return { email: c?.email ?? null, phone: c?.phone ?? null };
}

/**
 * Who a send from the phone app goes to: what was typed, or, for someone without Text and Call
 * Customers, the customer's email (or number, for a texted receipt) on file.
 */
export async function recipientFor(
  db: SupabaseClient,
  ref: { job?: string; report?: string; invoice?: string },
  typed: string | null,
  kind: "email" | "phone" = "email",
): Promise<string | null> {
  const table = ref.report ? "report" : ref.invoice ? "invoice" : "job";
  const { data: row } = await db
    .from(table)
    .select("company_id")
    .eq("id", (ref.report ?? ref.invoice ?? ref.job)!)
    .maybeSingle();
  if (!row) return typed;
  const { data: may } = await db.rpc("may_contact_customers", { target_company: row.company_id });
  // An older database without the check: as before.
  if (may !== false) return typed;
  const onFile = await customerOnFile(db, ref);
  return kind === "phone" ? onFile.phone : onFile.email;
}
