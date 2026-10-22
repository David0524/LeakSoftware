import type { WrapUpInput } from "@leakbook/core";
import type { InvoiceRow, QuoteRow, ReportRow, SignatureRow } from "./data";

/**
 * Wrap-Up's finish list (core `wrapUp`) from what the job page loads: the homeowner report's
 * versions, the quotes, invoices and signatures. Sign-off signatures are the ones the customer
 * gives at the end of the report: not work authorization (signed before the work) and not quote
 * acceptance (signed from the quote).
 */
export function wrapUpInput({
  jobType,
  customer,
  reportOn,
  reports,
  findings,
  tests,
  signatures,
  quotes,
  invoices,
}: {
  jobType: string;
  customer: string | null;
  reportOn: boolean;
  reports: Pick<ReportRow, "template_key" | "status" | "version" | "final_sections" | "sign_off">[];
  findings: number;
  tests: number;
  signatures: Pick<SignatureRow, "purpose" | "signer_name">[];
  quotes: Pick<QuoteRow, "id" | "number" | "status" | "total_cents" | "payments">[];
  invoices: Pick<InvoiceRow, "id" | "number" | "status" | "total_cents" | "amount_paid_cents">[];
}): WrapUpInput {
  const homeowner = reports.filter((r) => r.template_key === "homeowner");
  const draft = homeowner.find((r) => r.status === "draft");
  const sent = homeowner
    .filter((r) => r.status === "sent")
    .sort((a, b) => b.version - a.version)[0];
  return {
    jobType,
    customer,
    reportOn,
    hasDraft: !!draft?.final_sections,
    sentVersion: sent?.version ?? null,
    unsignedReason: sent?.sign_off?.unsigned_reason ?? null,
    findings,
    tests,
    signers: signatures
      .filter((s) => s.purpose !== "work_authorization" && s.purpose !== "quote_acceptance")
      .map((s) => s.signer_name),
    quotes: quotes.map((q) => ({
      id: q.id,
      number: q.number,
      status: q.status,
      total_cents: q.total_cents,
      depositPaid: q.payments.some((p) => p.status === "succeeded"),
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      total_cents: i.total_cents,
      amount_paid_cents: i.amount_paid_cents,
    })),
  };
}
