"use client";

import { useActionState } from "react";
import { acceptQuote, payDeposit } from "@/app/actions/quotes";
import { PayForm } from "./pay-form";
import { Button, Checkbox, Field, Notice } from "./ui";

/** Typed name and the terms box (BUILD_PLAN 6.4). */
export function AcceptForm({
  token,
  shop,
  total,
  defaultName,
}: {
  token: string;
  shop: string;
  total: string;
  defaultName: string;
}) {
  const [state, action, pending] = useActionState(acceptQuote, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field
        label="Your name"
        name="name"
        autoComplete="name"
        defaultValue={defaultName}
        required
      />
      <Checkbox
        name="agree"
        required
        label={`I accept this quote and ask ${shop} to do the work for ${total}.`}
      />
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Accepting…" : "Accept Quote"}
      </Button>
    </form>
  );
}

export function PayDepositForm({ token, amount }: { token: string; amount: string }) {
  return <PayForm token={token} label={`Pay ${amount} Deposit`} action={payDeposit} />;
}
