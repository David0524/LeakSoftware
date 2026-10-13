"use client";

import { useActionState } from "react";
import { payInvoice } from "@/app/actions/invoices";
import { Button, Notice } from "./ui";

export function PayInvoiceForm({ token, amount }: { token: string; amount: string }) {
  const [state, action, pending] = useActionState(payInvoice, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Opening secure payment…" : `Pay ${amount}`}
      </Button>
      <p className="text-[15px] text-text-muted">
        Card or bank account, through Stripe. Bank payments take a few business days to clear.
      </p>
    </form>
  );
}
