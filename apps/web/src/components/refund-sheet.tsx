"use client";

import { useActionState, useState } from "react";
import {
  REFUND_AMOUNT_LABEL,
  REFUND_BUTTON,
  REFUND_FULL,
  REFUND_PART,
  REFUND_TITLE,
  refundableCents,
  refundAmount,
  refundButtonText,
  refundExplainer,
  type RefundablePayment,
} from "@leakbook/core";
import { refundPaymentAction } from "@/app/actions/invoices";
import { orOffline } from "@/lib/offline";
import type { FormState } from "@/app/actions/auth";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { Button, Field, Notice } from "./ui";

/**
 * Refund on a card or bank payment (owner, 2026-11-24: "how would we reverse a charge?"): a
 * sheet with Refund Full | Refund Part, then the money goes back through the shop's Stripe.
 * Owners and admins (the caller checks canRefund). Same words as both apps (core refund.ts).
 */
export function RefundPayment({
  payment,
  invoiceId,
  jobId,
  onDone,
}: {
  payment: RefundablePayment & { id: string };
  invoiceId: string;
  jobId: string;
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"full" | "part">("full");
  const [typed, setTyped] = useState("");
  const [state, act, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const next = await orOffline(refundPaymentAction)(prev, form);
    if (next.message) {
      setOpen(false);
      onDone(next.message);
    }
    return next;
  }, {} as FormState);
  const left = refundableCents(payment);
  const part = mode === "part";
  const amount = refundAmount(part, typed, left);
  const cents = "cents" in amount ? amount.cents : null;
  return (
    <>
      <Button
        type="button"
        kind="secondary"
        className="min-h-11 px-4 text-[0.9375rem]"
        onClick={() => {
          setMode("full");
          setTyped("");
          setOpen(true);
        }}
      >
        {REFUND_BUTTON}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={REFUND_TITLE}>
        <form action={act} className="space-y-4">
          <input type="hidden" name="payment" value={payment.id} />
          <input type="hidden" name="invoice" value={invoiceId} />
          <input type="hidden" name="job" value={jobId} />
          <input type="hidden" name="refundable" value={left} />
          <input type="hidden" name="part" value={part ? "1" : "0"} />
          <p className="text-[0.9375rem] text-text-muted">{refundExplainer(payment.method)}</p>
          <Segmented
            label="Refund"
            name="mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "full", label: REFUND_FULL },
              { value: "part", label: REFUND_PART },
            ]}
          />
          {part ? (
            <Field
              label={REFUND_AMOUNT_LABEL}
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="25.00"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              error={typed && "error" in amount ? amount.error : undefined}
            />
          ) : null}
          {state.error ? <Notice tone="error">{state.error}</Notice> : null}
          <Button
            type="submit"
            kind="danger"
            disabled={pending || cents === null}
            className="w-full"
          >
            {pending ? "Refunding…" : cents !== null ? refundButtonText(cents) : REFUND_BUTTON}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
