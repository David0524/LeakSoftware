"use client";

import { useActionState, useMemo } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { PayState } from "@/app/actions/auth";
import { Button, Notice } from "./ui";

/**
 * The customer's Pay button (quote deposits and invoices). The server starts a Stripe
 * Checkout Session on the shop's account; with Tidemark's publishable key set it comes back
 * here and Stripe's form opens in place (card, Apple Pay, Google Pay, Link, bank account).
 * Without it the action sends the customer to Stripe's own page. Either way Stripe returns
 * the customer to this page with ?paid=1, and the webhook records the payment.
 */
export function PayForm({
  token,
  label,
  action: pay,
}: {
  token: string;
  label: string;
  action: (state: PayState, form: FormData) => Promise<PayState>;
}) {
  const [state, action, pending] = useActionState(pay, {});
  const checkout = state.checkout;
  // One Stripe.js instance per checkout, on the shop's account (direct charges).
  const stripe = useMemo(
    () =>
      checkout ? loadStripe(checkout.publishableKey, { stripeAccount: checkout.account }) : null,
    [checkout],
  );

  if (checkout && stripe) {
    return (
      <section aria-label="Payment" className="space-y-3">
        {/* Stripe draws its own form in a secure frame; white keeps it legible in dark mode. */}
        <div className="overflow-hidden rounded-2xl bg-white" data-testid="embedded-checkout">
          <EmbeddedCheckoutProvider
            stripe={stripe}
            options={{ clientSecret: checkout.clientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
        <p className="text-[0.9375rem] text-text-muted">
          Payments are handled by Stripe. Bank payments take a few business days to clear.
        </p>
      </section>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Opening secure payment…" : label}
      </Button>
      <p className="text-[0.9375rem] text-text-muted">
        Card, Apple Pay, Google Pay, Link, or bank account, through Stripe. Bank payments take a few
        business days to clear.
      </p>
    </form>
  );
}
