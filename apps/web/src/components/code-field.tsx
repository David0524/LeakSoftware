"use client";

import { useActionState, useState } from "react";
import { appliedOfferText, type CodeOffer } from "@leakbook/core";
import { redeemCode } from "@/app/actions/onboarding";
import { orOffline } from "@/lib/offline";
import { Button } from "./ui";

// One field for every code (owner, 2026-11-23): demo codes, promo codes, and other shops'
// referral codes (their names). On the trial page and in Settings › Sundeck Pro Billing before
// subscribing. The page shows the offer once it's applied (AppliedCode).

export function CodeField({ from }: { from: "welcome" | "billing" }) {
  const [state, act, pending] = useActionState(orOffline(redeemCode), {});
  const error = state.fields?.code;
  const id = `code-${from}`;
  return (
    <form action={act} className="mt-6">
      <input type="hidden" name="from" value={from} />
      <label htmlFor={id} className="mb-1 block px-4 text-[0.8125rem] text-text-muted uppercase">
        Code
      </label>
      <div className="grouped flex items-center gap-2 py-1 pr-1 pl-4">
        <input
          id={id}
          name="code"
          defaultValue={state.values?.code ?? ""}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Promo code or a shop’s name"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[1.0625rem] uppercase outline-none placeholder:normal-case"
        />
        <Button type="submit" kind="secondary" disabled={pending}>
          {pending ? "Checking…" : "Apply"}
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-2 px-4 text-[0.9375rem] text-status-fail">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-2 px-4 text-[0.9375rem] text-text-muted">
          Referred by another shop? Enter its name.
        </p>
      )}
    </form>
  );
}

/** "Have a Code?", then the field (Settings › Sundeck Pro Billing, before subscribing). */
export function HaveCode({ from }: { from: "welcome" | "billing" }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <CodeField from={from} />
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="min-h-11 text-link">
      Have a Code?
    </button>
  );
}

/** The code the shop used and its offer: "Code MEET26: 3 months free." */
export function AppliedCode({ offer, className }: { offer: CodeOffer; className?: string }) {
  return (
    <p className={className} data-testid="applied-code">
      <span aria-hidden="true" className="mr-2 text-status-pass">
        ✓
      </span>
      {appliedOfferText(offer)}
    </p>
  );
}
