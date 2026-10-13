import { useMemo } from "react";
import type { Invoice, InvoiceLine } from "@leakbook/core";
import { getServices } from "../lib/services";
import { useRows } from "./hooks";
import { ReportServerError, call } from "./reports";

export interface InvoiceLineRow extends InvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  sort_order: number;
}

interface PaymentRow {
  id: string;
  invoice_id: string | null;
  amount_cents: number;
  method: string;
  status: string;
  paid_at: string | null;
}

interface ShareLinkRow {
  token: string;
  invoice_id: string | null;
  revoked_at: string | null;
}

/** The job's invoices (newest first) with lines, payments, and the customer link token. */
export function useJobInvoices(companyId: string, jobId: string) {
  const invoices = useRows<Invoice>("invoice", companyId);
  const lines = useRows<InvoiceLineRow>("invoice_line_item", companyId);
  const payments = useRows<PaymentRow>("payment", companyId);
  const links = useRows<ShareLinkRow>("share_link", companyId);
  return useMemo(
    () =>
      invoices
        .filter((i) => i.job_id === jobId)
        .sort((a, b) => (b.number ?? Infinity) - (a.number ?? Infinity) || b.id.localeCompare(a.id))
        .map((i) => ({
          ...i,
          lines: lines
            .filter((l) => l.invoice_id === i.id)
            .map((l) => ({ ...l, quantity: Number(l.quantity) }))
            .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
          payments: payments.filter((p) => p.invoice_id === i.id),
          token: links.find((l) => l.invoice_id === i.id && !l.revoked_at)?.token ?? null,
        })),
    [invoices, lines, payments, links, jobId],
  );
}

export type JobInvoice = ReturnType<typeof useJobInvoices>[number];

/** The server builds the invoice from the job (fee, accepted quote, deposit); it syncs down. */
export async function createJobInvoice(jobId: string): Promise<string> {
  const { sync } = getServices();
  await sync.syncNow();
  const r = await call<{ invoiceId: string }>(`/api/jobs/${jobId}/invoice`, {});
  await sync.syncNow();
  return r.invoiceId;
}

/** Sends the invoice by email, or for the tech to text; returns the link and message. */
export async function sendJobInvoice(
  invoiceId: string,
  channel: "email" | "sms_device",
  to: string | null,
) {
  const { sync } = getServices();
  await sync.syncNow();
  if (sync.hasPendingWrites("invoice", invoiceId))
    throw new ReportServerError(
      "Your changes haven’t reached the server yet. Try again with signal.",
    );
  const r = await call<{ link: string; message: string; status: string; emailed: boolean }>(
    `/api/invoices/${invoiceId}/send`,
    { channel, to },
  );
  await sync.syncNow();
  return r;
}
