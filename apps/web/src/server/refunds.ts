import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { formatCents, refundableCents } from "@leakbook/core";
import { adminClient } from "./admin";
import { dbFailure, Fault, Refusal } from "./failures";
import { PaymentsNotConfigured, stripeClient } from "./stripe";

// Refunds of a shop's invoice payments (owner, 2026-11-24: "how would we reverse a charge?").
// An owner or admin refunds a card or bank payment, all or part, from the invoice on any
// platform; the money goes back through the shop's own Stripe account (the charge was made on
// it). The database records what Stripe reports (public.stripe_record_refund), the same way as
// for a refund made in Stripe's dashboard (the charge.refunded webhook, server/stripe.ts).

interface RefundInfo {
  payment_id: string;
  invoice_id: string;
  company_id: string;
  intent_id: string;
  amount_cents: number;
  refunded_cents: number;
  method: string;
  account: string | null;
}

export interface RefundResult {
  /** All refunded on the payment so far. */
  refunded_cents: number;
  /** The payment's status after: 'succeeded' (part refunded) or 'refunded'. */
  status: string;
  message: string;
}

/**
 * Refunds `amountCents` of a payment (null: all that's left, with any card fee the customer
 * paid). `db` is the signed-in person's client: the database checks they're an owner or admin
 * of the payment's shop, never a staff support session.
 */
export async function refundPayment(
  db: SupabaseClient,
  paymentId: string,
  amountCents: number | null,
  deps: { stripe?: Stripe | null; server?: SupabaseClient | null } = {},
): Promise<RefundResult> {
  const stripe = deps.stripe === undefined ? stripeClient() : deps.stripe;
  const server = deps.server === undefined ? adminClient() : deps.server;
  if (!stripe || !server) throw new PaymentsNotConfigured();
  const { data, error } = await db.rpc("payment_refund_info", { target_payment: paymentId });
  if (error) throw dbFailure(error);
  const info = data as RefundInfo;
  if (!info.account) throw new Refusal("This shop’s Stripe account isn’t connected.");
  const left = refundableCents({
    amount_cents: info.amount_cents,
    method: info.method,
    status: "succeeded",
  });
  if (amountCents !== null) {
    if (!Number.isInteger(amountCents) || amountCents <= 0)
      throw new Refusal("Enter an amount, like 25.00.");
    if (amountCents > left) throw new Refusal(`Refund ${formatCents(left)} or less.`);
  }
  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: info.intent_id,
        ...(amountCents !== null ? { amount: amountCents } : {}),
        metadata: { kind: "invoice_refund", payment_id: info.payment_id },
      },
      {
        stripeAccount: info.account,
        // A second tap of the same refund is the same refund.
        idempotencyKey: `refund-${info.payment_id}-${info.refunded_cents}-${amountCents ?? "all"}`,
      },
    );
  } catch (e) {
    const err = e as { type?: string; message?: string; code?: string };
    console.error("[refunds] Stripe refused:", err.code, err.message);
    if (err.code === "charge_already_refunded")
      throw new Refusal("Stripe says this payment was already refunded.");
    if (err.type === "StripeInvalidRequestError")
      throw new Refusal("Stripe couldn’t refund this payment. Check your Stripe dashboard.");
    throw new Fault("Couldn’t reach Stripe. Try again.");
  }
  if (refund.status === "failed" || refund.status === "canceled")
    throw new Refusal("Stripe couldn’t refund this payment. Check your Stripe dashboard.");
  const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
  if (!chargeId) throw new Fault("Stripe didn’t say which charge it refunded.");
  const charge = await stripe.charges.retrieve(chargeId, {}, { stripeAccount: info.account });
  const recorded = await recordChargeRefund(server, charge, info.account);
  const cents = refund.amount;
  return {
    refunded_cents: recorded?.refunded_cents ?? info.refunded_cents + cents,
    status: recorded?.status ?? "succeeded",
    message: `Refunded ${formatCents(cents)}.`,
  };
}

/**
 * Records a charge's refunds on its payment, as Stripe reports them (all refunded so far, so a
 * replay changes nothing). Null when the charge isn't a shop's invoice or deposit payment.
 */
export async function recordChargeRefund(
  server: SupabaseClient,
  charge: Stripe.Charge,
  account: string | null,
): Promise<{ refunded_cents: number; status: string; changed: boolean } | null> {
  const intent =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intent) return null;
  const { data, error } = await server.rpc("stripe_record_refund", {
    intent_id: intent,
    charge_refunded: charge.amount_refunded,
    charge_amount: charge.amount,
    paid_account: account,
  });
  if (error) throw dbFailure(error);
  return (data as { refunded_cents: number; status: string; changed: boolean } | null) ?? null;
}
