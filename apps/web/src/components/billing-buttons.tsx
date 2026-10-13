"use client";

import { useActionState } from "react";
import { manageBilling, subscribe } from "@/app/actions/billing";
import { Button, Notice } from "./ui";

export function BillingButton({ kind }: { kind: "subscribe" | "manage" }) {
  const [state, action, pending] = useActionState(
    () => (kind === "subscribe" ? subscribe() : manageBilling()),
    {},
  );
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
