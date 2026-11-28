/**
 * Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check"). When the shop
 * records a payment it says how it was paid (Cash, Check with an optional number, or Other), and
 * can send the customer a receipt right away, by email or (with a company number) by text, or
 * later from the invoice. The receipt is the invoice's own page: its payments and what's left.
 * One set of words for the website and both apps (ported to Swift with fixtures).
 */

import { formatCents, type Cents } from "./money";
import { formatPhone, toE164 } from "./texting";

/** How a payment the shop records was paid. */
export type ManualPaymentMethod = "cash" | "check" | "other";

/** Record Payment's segmented control, in this order; Cash to start. */
export const PAYMENT_METHOD_CHOICES: readonly { value: ManualPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other" },
];
export const PAYMENT_METHOD_LABEL = "Paid by";
export const CHECK_NUMBER_LABEL = "Check number";
export const CHECK_NUMBER_HINT = "Optional. It shows on the receipt.";
/** The most a check number can be, as the database keeps it. */
export const CHECK_NUMBER_MAX = 20;

/** "#1234 " -> "1234"; nothing typed -> null. */
export function cleanCheckNumber(text: string | null | undefined): string | null {
  const s = (text ?? "").trim().replace(/^#+/, "").trim();
  return s ? s : null;
}

export function checkNumberError(text: string | null | undefined): string | null {
  const s = cleanCheckNumber(text);
  return s && s.length > CHECK_NUMBER_MAX
    ? `Enter a check number up to ${CHECK_NUMBER_MAX} characters.`
    : null;
}

/**
 * How a payment was made, for the customer (the receipt): "Cash", "Check #1234", "Card",
 * "Bank account", "Other payment". The office's lists say "Bank" and "Recorded by the office".
 */
export function paymentMethodLabel(
  method: string,
  checkNumber?: string | null,
  audience: "customer" | "office" = "customer",
): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "check": {
      const n = cleanCheckNumber(checkNumber);
      return n ? `Check #${n}` : "Check";
    }
    case "card":
      return "Card";
    case "ach":
      return audience === "office" ? "Bank" : "Bank account";
    case "other":
      return audience === "office" ? "Recorded by the office" : "Other payment";
    default:
      return method;
  }
}

/** A payment as the apps and website have it. */
export interface ReceiptPayment {
  id: string;
  amount_cents: Cents;
  method: string;
  check_number?: string | null;
  status: string;
  paid_at: string | null;
  /**
   * The card fee charged with it (owner, 2026-11-24: customers see it on the receipt). The shop
   * keeps it; it's never part of amount_cents. Missing or null: none known.
   */
  fee_cents?: Cents | null;
}

/** The card fee's label on the receipt and the invoice's payment lines. */
export const CARD_FEE_LABEL = "Card fee";

/** What the customer was charged for a payment: the payment and its card fee. */
export function chargedCents(p: Pick<ReceiptPayment, "amount_cents" | "fee_cents">): Cents {
  return p.amount_cents + Math.max(p.fee_cents ?? 0, 0);
}

/** "Card fee $0.03" for the invoice's payment lines, or null without a fee. */
export function cardFeeText(p: Pick<ReceiptPayment, "fee_cents">): string | null {
  const fee = p.fee_cents ?? 0;
  return fee > 0 ? `${CARD_FEE_LABEL} ${formatCents(fee)}` : null;
}

/** "Card" or "Card, including a $0.03 card fee": how a payment was made, for the customer. */
function paidWith(p: Pick<ReceiptPayment, "method" | "check_number" | "fee_cents">): string {
  const fee = p.fee_cents ?? 0;
  const how = paymentMethodLabel(p.method, p.check_number);
  return fee > 0 ? `${how}, including a ${formatCents(fee)} card fee` : how;
}

/** What a receipt says about its invoice. */
export interface ReceiptInvoice {
  number: number | null;
  status: string;
  total_cents: Cents;
  amount_paid_cents: Cents;
}

/** The payment a receipt is for when none is named: the latest received one. */
export function latestReceiptPayment<P extends ReceiptPayment>(payments: readonly P[]): P | null {
  let best: P | null = null;
  for (const p of payments) {
    if (p.status !== "succeeded") continue;
    if (!best || (p.paid_at ?? "") >= (best.paid_at ?? "")) best = p;
  }
  return best;
}

/**
 * Record Payment shows to anyone on the team, techs too (owner, 2026-10-22: "Techs should be
 * able to record payments"), on a sent invoice (not a draft, not void) while something is owed.
 * The server also holds a tech to the jobs they can see; voiding and editing stay the managers'.
 */
export function canRecordPayment(
  role: string | null | undefined,
  invoice: Pick<ReceiptInvoice, "status" | "total_cents" | "amount_paid_cents">,
): boolean {
  return (
    (role === "owner" || role === "admin" || role === "tech") &&
    invoice.status !== "draft" &&
    invoice.status !== "void" &&
    invoice.total_cents - invoice.amount_paid_cents > 0
  );
}

