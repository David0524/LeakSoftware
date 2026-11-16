"use client";

import { useActionState, useMemo } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { saveCard } from "@/app/actions/save-card";
import { orOffline } from "@/lib/offline";
import { Banner } from "./doc-ui";
import { Button } from "./ui";

/**
 * Request Card on File's button (docs/design/2026-11-16-autopay.md): Stripe's form in setup
 * mode, so the customer saves a card or bank account and pays nothing now. Embedded on this
 * page with Sundeck Pro's publishable key, else on Stripe's page; either way back here with
 * ?saved=1, and the webhook keeps the summary.
 */
export function SaveCardForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(orOffline(saveCard), {});
  const checkout = state.checkout;
  const stripe = useMemo(
    () =>
      checkout ? loadStripe(checkout.publishableKey, { stripeAccount: checkout.account }) : null,
    [checkout],
  );
  if (checkout && stripe) {
    return (
      <div className="overflow-hidden rounded-2xl bg-white" data-testid="embedded-checkout">
        <EmbeddedCheckoutProvider stripe={stripe} options={{ clientSecret: checkout.clientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Opening secure form…" : "Save Card or Bank Account"}
      </Button>
    </form>
  );
}
