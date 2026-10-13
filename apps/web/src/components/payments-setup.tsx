"use client";

import { useActionState } from "react";
import { setUpPayments } from "@/app/actions/quotes";
import { Button, Notice } from "./ui";

export function PaymentsSetupButton({ label }: { label: string }) {
  const [state, action, pending] = useActionState(() => setUpPayments(), {});
  return (
    <form action={action} className="space-y-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Opening Stripe…" : label}
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </form>
  );
}
