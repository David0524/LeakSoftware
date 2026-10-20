import { File, Paths } from "expo-file-system";
import { useMemo } from "react";
import { Platform, Share } from "react-native";
import {
  INVOICE_STATUS_LABELS,
  centsToDollars,
  toCsv,
  type Invoice,
  type InvoiceStatus,
} from "@leakbook/core";
import { useRows } from "./hooks";
import type { JobView } from "./jobs";

// Invoices (spec 5.10) from synced rows: the list, what's owed, and the website's two CSV
// exports, built on the phone and handed to the share sheet (spec 9: no downloads in apps).

export type InvoiceListRow = Omit<Invoice, "number" | "due_date" | "sent_at"> & {
  number: number | null;
  due_date: string | null;
  sent_at: string | null;
  period_month?: string | null;
  created_at?: string | null;
  jobNumber: number | null;
  customer: string | null;
};

export function useInvoiceList(companyId: string, jobs: JobView[]): InvoiceListRow[] {
  const invoices = useRows<Invoice & { period_month?: string | null; created_at?: string | null }>(
    "invoice",
    companyId,
  );
  return useMemo(() => {
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return invoices
      .filter((i) => !i.deleted_at)
      .sort(
        (a, b) =>
          (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
          (b.number ?? 0) - (a.number ?? 0),
      )
      .map((i) => ({
        ...i,
        number: i.number ?? null,
        due_date: i.due_date ?? null,
        sent_at: i.sent_at ?? null,
        jobNumber: byId.get(i.job_id)?.number ?? null,
        customer: byId.get(i.job_id)?.customer?.name ?? null,
      }));
  }, [invoices, jobs]);
}

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

export function invoicesCsv(list: InvoiceListRow[]): string {
  return toCsv([
    [
      "Invoice",
      "Job",
      "Customer",
      "Status",
      "Sent",
      "Due",
      "Paid on",
      "Subtotal",
      "Discount",
      "Tax",
      "Deposit credit",
      "Total",
      "Paid",
      "Balance",
    ],
    ...list
      .filter((i) => i.status !== "draft")
      .map((i) => [
        i.number,
        i.jobNumber,
        i.customer,
        INVOICE_STATUS_LABELS[i.status as InvoiceStatus],
        day(i.sent_at),
        i.due_date ?? "",
        day(i.paid_at),
        centsToDollars(i.subtotal_cents ?? 0),
        centsToDollars(i.discount_cents ?? 0),
        centsToDollars(i.tax_cents ?? 0),
        centsToDollars(i.credit_cents ?? 0),
        centsToDollars(i.total_cents),
        centsToDollars(i.amount_paid_cents),
        centsToDollars(i.status === "void" ? 0 : Math.max(0, i.total_cents - i.amount_paid_cents)),
      ]),
  ]);
}

export interface PaymentRow {
  created_at?: string | null;
  paid_at: string | null;
  invoice_id: string | null;
  quote_id: string | null;
  amount_cents: number;
  method: string;
  status: string;
  stripe_payment_intent_id?: string | null;
  deleted_at?: string | null;
}

export function paymentsCsv(
  payments: PaymentRow[],
  invoiceNumbers: Map<string, number | null | undefined>,
  quoteNumbers: Map<string, number | null | undefined>,
): string {
  const method: Record<string, string> = { card: "Card", ach: "Bank (ACH)", other: "Recorded" };
  return toCsv([
    ["Date", "For", "Number", "Amount", "Method", "Status", "Stripe payment"],
    ...payments
      .filter((p) => !p.deleted_at)
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
      .map((p) => [
        day(p.paid_at ?? p.created_at),
        p.invoice_id ? "Invoice" : "Quote deposit",
        p.invoice_id
          ? (invoiceNumbers.get(p.invoice_id) ?? "")
          : p.quote_id
            ? (quoteNumbers.get(p.quote_id) ?? "")
            : "",
        centsToDollars(p.amount_cents),
        method[p.method] ?? p.method,
        p.status,
        p.stripe_payment_intent_id ?? "",
      ]),
  ]);
}

/** Save the CSV in the app's cache and open the share sheet with it. */
export async function shareCsv(kind: "invoices" | "payments", csv: string) {
  const name = `leakbook-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  if (Platform.OS === "ios") {
    const file = new File(Paths.cache, name);
    if (file.exists) file.delete();
    file.create();
    file.write(csv);
    await Share.share({ url: file.uri, title: name });
    return;
  }
  // Android's share sheet takes text; the CSV goes as the message.
  await Share.share({ title: name, message: csv });
}
