/**
 * Autopay and Pay Over Time (docs/design/2026-11-16-autopay.md): the words and rules the
 * website, both apps and the server share. A customer saves a card or bank account with the
 * shop (Stripe keeps it; we keep "Visa •••• 4242"), monthly maintenance invoices are charged
 * to it when they're sent, and failed charges are tried again on the shop's schedule.
 */

import { formatCents } from "./money";
import { addDays } from "./office";
import type { NotificationText } from "./notifications";
import { bpsToPercent, cardFeeCents } from "./settings";

// ---------------------------------------------------------------------------
// A saved card or bank account
// ---------------------------------------------------------------------------

export interface SavedMethod {
  kind: string;
  brand?: string | null;
  last4: string;
  exp_month?: number | null;
  exp_year?: number | null;
  bank_name?: string | null;
}

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

/** "Visa •••• 4242", "Chase •••• 6789", "Bank account •••• 6789" (SQL payment_method_label). */
export function savedMethodLabel(m: SavedMethod): string {
  if (m.kind === "card")
    return `${BRANDS[(m.brand ?? "").toLowerCase()] ?? "Card"} •••• ${m.last4}`;
  return `${m.bank_name?.trim() || "Bank account"} •••• ${m.last4}`;
}

/** Whether a card's expiry month is before `today` (YYYY-MM-DD). Bank accounts don't expire. */
export function savedMethodExpired(m: SavedMethod, today: string): boolean {
  if (m.kind !== "card" || !m.exp_month || !m.exp_year) return false;
  const [y, mo] = today.split("-").map(Number);
  return m.exp_year < y! || (m.exp_year === y && m.exp_month < mo!);
}

/** The line under the label: "Expires 04/30", "Expired 04/24", or "Bank account". */
export function savedMethodDetail(m: SavedMethod, today: string): string {
  if (m.kind !== "card") return "Bank account";
  if (!m.exp_month || !m.exp_year) return "Card";
  const when = `${String(m.exp_month).padStart(2, "0")}/${String(m.exp_year % 100).padStart(2, "0")}`;
  return `${savedMethodExpired(m, today) ? "Expired" : "Expires"} ${when}`;
}

// ---------------------------------------------------------------------------
// Settings › Payments and Deposits
// ---------------------------------------------------------------------------

export interface AutopaySettings {
  /** The shop offers autopay (settings.autopay, default on). */
  on: boolean;
  /** Tries after the first that failed: 0 (off) to 3 (settings.autopay_retries, default 2). */
  retries: number;
  /** Days between tries, 1 to 14 (settings.autopay_retry_days, default 3). */
  retryDays: number;
}

export const AUTOPAY_DEFAULTS: AutopaySettings = { on: true, retries: 2, retryDays: 3 };

export function autopaySettings(settings: unknown): AutopaySettings {
  const s = (settings ?? {}) as Record<string, unknown>;
  const retries = Number(s.autopay_retries);
  const days = Number(s.autopay_retry_days);
  return {
    on: s.autopay !== false,
    retries:
      Number.isInteger(retries) && retries >= 0 && retries <= 3
        ? retries
        : AUTOPAY_DEFAULTS.retries,
    retryDays:
      Number.isInteger(days) && days >= 1 && days <= 14 ? days : AUTOPAY_DEFAULTS.retryDays,
  };
}

/** Offer Pay Over Time (settings.pay_over_time, default on; only works once Stripe has it on). */
export function payOverTimeOn(settings: unknown): boolean {
  return (settings as { pay_over_time?: unknown } | null)?.pay_over_time !== false;
}

/** Retry Failed Payments: Off, or 1 to 3 more tries. */
export const AUTOPAY_RETRY_CHOICES: { value: number; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 1, label: "1 More Try" },
  { value: 2, label: "2 More Tries" },
  { value: 3, label: "3 More Tries" },
];

/** How far apart the tries are. */
export const AUTOPAY_RETRY_DAY_CHOICES: { value: number; label: string }[] = [1, 2, 3, 5, 7].map(
  (d) => ({ value: d, label: d === 1 ? "Every Day" : `Every ${d} Days` }),
);

/**
 * The next try after a failed one, or null when there are no more: `triesMade` counts every
 * try so far, the failed one included.
 */
