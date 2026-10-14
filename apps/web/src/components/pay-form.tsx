"use client";

import { useActionState, useMemo, useState } from "react";
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
  demo = false,
}: {
  token: string;
  label: string;
  action: (state: PayState, form: FormData) => Promise<PayState>;
  /** No Stripe keys on this server: show the button and a preview of the form, charge nothing. */
  demo?: boolean;
}) {
  const [state, action, pending] = useActionState(pay, {});
  const [preview, setPreview] = useState(false);
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

  if (demo) {
    return (
      <div className="space-y-3">
        <Notice tone="warning">
          Demo only: online payments aren’t set up on this server yet, so nothing can be charged.
        </Notice>
        {preview ? (
          <DemoCheckout label={label} />
        ) : (
          <Button type="button" onClick={() => setPreview(true)} className="w-full sm:w-auto">
            {label}
          </Button>
        )}
        <p className="text-[0.9375rem] text-text-muted">
          Card, Apple Pay, Google Pay, Link, or bank account, through Stripe.
        </p>
      </div>
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

/**
 * A picture of the payment form Stripe shows once payments are set up. Nothing in it can be
 * typed into or submitted: there are no inputs, so no one can enter a real card here.
 */
function DemoCheckout({ label }: { label: string }) {
  const box =
    "rounded-xl border border-control-border bg-surface px-3 py-2.5 text-text-muted select-none";
  return (
    <section
      aria-label="Payment form preview (demo)"
      className="space-y-4 rounded-2xl border border-border bg-surface p-4"
      data-testid="demo-checkout"
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {["Apple Pay", "Google Pay", "Link"].map((w) => (
          <span
            key={w}
            className="flex min-h-11 items-center justify-center rounded-full bg-text font-semibold text-bg"
          >
            {w}
          </span>
        ))}
      </div>
      <p className="text-center text-[0.9375rem] text-text-muted">Or pay with card</p>
      <div className="space-y-2" aria-hidden="true">
        <div className={box}>1234 1234 1234 1234</div>
        <div className="grid grid-cols-2 gap-2">
          <div className={box}>MM / YY</div>
          <div className={box}>CVC</div>
        </div>
      </div>
      <p className="text-[0.9375rem] text-text-muted">
        Or pay from a bank account (takes a few business days to clear).
      </p>
      <Button type="button" disabled className="w-full">
        {label}
      </Button>
      <p className="text-center text-[0.9375rem] text-text-muted">
        Preview only. Once payments are set up, Stripe’s secure form appears here.
      </p>
    </section>
  );
}
