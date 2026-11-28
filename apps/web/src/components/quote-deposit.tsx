"use client";

import { useState, useTransition } from "react";
import {
  QUOTE_DEPOSIT_TEXT,
  quoteDepositChoice,
  quoteDepositFromInput,
  quoteDepositInputs,
  quoteDepositLabel,
  type DepositRule,
  type QuoteDepositChoice,
} from "@leakbook/core";
import { setQuoteDeposit } from "@/app/actions/quote-draft";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { Field } from "./ui";

/**
 * A draft quote's Deposit row for owners and admins (owner, 2026-11-27: change it per quote):
 * the deposit it asks for, and a sheet to pick the shop's default, a percent, a fixed amount,
 * or none for this quote (core quote-deposit.ts).
 */
export function QuoteDepositRow({
  quoteId,
  rule,
  shop,
  depositCents,
}: {
  quoteId: string;
  rule: DepositRule | null;
  shop: DepositRule;
  /** The deposit in dollars, as the totals show it. */
  depositCents: string;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<QuoteDepositChoice>(quoteDepositChoice(rule));
  const start = quoteDepositInputs(rule);
  const [percent, setPercent] = useState(start.percent);
  const [amount, setAmount] = useState(start.amount);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const label = quoteDepositLabel(rule, shop);

  function reset() {
    setChoice(quoteDepositChoice(rule));
    setPercent(start.percent);
    setAmount(start.amount);
    setError(null);
  }
  function save() {
    const next = quoteDepositFromInput(choice, percent, amount);
    if ("error" in next) {
      setError(next.error);
      return;
    }
    run(async () => {
      const r = await setQuoteDeposit({ quoteId, rule: next.rule });
      if (r.ok) setOpen(false);
      else setError(r.error);
    });
  }

  return (
    <>
      <dt className="text-text-muted">{QUOTE_DEPOSIT_TEXT.row}</dt>
      <dd className="text-right">
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(true);
          }}
          aria-label={`${QUOTE_DEPOSIT_TEXT.row}, ${depositCents}, ${label}. Change`}
          data-testid="quote-deposit"
          className="-my-2 inline-flex min-h-11 items-center gap-1 text-link"
        >
          {depositCents}
          <span className="text-[0.9375rem] text-text-muted">· {label}</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </dd>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={QUOTE_DEPOSIT_TEXT.title}
        done={{ label: QUOTE_DEPOSIT_TEXT.save, onClick: save, disabled: pending }}
      >
        <div className="space-y-4">
          <Segmented
            label={QUOTE_DEPOSIT_TEXT.row}
            hideLabel
            fit
            name="deposit_choice"
            value={choice}
            onChange={(c) => {
              setChoice(c);
              setError(null);
            }}
            options={(["default", "percent", "fixed", "none"] as const).map((c) => ({
              value: c,
              label: QUOTE_DEPOSIT_TEXT.choices[c],
            }))}
          />
          {choice === "percent" ? (
            <Field
              label={QUOTE_DEPOSIT_TEXT.percentLabel}
              name="deposit_percent"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              error={error ?? undefined}
            />
          ) : choice === "fixed" ? (
            <Field
              label={QUOTE_DEPOSIT_TEXT.fixedLabel}
              name="deposit_amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={error ?? undefined}
            />
          ) : error ? (
            <p role="alert" className="text-[0.9375rem] text-status-fail">
              {error}
            </p>
          ) : null}
          <p className="text-[0.9375rem] text-text-muted">
            {choice === "default" ? `${label}. ` : ""}
            {QUOTE_DEPOSIT_TEXT.footer}
          </p>
        </div>
      </Sheet>
    </>
  );
}
