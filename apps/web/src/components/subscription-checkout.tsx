"use client";

import { useEffect, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { SubscribeState } from "@/app/actions/auth";
import { Banner } from "./doc-ui";
import { Button, cx } from "./ui";

type Load =
  | { status: "loading" }
  | { status: "ready"; stripe: Stripe; clientSecret: string }
  | { status: "error"; message: string };

/**
 * Stripe's card form for the Sundeck Pro subscription, embedded on our page (owner,
 * 2026-10-24): on the trial page and in Settings › Sundeck Pro Billing. It starts the Checkout
 * Session as it opens, shows a quiet placeholder while Stripe.js loads, and says so plainly,
 * with Try Again, if Stripe.js or the session doesn't come. Stripe returns to the session's
 * return_url when the card is in.
 */
export function SubscriptionCheckout({
  publishableKey,
  start,
}: {
  publishableKey: string;
  /** The server action that starts the Checkout Session. */
  start: () => Promise<SubscribeState>;
}) {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let live = true;
    Promise.all([
      loadStripe(publishableKey).catch(() => null),
      start().catch(() => ({ error: "Couldn’t reach Sundeck Pro. Check your connection." })),
    ]).then(([stripe, state]: [Stripe | null, SubscribeState]) => {
      if (!live) return;
      if (state.error) setLoad({ status: "error", message: state.error });
      else if (!stripe || !state.clientSecret)
        setLoad({
          status: "error",
          message: "Stripe’s secure card form didn’t load. Check your connection.",
        });
      else setLoad({ status: "ready", stripe, clientSecret: state.clientSecret });
    });
    return () => {
      live = false;
    };
  }, [attempt, publishableKey, start]);

  if (load.status === "error")
    return (
      <div className="space-y-3" data-testid="checkout-error">
        <Banner tone="error">{load.message}</Banner>
        <Button
          type="button"
          kind="secondary"
          className="w-full"
          onClick={() => {
            setLoad({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try Again
        </Button>
      </div>
    );

  return (
    // Stripe draws its own form in a secure frame; white keeps it legible in dark mode.
    <div
      className={cx(
        "card min-h-[22rem] overflow-hidden p-0",
        load.status === "ready" && "bg-white!",
      )}
      data-testid="embedded-checkout"
      aria-busy={load.status === "loading"}
    >
      {load.status === "ready" ? (
        <EmbeddedCheckoutProvider
          stripe={load.stripe}
          options={{ clientSecret: load.clientSecret }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      ) : (
        <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 p-6 text-text-muted">
          <span
            aria-hidden="true"
            className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
          <p role="status">Loading the secure card form…</p>
        </div>
      )}
    </div>
  );
}
