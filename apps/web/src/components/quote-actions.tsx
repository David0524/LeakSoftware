"use client";

import { useActionState } from "react";
import { acceptQuote, payDeposit } from "@/app/actions/quotes";
import { Banner } from "./doc-ui";
import { PayForm } from "./pay-form";
import { Button, Checkbox, Field } from "./ui";

/**
 * Typed name and the terms switch (BUILD_PLAN 6.4). On screen an iOS grouped form: the name
 * typed in its row, the acceptance sentence beside its switch, and a full-width Accept Quote.
 * Printed (?print=1), the form the PDF has always shown.
 */
export function AcceptForm({
  token,
  shop,
  total,
  defaultName,
  print = false,
}: {
  token: string;
  shop: string;
  total: string;
  defaultName: string;
  print?: boolean;
}) {
  const [state, action, pending] = useActionState(acceptQuote, {});
  const consent = `I accept this quote and ask ${shop} to do the work for ${total}.`;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {print ? (
        <>
          <Field
            label="Your name"
            name="name"
            autoComplete="name"
            defaultValue={defaultName}
            required
          />
          <Checkbox name="agree" required label={consent} />
        </>
      ) : (
        <div className="rounded-xl bg-surface">
          <div className="flex min-h-11 items-center gap-3 px-4">
            <label htmlFor="name" className="shrink-0">
              Your name
            </label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              defaultValue={defaultName}
              placeholder="Full name"
              required
              className="min-h-11 min-w-0 flex-1 rounded-md bg-transparent text-text placeholder:text-placeholder focus-visible:outline-offset-0"
            />
          </div>
          {/* The hairline starts where the text does, as in an iOS grouped list. */}
          <div className="ml-4 border-t border-separator py-1.5 pr-4">
            <Checkbox name="agree" required label={consent} />
          </div>
        </div>
      )}
      {state.error ? (
        <Banner tone="error" print={print}>
          {state.error}
        </Banner>
      ) : null}
      <Button type="submit" disabled={pending} className={print ? "w-full sm:w-auto" : "w-full"}>
        {pending ? "Accepting…" : "Accept Quote"}
      </Button>
    </form>
  );
}

export function PayDepositForm({
  token,
  amount,
  demo,
  print,
  cardFee,
}: {
  token: string;
  amount: string;
  demo?: boolean;
  print?: boolean;
  cardFee?: { bankLabel: string; cardLabel: string; note: string } | null;
}) {
  return (
    <PayForm
      token={token}
      label={`Pay ${amount} Deposit`}
      action={payDeposit}
      demo={demo}
      print={print}
      cardFee={cardFee}
    />
  );
}
