import type { Cents } from "./money";
import { lineTotal } from "./quote";

// Invoices (BUILD_PLAN 6.4, M9). Item lines are taxed like quote lines: the discount comes
// off before tax, shared between taxable and untaxed lines. Deposit credits come off after
// tax. The database computes the same totals when an invoice is sent
// (app.invoice_totals in 20261012001500_invoices.sql); test/invoice.test.ts and
// supabase/tests/110_invoices.test.sql use the same figures.

export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "void";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partly paid",
  paid: "Paid",
  void: "Void",
};

export interface Invoice {
  id: string;
  company_id: string;
  job_id: string;
  quote_id?: string | null;
  number?: number | null;
  status: InvoiceStatus;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  credit_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  due_date?: string | null;
  notes?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  voided_at?: string | null;
  deleted_at?: string | null;
}

export interface InvoiceLine {
  id?: string;
  kind: "item" | "deposit_credit";
  description?: string;
  quantity: number;
  /** Negative for deposit credits. */
  unit_price_cents: number;
  taxable: boolean;
  sort_order?: number;
  deleted_at?: string | null;
}

export interface InvoiceTotals {
  subtotal_cents: Cents;
  discount_cents: Cents;
  tax_cents: Cents;
  /** Deposits already paid, as a positive amount. */
  credit_cents: Cents;
  total_cents: Cents;
}

function roundCents(n: number): Cents {
  return Math.sign(n) * Math.round(Math.abs(n));
}

export function invoiceTotals(
  lines: InvoiceLine[],
  discountCents: Cents,
  taxRateBps: number,
): InvoiceTotals {
  const live = lines.filter((l) => !l.deleted_at);
  const items = live.filter((l) => l.kind === "item");
  const subtotal = items.reduce((sum, l) => sum + lineTotal(l), 0);
  const taxable = items.filter((l) => l.taxable).reduce((sum, l) => sum + lineTotal(l), 0);
  const credit = live
    .filter((l) => l.kind === "deposit_credit")
    .reduce((sum, l) => sum - lineTotal(l), 0);
  const discount = Math.min(Math.max(0, Math.round(discountCents)), subtotal);
  const taxableDiscount = subtotal === 0 ? 0 : roundCents((discount * taxable) / subtotal);
  const tax = roundCents(((taxable - taxableDiscount) * taxRateBps) / 10_000);
  return {
    subtotal_cents: subtotal,
    discount_cents: discount,
    tax_cents: tax,
    credit_cents: credit,
    total_cents: subtotal - discount + tax - credit,
  };
}

/** What is still owed. */
export function invoiceBalance(i: Pick<Invoice, "total_cents" | "amount_paid_cents">): Cents {
  return Math.max(0, i.total_cents - i.amount_paid_cents);
}

/** The text a tech sends with the invoice link. */
export function invoiceShareText(
  shopName: string,
  link: string,
  reportLink?: string | null,
): string {
  // A monthly invoice in a shop that sends visit reports monthly carries the month's service
  // report too (owner, 2026-10-24: "in hand with the invoice").
  return reportLink
    ? `${shopName}: your invoice and service report. Invoice: ${link} Service report: ${reportLink}`
    : `${shopName}: your invoice. View and pay it here: ${link}`;
}

/** CSV text (RFC 4180): fields with commas, quotes, or line breaks are quoted. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // A leading =, +, -, @, tab, or carriage return could run as a formula in a spreadsheet.
    const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Cents as a plain dollar figure for spreadsheets: 64900 -> "649.00". */
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// The Invoices list (owner, 2026-10-20: "On invoices tab add some filtering and sorting")
// ---------------------------------------------------------------------------

export type InvoiceFilter = "all" | "open" | "overdue" | "draft" | "paid" | "void";
export type InvoiceSort = "newest" | "oldest" | "due" | "balance" | "total" | "customer";

/** The filter pills, in order. "All" first, as the page opens. */
export const INVOICE_FILTERS: { key: InvoiceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
  { key: "draft", label: "Drafts" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
];

/** The sort menu, in order. */
export const INVOICE_SORTS: { key: InvoiceSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "due", label: "Due Date" },
  { key: "balance", label: "Amount Owed" },
  { key: "total", label: "Total" },
  { key: "customer", label: "Customer" },
];

export interface InvoiceListItem {
  number: number | null;
  status: InvoiceStatus;
  total_cents: Cents;
  amount_paid_cents: Cents;
  due_date: string | null;
  sent_at: string | null;
  customer: string | null;
  jobNumber?: number | null;
}

const isOpen = (i: Pick<InvoiceListItem, "status">) =>
  i.status === "sent" || i.status === "partially_paid";

/** Sent and not fully paid, past its due date (YYYY-MM-DD, the shop's today). */
export function invoiceOverdue(i: InvoiceListItem, today: string): boolean {
  return isOpen(i) && !!i.due_date && i.due_date < today;
}

/**
 * The invoices a filter, search, and sort show. Search matches the customer's name or the
 * invoice or job number. Ties keep the newest first (the list comes newest first).
 */
export function filterInvoices<T extends InvoiceListItem>(
  invoices: T[],
  opts: { filter?: string; sort?: string; q?: string; today: string },
): T[] {
  const filter = (INVOICE_FILTERS.find((f) => f.key === opts.filter)?.key ??
    "all") as InvoiceFilter;
  const sort = (INVOICE_SORTS.find((s) => s.key === opts.sort)?.key ?? "newest") as InvoiceSort;
  const q = (opts.q ?? "").trim().toLowerCase().replace(/^#/, "");
  const shown = invoices.filter((i) => {
    if (filter === "open" && !isOpen(i)) return false;
    if (filter === "overdue" && !invoiceOverdue(i, opts.today)) return false;
    if ((filter === "draft" || filter === "paid" || filter === "void") && i.status !== filter)
      return false;
    if (!q) return true;
    return (
      (i.customer ?? "").toLowerCase().includes(q) ||
      (i.number != null && String(i.number) === q) ||
      (i.jobNumber != null && String(i.jobNumber) === q)
    );
  });
  const indexed = shown.map((i, n) => ({ i, n }));
  const by: Record<InvoiceSort, (a: T, b: T) => number> = {
    newest: () => 0,
    oldest: () => 0,
    // Unpaid with the soonest due date first; no due date last.
    due: (a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
    balance: (a, b) => invoiceBalance(b) - invoiceBalance(a),
    total: (a, b) => b.total_cents - a.total_cents,
    customer: (a, b) => (a.customer ?? "￿").localeCompare(b.customer ?? "￿"),
  };
  indexed.sort((x, y) => by[sort](x.i, y.i) || (sort === "oldest" ? y.n - x.n : x.n - y.n));
  return indexed.map((x) => x.i);
}
