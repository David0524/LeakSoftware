"use client";

import { useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { NEW_QUOTE_LABEL, type WrapUp, type WrapUpRow, type WrapUpStep } from "@leakbook/core";
import { startQuote } from "@/app/actions/quote-draft";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";
import { useNextStep } from "./next-step-events";
import { Sheet } from "./sheet";
import { buttonClass, cx } from "./ui";

// Wrap-Up as a finish list (owner, 2026-10-22, option A; docs/design/2026-10-22-wrap-up.md):
// a row per step with its state, each opening that step's editor in a sheet, and one button
// naming the next step. Computer screens (owner, 2026-10-22: "use the desktop's width") keep the
// list on the left and the open step's editor in a panel on the right.

type Open = { step: WrapUpStep; id: string | null } | null;

const WIDE = "(min-width: 64rem)";

function useWide() {
  return useSyncExternalStore(
    (onChange) => {
      const q = matchMedia(WIDE);
      q.addEventListener("change", onChange);
      return () => q.removeEventListener("change", onChange);
    },
    () => matchMedia(WIDE).matches,
    () => false,
  );
}

export function WrapUpList({
  wrap,
  reviewHref,
  draftQuoteId,
  report,
  sign,
  quotes,
  invoices,
  newInvoice,
  jobId,
}: {
  wrap: WrapUp;
  /** Review with Customer: the draft's sign-off page. */
  reviewHref: string | null;
  /** The draft quote, which New Quote opens once it's started. */
  draftQuoteId: string | null;
  report: ReactNode;
  sign: ReactNode;
  /** Each quote's card and builder, by id. */
  quotes: Record<string, ReactNode>;
  /** Each invoice's card and editor, by id. */
  invoices: Record<string, ReactNode>;
  /** The invoice part before there is one (Create Invoice), and the current one after. */
  newInvoice: ReactNode;
  jobId: string;
}) {
  const router = useRouter();
  const wide = useWide();
  // Undefined until a step is opened or closed: the panel starts on the next step (or Report).
  const [chosen, setOpen] = useState<Open | undefined>(undefined);
  const first =
    wrap.next ?? (wrap.rows[0] ? { step: wrap.rows[0].step, id: wrap.rows[0].id } : null);
  const open: Open =
    chosen !== undefined ? chosen : wide && first ? { step: first.step, id: first.id } : null;
  const [starting, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const target = (r: WrapUpRow): Open =>
    r.opens === r.step ? { step: r.step, id: r.id } : { step: r.opens, id: null };
  const openRow = (r: WrapUpRow) => setOpen(target(r));
  const isOpen = (r: WrapUpRow) =>
    !!open && open.step === target(r)!.step && (open.id ?? null) === (target(r)!.id ?? null);

  // The bottom button (and the phone's Next Step bar) does what tapping the next row does,
  // except Review with Customer, which starts the review at once.
  const goNext = () => {
    const next = wrap.next;
    if (!next) return;
    if (next.step === "sign" && reviewHref) router.push(reviewHref);
    else setOpen({ step: next.step, id: next.id });
  };
  useNextStep("wrap-up", goNext);

  const newQuote = () =>
    start(async () => {
      setError(null);
      const r = await whenOffline(startQuote(jobId), { ok: false as const, error: NO_CONNECTION });
      if (r.ok) setOpen({ step: "quote", id: "draft" });
      else setError(r.error);
    });

  const sheet = (() => {
    if (!open) return null;
    switch (open.step) {
      case "report":
        return { title: "Report", body: report };
      case "sign":
        return { title: "Customer Signs", body: sign };
      case "quote": {
        const id = open.id === "draft" ? draftQuoteId : open.id;
        const row = wrap.rows.find((r) => r.step === "quote" && r.id === id);
        return {
          title: row?.title ?? "Quote",
          body: id ? quotes[id] : <p className="text-text-muted">Starting the quote…</p>,
        };
      }
      case "invoice": {
        const row = wrap.rows.find((r) => r.step === "invoice" && r.id === open.id);
        return {
          title: row?.title ?? "Invoice",
          body: (open.id && invoices[open.id]) || newInvoice,
        };
      }
    }
  })();

  const step = (
    <div className="pt-2" data-autosave data-testid="wrap-up-step">
      {sheet?.body}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-8">
      <section aria-labelledby="wrap-up" data-testid="wrap-up">
        <h2 id="wrap-up" className="font-display text-2xl font-bold">
          Wrap-Up
        </h2>
        <p className="mb-3 text-text-muted" data-testid="wrap-up-count">
          {wrap.subtitle}
        </p>
        <ul className="grouped max-w-3xl" aria-label="Wrap-Up steps">
          {wrap.rows.map((r) => (
            <li key={r.key} data-testid={`wrap-up-${r.step}`}>
              <button
                type="button"
                aria-haspopup={wide ? undefined : "dialog"}
                aria-current={wide && isOpen(r) ? "true" : undefined}
                aria-label={r.spoken}
                onClick={() => openRow(r)}
                className={cx(
                  "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-text/[0.03] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus active:bg-text/[0.06]",
                  wide && isOpen(r) && "bg-link/10 hover:bg-link/10",
                )}
              >
                <Marker row={r} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-words">{r.title}</span>
                  <span className="block text-[0.9375rem] break-words text-text-muted">
                    {r.detail}
                  </span>
                </span>
                {r.amount ? (
                  <span className="shrink-0 font-semibold tabular-nums">{r.amount}</span>
                ) : null}
                <span
                  aria-hidden="true"
                  className="shrink-0 text-xl leading-none text-text-muted/70"
                >
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
        {wrap.canStartQuote ? (
          <div className="mt-2 max-w-3xl px-4">
            <button
              type="button"
              onClick={newQuote}
              disabled={starting}
              className="inline-flex min-h-11 items-center gap-1 font-semibold text-link disabled:opacity-50"
            >
              <span aria-hidden="true">+</span> {starting ? "Starting…" : NEW_QUOTE_LABEL}
            </button>
            {error ? (
              <p role="alert" className="text-[0.9375rem] text-status-fail">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
        {/* Phones have the button on the Next Step bar above the tab bar; wider screens here. */}
        {wrap.next ? (
          <div className="mt-6 max-w-3xl max-sm:hidden">
            <button
              type="button"
              onClick={goNext}
              className={buttonClass("primary", "w-full")}
              data-testid="wrap-up-next"
            >
              {wrap.next.action}
            </button>
          </div>
        ) : null}
      </section>
      {wide ? (
        // The open step beside the list, with Done to put it away.
        sheet ? (
          <section
            aria-label={sheet.title}
            className="mt-8 lg:sticky lg:top-20 lg:mt-0"
            data-testid="wrap-up-panel"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-bold">{sheet.title}</h2>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="min-h-11 rounded-full px-3 font-semibold text-link"
              >
                Done
              </button>
            </div>
            {step}
          </section>
        ) : (
          <p className="mt-8 rounded-2xl bg-text/[0.04] p-6 text-center text-text-muted lg:mt-11">
            Choose a step to open it here.
          </p>
        )
      ) : (
        <Sheet
          open={!!sheet}
          onClose={() => setOpen(null)}
          title={sheet?.title ?? ""}
          wide={open?.step !== "sign"}
          doneOnly
        >
          {/* Each step saves as it's edited (report text, quote and invoice lines) and its
              sheet changes as it does, so Done closes without asking. */}
          {step}
        </Sheet>
      )}
    </div>
  );
}

/** The 30 pt round marker: a green check when done, the number in blue when next, else gray. */
function Marker({ row }: { row: WrapUpRow }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex size-[30px] shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-semibold tabular-nums",
        row.done
          ? "bg-status-pass text-on-status"
          : row.next
            ? "bg-primary text-on-primary"
            : "text-text-muted ring-[1.5px] ring-text-muted/40 ring-inset",
      )}
    >
      {row.done ? (
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : (
        row.number
      )}
    </span>
  );
}
