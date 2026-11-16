/**
 * Monthly billing (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md): charges on a
 * visit, each customer's invoice day, and Send All. One wording for all four platforms (the
 * iPhone app checks its Swift copy against the `monthly-billing` fixtures).
 */
import { formatCents, type Cents } from "./money";

// ---------------------------------------------------------------------------
// Invoice day
// ---------------------------------------------------------------------------

/** Days a monthly invoice can be drafted on: 1 to 28, so every month has them. */
export const INVOICE_DAYS: readonly number[] = Array.from({ length: 28 }, (_, i) => i + 1);

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinalDay(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** The shop's invoice day from its settings (1 to 28), else the 1st. */
export function shopInvoiceDay(settings: Record<string, unknown> | null | undefined): number {
  const raw = Number(settings?.invoice_day);
  return Number.isInteger(raw) && raw >= 1 && raw <= 28 ? raw : 1;
}

/** A day typed or chosen (a string from a form): 1 to 28, else null (the shop's default). */
export function parseInvoiceDay(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = Number(input);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : null;
}

/** A plan's Invoice Day choice: "Shop Default (1st)" or "15th". */
export function planInvoiceDayLabel(day: number | null | undefined, shopDay: number): string {
  return day ? ordinalDay(day) : `Shop Default (${ordinalDay(shopDay)})`;
}

export const INVOICE_DAY_FOOTER =
  "Each customer’s invoice for the month is drafted on this day of the next month, ready to review and send. A plan can use its own day.";

export const PLAN_INVOICE_DAY_FOOTER =
  "The day of the next month this customer’s monthly invoice is drafted.";

// ---------------------------------------------------------------------------
// Charges on a visit
// ---------------------------------------------------------------------------

export interface VisitCharge {
  id: string;
  job_id: string;
  price_book_item_id?: string | null;
  name: string;
  quantity: number;
  unit_price_cents: Cents;
  taxable?: boolean;
  billed_invoice_id?: string | null;
  added_at?: string;
  deleted_at?: string | null;
}

/** A charge's amount: quantity × price, in cents (as the database totals a line). */
export function chargeCents(c: { quantity: number; unit_price_cents: Cents }): Cents {
  return Math.round((Math.round(Number(c.quantity) * 100) * c.unit_price_cents) / 100);
}

/** "1 × $24.00", "2.5 × $8.00". */
export function chargeDetail(c: { quantity: number; unit_price_cents: Cents }): string {
  const q = Number(c.quantity);
  return `${Number.isInteger(q) ? q : q.toFixed(2).replace(/0$/, "")} × ${formatCents(c.unit_price_cents)}`;
}

/**
 * The price book items Add Charge offers: services and parts, not chemicals (those are added
 * under Chemicals), in the book's order.
 */
export function chargeItems<
  T extends { category?: string | null; chemical?: string | null; deleted_at?: string | null },
>(items: T[]): T[] {
  return items.filter((i) => !i.deleted_at && !i.chemical && i.category !== "Chemicals");
}

/** The Charges footer: where they're billed, or that they're on a sent invoice. */
export function chargesFooter(opts: {
  firstName: string;
  month: string;
  sentInvoice?: { number: number | null; sentOn: string } | null;
}): string {
  if (opts.sentInvoice)
    return `On invoice${opts.sentInvoice.number ? ` #${opts.sentInvoice.number}` : ""}, sent ${opts.sentInvoice.sentOn}.`;
  return `Billed on ${opts.firstName}’s ${opts.month} invoice.`;
}

export const CHARGE_LOCKED = "This charge is on a sent invoice. Change the invoice instead.";

// ---------------------------------------------------------------------------
// Monthly Billing
// ---------------------------------------------------------------------------

/** A row on Invoices › Monthly Billing (public.billing_months). */
export interface BillingMonth {
  month: string;
  drafts: number;
  draft_total_cents: Cents;
  sent: number;
  not_invoiced: number;
  current: boolean;
}

export interface MonthBillingLine {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: Cents;
  unit?: string | null;
  kind: string;
  taxable: boolean;
}

export interface MonthBillingInvoice {
  id: string;
  number: number | null;
  status: string;
  job_id: string;
  customer_id: string;
  customer: string;
  email: string | null;
  phone: string | null;
  total_cents: Cents;
  amount_paid_cents: Cents;
  sent_at: string | null;
  due_date: string | null;
  lines: MonthBillingLine[];
}

/** A month's page (public.month_billing). */
export interface MonthBilling {
  month: string;
  invoices: MonthBillingInvoice[];
  not_invoiced: number;
  waiting: { date: string; customers: number }[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "October 2026" for "2026-10-01". */
export function billingMonthName(month: string, withYear = true): string {
  const [y, m] = month.split("-").map(Number);
  const name = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][(m ?? 1) - 1];
  return withYear ? `${name} ${y}` : name!;
}

/** A Monthly Billing row's detail: "38 to send · $5,912.00 · 3 customers not invoiced yet". */
export function billingMonthDetail(m: BillingMonth): string {
  const parts: string[] = [];
  if (m.drafts > 0) parts.push(`${m.drafts} to send · ${formatCents(m.draft_total_cents)}`);
  if (m.not_invoiced > 0)
    parts.push(
      m.not_invoiced === 1
        ? "1 customer not invoiced yet"
        : `${m.not_invoiced} customers not invoiced yet`,
    );
  if (m.current) parts.push("so far");
  return parts.join(" · ");
}

/** How a draft will go when sent with Send All. */
export type SendRoute =
  { channel: "email"; to: string } | { channel: "text"; to: string } | { channel: "none" };

/** Email first; a text from the shop's number when there's no email and the shop texts. */
export function sendRoute(
  inv: { email: string | null; phone: string | null },
  texting: boolean,
): SendRoute {
  const email = inv.email?.trim();
  if (email && /^\S+@\S+\.\S+$/.test(email)) return { channel: "email", to: email };
  const phone = inv.phone?.trim();
  if (texting && phone && phone.replace(/\D/g, "").length >= 10)
    return { channel: "text", to: phone };
  return { channel: "none" };
}

export const NO_WAY_TO_SEND = "No email or mobile number";

/** A To Send row's "how it goes" line. */
export function sendRouteLabel(route: SendRoute): string {
  if (route.channel === "email") return route.to;
  if (route.channel === "text") return `Text ${route.to}`;
  return NO_WAY_TO_SEND;
}

/** A draft's lines in one short line: "Pool service · Replace skimmer basket · 1 more". */
export function linesSummary(lines: { description: string; kind?: string }[], shown = 2): string {
  const items = lines.filter((l) => l.kind !== "deposit_credit");
  if (items.length === 0) return "No lines yet";
  // "Pool service, October" reads as "Pool service"; "Replace skimmer basket, Oct 14" as its name.
  const names = items.map((l) => l.description.replace(/, [^,]*$/, ""));
  const head = names.slice(0, shown).join(" · ");
  return items.length > shown ? `${head} · ${items.length - shown} more` : head;
}

/** The page's subtitle: "38 to send · $5,912.00", or "All sent" when nothing waits. */
export function monthBillingSubtitle(b: MonthBilling): string {
  const drafts = b.invoices.filter((i) => i.status === "draft");
  if (drafts.length === 0) return b.invoices.length ? "All sent" : "Nothing to send yet";
  return `${drafts.length} to send · ${formatCents(drafts.reduce((s, i) => s + i.total_cents, 0))}`;
}

/** The not-invoiced card: "3 customers aren’t invoiced yet." with who waits for their day. */
export function notInvoicedText(
  b: MonthBilling,
  formatDate: (iso: string) => string,
): string | null {
  if (b.not_invoiced === 0) return null;
  const head =
    b.not_invoiced === 1
      ? "1 customer has visits not on an invoice yet."
      : `${b.not_invoiced} customers have visits not on an invoice yet.`;
  const waiting = b.waiting.reduce((n, w) => n + w.customers, 0);
  const waits =
    b.waiting.length === 1 && waiting === b.not_invoiced
      ? `${b.not_invoiced === 1 ? "It’s" : "They’re"} billed on their invoice day, ${formatDate(b.waiting[0]!.date)}.`
      : b.waiting
          .map(
            (w) =>
              `${w.customers === 1 ? "1 is" : `${w.customers} are`} billed on their invoice day, ${formatDate(w.date)}.`,
          )
          .join(" ");
  const now = waiting ? " Create Invoices drafts them now." : "";
  return waits ? `${head} ${waits}${now}` : head;
}

/** Send All's button: "Send 38 Invoices". */
export function sendAllLabel(n: number): string {
  return n === 1 ? "Send 1 Invoice" : `Send ${n} Invoices`;
}

export const SEND_ALL_FOOTER =
  "Each goes by email, or by text from your shop’s number when there’s no email. Customers without either stay here.";

/** Send All's alert. */
export function sendAllConfirm(
  routes: SendRoute[],
  monthName: string,
): { title: string; message: string } {
  const email = routes.filter((r) => r.channel === "email").length;
  const text = routes.filter((r) => r.channel === "text").length;
  const none = routes.length - email - text;
  const n = email + text;
  const how = [email ? `${email} by email` : null, text ? `${text} by text` : null]
    .filter(Boolean)
    .join(", ");
  const stays = none
    ? ` ${none === 1 ? "1 without an email or mobile number stays a draft" : `${none} without an email or mobile number stay drafts`}.`
    : "";
  return {
    title: n === 1 ? "Send 1 invoice?" : `Send ${n} invoices?`,
    message: `Each customer gets their ${monthName} invoice now: ${how}.${stays}`,
  };
}

/** After Send All: "Sent 38 invoices." or "Sent 36 invoices. 2 didn’t go." */
export function sendAllResult(sent: number, failed: number): string {
  const head = `Sent ${plural(sent, "invoice")}.`;
  return failed ? `${head} ${failed} didn’t go.` : head;
}

/** What Send All returns, on every platform (POST /api/invoices/month/{month}/send). */
export interface SendAllResult {
  sent: number;
  failed: { id: string; customer: string; reason: string }[];
  message: string;
}
