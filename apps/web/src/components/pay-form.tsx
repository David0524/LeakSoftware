"use client";

import { useActionState, useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { PayState } from "@/app/actions/auth";
import { Banner } from "./doc-ui";
import { Button, cx } from "./ui";

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
  print = false,
}: {
  token: string;
  label: string;
  action: (state: PayState, form: FormData) => Promise<PayState>;
  /** No Stripe keys on this server: show the button and a preview of the form, charge nothing. */
  demo?: boolean;
  /** The page is being printed (?print=1): keep the look the PDF has always had. */
  print?: boolean;
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
  // On screen: a full-width primary button with the small print under it, as on iOS.
  const button = print ? "w-full sm:w-auto" : "w-full";
  const note = cx("text-[0.9375rem] text-text-muted", !print && "px-4");

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
        <p className={note}>
          Payments are handled by Stripe. Bank payments take a few business days to clear.
        </p>
      </section>
    );
  }

  if (demo) {
    return (
      <div className="space-y-3">
        <Banner tone="warning" print={print}>
          Demo only: online payments aren’t set up on this server yet, so nothing can be charged.
        </Banner>
        {preview ? (
          <DemoCheckout label={label} />
        ) : (
          <Button type="button" onClick={() => setPreview(true)} className={button}>
            {label}
          </Button>
        )}
        {/* The preview carries its own small print. */}
        {preview && !print ? null : (
          <p className={note}>
            Card, Apple Pay, Google Pay, Link, or bank account, through Stripe.
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <Banner tone="error" print={print}>
          {state.error}
        </Banner>
      ) : null}
      <Button type="submit" disabled={pending} className={button}>
        {pending ? "Opening secure payment…" : label}
      </Button>
      <p className={note}>
        Card, Apple Pay, Google Pay, Link, or bank account, through Stripe. Bank payments take a few
        business days to clear.
      </p>
    </form>
  );
}

/**
 * A picture of the payment form Stripe shows once payments are set up, drawn like an iOS
 * payment sheet: wallet buttons, then the card fields as one grouped block. Nothing in it can
 * be typed into or submitted: there are no inputs, so no one can enter a real card here.
 */
function DemoCheckout({ label }: { label: string }) {
  // Wallet buttons are black pills, as Apple and Google draw them, whatever the page's colors.
  const wallet =
    "flex min-h-11 items-center justify-center rounded-full bg-black font-semibold text-white select-none";
  const row = "flex min-h-11 items-center gap-3 py-2.5 pr-4";
  const placeholder = "min-w-0 flex-1 truncate text-text-muted";
  return (
    <section
      aria-label="Payment form preview (demo)"
      className="space-y-4 rounded-2xl bg-bg py-4 sm:bg-surface sm:px-4"
      data-testid="demo-checkout"
    >
      <div className="space-y-2">
        <span className={wallet}>Apple Pay</span>
        <div className="grid grid-cols-2 gap-2">
          <span className={wallet}>Google Pay</span>
          <span className={wallet}>Link</span>
        </div>
      </div>
      <p className="flex items-center gap-3 text-[0.9375rem] text-text-muted">
        <span aria-hidden="true" className="h-px flex-1 bg-separator" />
        Or pay with card
        <span aria-hidden="true" className="h-px flex-1 bg-separator" />
      </p>
      <div className="rounded-xl bg-surface pl-4 select-none sm:bg-bg">
        <div className={row}>
          <span className="w-24 shrink-0">Card</span>
          <span aria-hidden="true" className={placeholder}>
            1234 1234 1234 1234
          </span>
        </div>
        <div className={cx(row, "border-t border-separator")}>
          <span className="w-24 shrink-0">Expires</span>
          <span aria-hidden="true" className={placeholder}>
            MM / YY
          </span>
        </div>
        <div className={cx(row, "border-t border-separator")}>
          <span className="w-24 shrink-0">CVC</span>
          <span aria-hidden="true" className={placeholder}>
            123
          </span>
        </div>
      </div>
      <p className="px-4 text-[0.9375rem] text-text-muted">
        Or pay from a bank account (takes a few business days to clear).
      </p>
      <Button type="button" disabled className="w-full">
        {label}
      </Button>
      <p className="px-4 text-center text-[0.9375rem] text-text-muted">
        Preview only. Once payments are set up, Stripe’s secure form appears here.
      </p>
    </section>
  );
}
