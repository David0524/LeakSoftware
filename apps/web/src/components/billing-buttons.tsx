"use client";

import { useActionState, useState } from "react";
import { manageBilling, subscribe } from "@/app/actions/billing";
import { SubscriptionCheckout } from "./subscription-checkout";
import { Button, Notice } from "./ui";
import { orOffline } from "@/lib/offline";

/**
 * Subscribe or Manage Billing. With Stripe's publishable key, Subscribe opens Stripe's card
 * form here on the page (owner, 2026-10-24: embedded, as on the trial page); without it, and
 * for Manage Billing, Stripe's own page.
 */
export function BillingButton({
  kind,
  publishableKey = null,
}: {
  kind: "subscribe" | "manage";
  publishableKey?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    orOffline(() => (kind === "subscribe" ? subscribe() : manageBilling())),
    {},
  );
  if (kind === "subscribe" && publishableKey) {
    return open ? (
      <SubscriptionCheckout publishableKey={publishableKey} start={subscribe} />
    ) : (
      <Button type="button" onClick={() => setOpen(true)}>
        Subscribe
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <Button
        type="submit"
        kind={kind === "subscribe" ? "primary" : "secondary"}
        disabled={pending}
      >
        {pending ? "Opening Stripe…" : kind === "subscribe" ? "Subscribe" : "Manage Billing"}
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </form>
  );
}
