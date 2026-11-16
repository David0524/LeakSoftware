import { useMemo } from "react";
import {
  friendlyError,
  invoiceTotals,
  type BillingMonth,
  type MonthBilling,
  type MonthBillingInvoice,
  type SendAllResult,
} from "@leakbook/core";
import { getServices } from "../lib/services";
import { useRows } from "./hooks";
import { call } from "./reports";

// Monthly Billing (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md), owners and
// admins: Invoices › Monthly Billing and a month's page, from the server (billing_months,
// month_billing, create_monthly_invoices), and Send All through the website's
// /api/invoices/month/{month}/send with the person's sign-in, as the iPhone. A draft's lines are
// synced rows, so Add Charge and Remove on the month's page are written on the phone and the
// page shows them at once.

/** What the month's page and Send All say when there's no connection. */
export const BILLING_OFFLINE = "Sending needs a connection. Try again when you have signal.";
const LOAD_OFFLINE = "Monthly Billing needs a connection. Try again when you have signal.";

const NO_CONNECTION = "No connection. Try again when you have signal.";

/** "2026-10-01" (a month's first day), else null. */
export function validMonth(month: string | undefined | null): string | null {
  return month && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(month) ? month : null;
}

function loadError(message: string): string {
  return /network request failed|failed to fetch|fetch failed|networkerror/i.test(message)
    ? LOAD_OFFLINE
    : friendlyError(message);
}

/** Invoices › Monthly Billing: a row per month with drafts to send or customers not invoiced. */
export async function loadBillingMonths(companyId: string): Promise<BillingMonth[]> {
  const { data, error } = await getServices().supabase.rpc("billing_months", {
    target_company: companyId,
  });
  if (error) throw new Error(loadError(error.message));
  return (data ?? []) as BillingMonth[];
}

/** A month's page. */
export async function loadMonthBilling(companyId: string, month: string): Promise<MonthBilling> {
  const { data, error } = await getServices().supabase.rpc("month_billing", {
    target_company: companyId,
    month,
  });
  if (error) throw new Error(loadError(error.message));
  return data as MonthBilling;
}

/** Create Invoices: the month's drafts for everyone not invoiced yet, whatever their day. */
export async function createMonthInvoices(companyId: string, month: string): Promise<string> {
  const { data, error } = await getServices().supabase.rpc("create_monthly_invoices", {
    target_company: companyId,
    month,
  });
  if (error) throw new Error(loadError(error.message));
  const n = Number(data ?? 0);
  return n === 1 ? "1 invoice ready to send." : `${n} invoices ready to send.`;
}

/** Send All: the month's drafts, each by email or text, on the server. */
export async function sendMonthInvoices(companyId: string, month: string): Promise<SendAllResult> {
  try {
    return await call<SendAllResult>(`/api/invoices/month/${month}/send`, {
      company_id: companyId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(message === NO_CONNECTION ? BILLING_OFFLINE : message);
  }
}

interface LocalInvoice {
  id: string;
  status: string;
  discount_cents?: number | null;
}

interface LocalLine {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number | string;
  unit_price_cents: number;
  unit?: string | null;
  kind: "item" | "deposit_credit";
  taxable: boolean;
  sort_order?: number | null;
}

/**
 * The month's drafts with the lines on this phone: a line added or removed here shows at once,
 * before the server has it. A draft whose invoice isn't on the phone yet keeps the server's.
 */
export function withLocalLines(
  billing: MonthBilling,
  invoices: LocalInvoice[],
  lines: LocalLine[],
  taxRateBps: number,
): MonthBilling {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  return {
    ...billing,
    invoices: billing.invoices.map((inv): MonthBillingInvoice => {
      const local = byId.get(inv.id);
      if (inv.status !== "draft" || !local || local.status !== "draft") return inv;
      const mine = lines
        .filter((l) => l.invoice_id === inv.id)
        .map((l) => ({ ...l, quantity: Number(l.quantity), sort_order: Number(l.sort_order ?? 0) }))
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
      return {
        ...inv,
        lines: mine.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: l.quantity,
          unit_price_cents: l.unit_price_cents,
          unit: l.unit ?? null,
          kind: l.kind,
          taxable: l.taxable,
        })),
        total_cents: invoiceTotals(mine, local.discount_cents ?? 0, taxRateBps).total_cents,
      };
    }),
  };
}

export function useLocalMonthBilling(
  companyId: string,
  billing: MonthBilling | null,
  taxRateBps: number,
): MonthBilling | null {
  const invoices = useRows<LocalInvoice>("invoice", companyId);
  const lines = useRows<LocalLine>("invoice_line_item", companyId);
  return useMemo(
    () => (billing ? withLocalLines(billing, invoices, lines, taxRateBps) : null),
    [billing, invoices, lines, taxRateBps],
  );
}