export function autopayNextTry(
  today: string,
  triesMade: number,
  s: AutopaySettings,
): string | null {
  return triesMade <= s.retries ? addDays(today, s.retryDays) : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 19" from YYYY-MM-DD. */
export function autopayDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

export const AUTOPAY_TEXT = {
  group: "Autopay",
  shopSwitch: "Autopay",
  shopFooter:
    "Customers can save a card or bank account and have their monthly maintenance invoices paid the day they’re sent. Other invoices are charged only when you tap Charge Card on File.",
  retries: "Retry Failed Payments",
  retryEvery: "Try Again",
  retriesFooter:
    "When an automatic payment fails, the customer gets an email with their pay link and owners and admins are notified. The card is tried again on this schedule.",
  payOverTime: "Offer Pay Over Time",
  payOverTimeFooter:
    "Customers can pay quote deposits and invoices of $50 or more with Affirm or Klarna. You’re paid in full; they pay Affirm or Klarna back over time.",
  status: "Status",
  on: "On",
  off: "Off",
  turnOff: "Turn Off Autopay",
  turnOn: "Turn On Autopay",
  request: "Request Card on File",
  remove: "Remove Card",
  charge: "Charge Card on File",
  noMethod: "No card or bank account on file",
  saveForAutopay: "Save for Autopay",
  requestTitle: "Request Card on File",
  removeTitle: "Remove the saved card?",
  removeMessage:
    "The customer’s card or bank account is removed and autopay turns off. Payments already made aren’t changed.",
  turnOffTitle: "Turn off autopay?",
  turnOffMessage:
    "Invoices are no longer charged automatically. The card stays saved for Charge Card on File.",
} as const;

/** The Autopay group's Status row: "On" with the method, or "Off". */
export function autopayStatus(
  customerAutopay: boolean,
  method: SavedMethod | null,
): { value: string; method: string } {
  if (!method) return { value: AUTOPAY_TEXT.off, method: AUTOPAY_TEXT.noMethod };
  return {
    value: customerAutopay ? AUTOPAY_TEXT.on : AUTOPAY_TEXT.off,
    method: savedMethodLabel(method),
  };
}

/** The line under the Autopay group. */
export function autopayGroupFooter(
  shopOn: boolean,
  customerAutopay: boolean,
  method: SavedMethod | null,
): string {
  if (!shopOn)
    return "Autopay is off for your shop. Turn it on in Settings › Payments and Deposits.";
  if (method && customerAutopay)
    return "Monthly maintenance invoices are charged to this card the day they’re sent. Other invoices: Charge Card on File on the invoice.";
  if (method)
    return "Saved, but not charged automatically. Charge Card on File on an invoice charges it once.";
  return "Send a link so the customer can save a card or bank account. Nothing is charged until an invoice is sent.";
}

// ---------------------------------------------------------------------------
// An invoice's automatic charge
// ---------------------------------------------------------------------------

export interface AutopayInvoice {
  autopay_status?: string | null;
  autopay_method?: string | null;
  autopay_failure?: string | null;
  autopay_next_try?: string | null;
}

/** The office's line on an invoice: "Paid automatically with Visa •••• 4242", or the failure. */
export function autopayInvoiceLine(inv: AutopayInvoice): string | null {
  const method = inv.autopay_method?.trim() || "the saved card";
  switch (inv.autopay_status) {
    case "succeeded":
      return `Paid automatically with ${method}`;
    case "processing":
      return `Charged to ${method}; the bank payment is processing`;
    case "failed": {
      const why = inv.autopay_failure?.trim();
      const next = inv.autopay_next_try
        ? ` Trying again ${autopayDay(inv.autopay_next_try)}.`
        : " No more tries.";
      return `Autopay failed${why ? `: ${why.replace(/\.?$/, ".")}` : "."}${next}`;
    }
    default:
      return null;
  }
}

/** The customer's invoice page. */
export function customerAutopayLine(inv: AutopayInvoice): string | null {
  const method = inv.autopay_method?.trim() || "your saved card";
  switch (inv.autopay_status) {
    case "succeeded":
      return `Paid automatically with ${method}.`;
    case "processing":
      return `Your automatic bank payment from ${method} is processing. There’s nothing more to do.`;
    case "failed":
      return `Autopay failed: we couldn’t charge ${method}. Please pay below.`;
    default:
      return null;
  }
}

/** Charge Card on File's confirmation: the title, what happens, and the button. */
export function chargeConfirm(input: {
  method: SavedMethod;
  balanceCents: number;
  feeBps: number;
  customer: string;
}): { title: string; message: string; confirm: string; totalCents: number; feeCents: number } {
  const label = savedMethodLabel(input.method);
  const feeCents =
    input.method.kind === "card" ? cardFeeCents(input.balanceCents, input.feeBps) : 0;
  const totalCents = input.balanceCents + feeCents;
  const fee = feeCents
    ? ` That includes the ${bpsToPercent(input.feeBps)}% card fee (${formatCents(feeCents)}).`
    : "";
  return {
    title: `Charge ${label}?`,
    message: `${input.customer} is charged ${formatCents(totalCents)} now.${fee}${input.method.kind === "card" ? "" : " Bank payments take a few business days to clear."}`,
    confirm: `Charge ${formatCents(totalCents)}`,
    totalCents,
    feeCents,
  };
}

/** What the customer agrees to when saving (invoice page and Request Card on File page). */
export function autopayConsent(shop: string, feeBps: number): string {
  const fee = feeBps
    ? ` Card payments include a ${bpsToPercent(feeBps)}% card fee; bank account payments have none.`
    : "";
  return `I authorize ${shop} to save this card or bank account with Stripe and charge it for my invoices when they’re sent, until I ask ${shop} to stop.${fee}`;
}

/** The text or email body that asks for a card on file. */
export function cardRequestMessage(shop: string, link: string): string {
  return `${shop} asks you to save a card or bank account for automatic payments. It’s secure, through Stripe: ${link}`;
}

/** Owners and admins: an automatic payment didn't go through. */
export function autopayFailedNotification(
  customer: string,
  amountCents: number,
  invoiceNumber: number | null,
  reason: string | null,
): NotificationText {
  const what = invoiceNumber ? `invoice ${invoiceNumber}` : "an invoice";
  return {
    title: "Autopay failed",
    body: `${customer}’s ${formatCents(amountCents)} payment (${what}) didn’t go through${reason ? `: ${reason.replace(/\.?$/, ".")}` : "."}`,
  };
}

// ---------------------------------------------------------------------------
// Pay Over Time (Affirm and Klarna in Checkout)
// ---------------------------------------------------------------------------

export type PayLaterMethod = "affirm" | "klarna";

/** What Affirm and Klarna take in the US, in cents. */
export const PAY_OVER_TIME_LIMITS: Record<PayLaterMethod, { min: number; max: number }> = {
  affirm: { min: 5_000, max: 3_000_000 },
  klarna: { min: 5_000, max: 1_000_000 },
};

/** The methods to offer for an amount, of those active on the shop's Stripe account. */
export function payOverTimeMethods(
  amountCents: number,
  active: { affirm: boolean; klarna: boolean },
): PayLaterMethod[] {
  return (["affirm", "klarna"] as const).filter(
    (m) =>
      active[m] &&
      amountCents >= PAY_OVER_TIME_LIMITS[m].min &&
      amountCents <= PAY_OVER_TIME_LIMITS[m].max,
  );
}

const PAY_LATER_NAMES: Record<PayLaterMethod, string> = { affirm: "Affirm", klarna: "Klarna" };

/** "Pay over time with Affirm or Klarna", or null with neither. */
export function payOverTimeLine(methods: PayLaterMethod[]): string | null {
  if (methods.length === 0) return null;
  return `Pay over time with ${methods.map((m) => PAY_LATER_NAMES[m]).join(" or ")}`;
}

/** The button when the shop's card fee splits card and bank: no fee on Affirm or Klarna. */
export function payOverTimeButton(amountCents: number, what = ""): string {
  return `Pay ${formatCents(amountCents)}${what} Over Time`;
}

/** Settings › Payments and Deposits: whether Affirm and Klarna work, and how to turn them on. */
export function payOverTimeStatus(
  on: boolean,
  active: { affirm: boolean; klarna: boolean } | null,
): string {
  if (!on) return "Off. Customers pay by card or bank account.";
  if (!active) return "Affirm and Klarna can be offered once your Stripe account is connected.";
  if (active.affirm && active.klarna) return "Affirm and Klarna are on in your Stripe account.";
  const how =
    "In your Stripe Dashboard, open Settings › Payment methods and turn on Affirm and Klarna; they show here once Stripe approves them.";
  if (active.affirm) return `Affirm is on. Klarna isn’t yet. ${how}`;
  if (active.klarna) return `Klarna is on. Affirm isn’t yet. ${how}`;
  return `Affirm and Klarna aren’t on in your Stripe account yet. ${how}`;
}
