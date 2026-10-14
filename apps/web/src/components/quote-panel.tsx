"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { QUOTE_STATUS_LABELS, formatCents, lineTotal } from "@leakbook/core";
import { sendQuoteAction } from "@/app/actions/quotes";
import type { QuoteRow } from "@/lib/data";
import { CopyLink } from "./settings-forms";
import { Button, Notice } from "./ui";

const PAYMENT_LABELS: Record<string, string> = {
  pending: "processing",
  succeeded: "paid",
  failed: "failed",
  refunded: "refunded",
};

/** One quote on the office job page: totals, send, customer link, acceptance, deposit. */
export function QuotePanel({
  quote,
  jobId,
  origin,
  children,
}: {
  quote: QuoteRow;
  jobId: string;
  origin: string;
  /** The line editor, for a draft. */
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(sendQuoteAction, {});
  const link = state.link ?? (quote.token ? `${origin}/q/${quote.token}` : null);
  const deposit = quote.payments.find((p) => p.status === "succeeded" || p.status === "pending");
  return (
    <section aria-labelledby={`quote-${quote.id}`} className="card p-5" data-testid="quote">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id={`quote-${quote.id}`} className="font-display text-xl font-bold">
          Quote{quote.number ? ` #${quote.number}` : ""} · {QUOTE_STATUS_LABELS[quote.status]}
        </h3>
        <p className="text-xl font-semibold tabular-nums">{formatCents(quote.total_cents)}</p>
      </div>
      {quote.status === "draft" && children ? (
        children
      ) : (
        <ul className="mt-3 space-y-1 text-[0.9375rem]">
          {quote.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-4">
              <span>
                {l.description}
                {Number(l.quantity) !== 1 ? ` × ${Number(l.quantity)}` : ""}
              </span>
              <span className="tabular-nums">
                {formatCents(
                  lineTotal({ quantity: Number(l.quantity), unit_price_cents: l.unit_price_cents }),
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {quote.status !== "draft" ? (
        <p className="mt-2 text-[0.9375rem] text-text-muted">
          Deposit {formatCents(quote.deposit_cents)}
          {deposit
            ? ` · ${PAYMENT_LABELS[deposit.status]} (${deposit.method === "ach" ? "bank" : "card"})`
            : ""}
        </p>
      ) : null}

      {quote.status === "draft" ? (
        <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="quote" value={quote.id} />
          <input type="hidden" name="job" value={jobId} />
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send Quote"}
          </Button>
          <span className="text-[0.9375rem] text-text-muted">
            Locks the prices and gives you a link for the customer.
          </span>
        </form>
      ) : null}
      {state.error ? (
        <div className="mt-3">
          <Notice tone="error">{state.error}</Notice>
        </div>
      ) : null}
      {link && (quote.status !== "draft" || state.link) ? (
        <div className="mt-4">
          <CopyLink url={link} label="Customer link" />
        </div>
      ) : null}
      {quote.status === "accepted" ? (
        <p className="mt-4">
          Accepted by {quote.accepted_by_name}
          {quote.accepted_at
            ? ` on ${new Date(quote.accepted_at).toLocaleDateString("en-US", { dateStyle: "medium" })}`
            : ""}
          .
          {quote.repair_job_id ? (
            <>
              {" "}
              <Link
                href={`/jobs/${quote.repair_job_id}`}
                className="inline-flex min-h-11 items-center font-semibold text-link underline"
              >
                Repair job{quote.repairNumber ? ` #${quote.repairNumber}` : ""}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
