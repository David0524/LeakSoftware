/**
 * Refunds on a shop's invoices (owner, 2026-11-24: "how would we reverse a charge?"). Owners
 * and admins refund a card or bank payment, all of it or part, from the invoice on every
 * platform. The money goes back through the shop's own Stripe account; refunds made in Stripe's
 * dashboard show on the invoice too. Cash, check and other payments the shop recorded aren't
 * refunded here (no money moved through Stripe). One set of rules and words for the website and
 * both apps (ported to Swift with fixtures).
 */

import { formatCents, parseDollars, type Cents } from "./money";

/** A payment as the invoice has it: `amount_cents` is what's still kept after refunds. */
export interface RefundablePayment {
  amount_cents: Cents;
  method: string;
  status: string;
  /** Refunded so far (0 or missing when none). */
  refunded_cents?: Cents | null;
}

/** Payments that went through Stripe, so Stripe can send them back. */
export const REFUNDABLE_METHODS: readonly string[] = ["card", "ach"];

/** What can still be refunded on a payment: what it still holds, when Stripe took it. */
export function refundableCents(p: RefundablePayment): Cents {
  if (p.status !== "succeeded" || !REFUNDABLE_METHODS.includes(p.method)) return 0;
  return Math.max(0, p.amount_cents);
}

/**
 * Refund shows to owners and admins only (techs record payments but never refund them), on a
 * sent invoice that isn't void, for a card or bank payment with something left to refund.
 */
export function canRefund(
  role: string | null | undefined,
  invoice: { status: string },
  p: RefundablePayment,
): boolean {
  return (
    (role === "owner" || role === "admin") &&
    invoice.status !== "draft" &&
    invoice.status !== "void" &&
    refundableCents(p) > 0
  );
}

export const REFUND_BUTTON = "Refund";
export const REFUND_TITLE = "Refund Payment";
export const REFUND_FULL = "Refund Full";
export const REFUND_PART = "Refund Part";
export const REFUND_AMOUNT_LABEL = "Amount";
export const REFUND_OFFLINE = "Refunds need a signal.";

/** The sheet's explanation, for the payment's method. */
export function refundExplainer(method: string): string {
  const where = method === "ach" ? "bank account" : "card";
  return `The money goes back to the customer’s ${where} through your Stripe account. It takes 5 to 10 business days to show. A refund can’t be undone.`;
}

/** The sheet's button: "Refund $80.00". */
export function refundButtonText(cents: Cents): string {
  return `Refund ${formatCents(cents)}`;
}

/** After the refund went through. */
export function refundDoneText(cents: Cents): string {
  return `Refunded ${formatCents(cents)}.`;
}

/**
 * The amount to refund: all of what's left, or the amount typed for part (more than $0, no more
 * than what's left).
 */
export function refundAmount(
  part: boolean,
  typed: string,
  refundable: Cents,
): { cents: Cents } | { error: string } {
  if (refundable <= 0) return { error: "Nothing is left to refund on this payment." };
  if (!part) return { cents: refundable };
  const cents = parseDollars(typed);
  if (cents === null || cents <= 0) return { error: "Enter an amount, like 25.00." };
  if (cents > refundable) return { error: `Refund ${formatCents(refundable)} or less.` };
  return { cents };
}

/** Said after the payment's line: "Refunded $20.00"; null when none, or all (its status says so). */
export function refundedText(p: RefundablePayment): string | null {
  if (p.status === "refunded") return null;
  const r = p.refunded_cents ?? 0;
  return r > 0 ? `Refunded ${formatCents(r)}` : null;
}