/** Send Receipt shows on a sent invoice (not void) with a payment received. */
export function canSendReceipt(
  invoice: Pick<ReceiptInvoice, "status">,
  payments: readonly ReceiptPayment[],
): boolean {
  return (
    invoice.status !== "draft" &&
    invoice.status !== "void" &&
    payments.some((p) => p.status === "succeeded")
  );
}

/** "Balance remaining $449.00", or "Paid in full". */
export function receiptBalanceText(
  invoice: Pick<ReceiptInvoice, "total_cents" | "amount_paid_cents">,
) {
  const balance = Math.max(invoice.total_cents - invoice.amount_paid_cents, 0);
  return balance > 0 ? `Balance remaining ${formatCents(balance)}` : "Paid in full";
}

/** The Send Receipt sheet's line: "$200.00 · Check #1234 · Balance remaining $449.00". */
export function receiptSummary(
  payment: Pick<ReceiptPayment, "amount_cents" | "method" | "check_number">,
  invoice: Pick<ReceiptInvoice, "total_cents" | "amount_paid_cents">,
): string {
  return [
    formatCents(payment.amount_cents),
    paymentMethodLabel(payment.method, payment.check_number),
    receiptBalanceText(invoice),
  ].join(" · ");
}

export type ReceiptChannel = "email" | "text";

export const SEND_RECEIPT = "Send Receipt";
export const RECEIPT_NOT_NOW = "Not Now";
export const RECEIPT_CHANNELS: readonly { value: ReceiptChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
];
export const RECEIPT_EMAIL_LABEL = "Customer email";
export const RECEIPT_PHONE_LABEL = "Mobile number";
export const RECEIPT_TEXT_HINT = "Texted from your company number.";
export const RECEIPT_OFFLINE =
  "Sending a receipt needs a connection. Use Send Receipt on the invoice when you’re back online.";

/** The sheet's first line right after recording: what happened, then the question. */
export function receiptPrompt(invoice: Pick<ReceiptInvoice, "status">): string {
  return `${invoice.status === "paid" ? "Paid in full." : "Payment recorded."} Send the customer a receipt?`;
}

/** Why the address can't take the receipt, or null. */
export function receiptRecipientError(channel: ReceiptChannel, to: string): string | null {
  const t = to.trim();
  if (channel === "email") return /^\S+@\S+\.\S+$/.test(t) ? null : "Enter the customer’s email.";
  return toE164(t) ? null : "Enter a mobile number like (602) 555-0142.";
}

/** "Receipt emailed to sam@example.com." / "Receipt texted to (602) 555-0142." */
export function receiptSentMessage(channel: ReceiptChannel, to: string): string {
  const t = to.trim();
  return channel === "email"
    ? `Receipt emailed to ${t}.`
    : `Receipt texted to ${formatPhone(toE164(t) ?? t)}.`;
}

/** The text message: "Blue Wave Pools: Thank you for your $200.00 payment (Check #1234). …" */
export function receiptTextMessage(
  shop: string,
  payment: Pick<ReceiptPayment, "amount_cents" | "method" | "check_number" | "fee_cents">,
  invoice: Pick<ReceiptInvoice, "number" | "total_cents" | "amount_paid_cents">,
  link: string,
): string {
  const balance = Math.max(invoice.total_cents - invoice.amount_paid_cents, 0);
  const what = `Invoice${invoice.number ? ` #${invoice.number}` : ""}`;
  return [
    `${shop}: Thank you for your ${formatCents(chargedCents(payment))} payment (${paidWith(payment)}).`,
    balance > 0
      ? `Balance remaining on ${what}: ${formatCents(balance)}.`
      : `${what} is paid in full.`,
    `Your receipt: ${link}`,
  ].join(" ");
}

/**
 * The receipt's rows, in the email and on the invoice page: Invoice, Payment date, Method,
 * Card fee (when one was charged), Amount paid (with the fee), Invoice total, then Balance
 * remaining or Paid in full. `paidOn` is the date as the shop writes it ("October 22, 2026").
 */
export function receiptRows(
  invoice: Pick<ReceiptInvoice, "number" | "total_cents" | "amount_paid_cents">,
  payment: Pick<ReceiptPayment, "amount_cents" | "method" | "check_number" | "fee_cents">,
  paidOn: string | null,
): { label: string; value: string }[] {
  const balance = Math.max(invoice.total_cents - invoice.amount_paid_cents, 0);
  return [
    ...(invoice.number ? [{ label: "Invoice", value: `#${invoice.number}` }] : []),
    ...(paidOn ? [{ label: "Payment date", value: paidOn }] : []),
    { label: "Method", value: paymentMethodLabel(payment.method, payment.check_number) },
    ...((payment.fee_cents ?? 0) > 0
      ? [{ label: CARD_FEE_LABEL, value: formatCents(payment.fee_cents ?? 0) }]
      : []),
    { label: "Amount paid", value: formatCents(chargedCents(payment)) },
    { label: "Invoice total", value: formatCents(invoice.total_cents) },
    balance > 0
      ? { label: "Balance remaining", value: formatCents(balance) }
      : { label: "Balance", value: "Paid in full" },
  ];
}
