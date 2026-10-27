"use client";

import { useState, useTransition } from "react";
import {
  formatCents,
  lineTotal,
  quoteTotals,
  type CompanySettings,
  type QuoteLine,
} from "@leakbook/core";
import {
  addCustomLine,
  addPriceBookLine,
  removeQuoteLine,
  setQuoteDiscount,
  startQuote,
  updateQuoteLine,
} from "@/app/actions/quote-draft";
import type { QuoteRow } from "@/lib/data";
import { useConfirm } from "./sheet";
import { Button, Field, Select, buttonClass } from "./ui";
import { Draft } from "./draft-keeper";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

// The phone's Quote tab for a browser (M9.5): price the findings from the price book, add
// custom lines, adjust quantities and prices, and give a discount. Sending is in QuotePanel.

type Run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>) => void;

function useRun(): { pending: boolean; error: string | null; run: Run } {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run: Run = (work) =>
    start(async () => {
      const r = await whenOffline(work(), { ok: false as const, error: NO_CONNECTION });
      setError(r.ok ? null : r.error);
    });
  return { pending, error, run };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-[0.9375rem] text-status-fail">
      {error}
    </p>
  ) : null;
}

export function StartQuote({ jobId, another = false }: { jobId: string; another?: boolean }) {
  const { pending, error, run } = useRun();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 basis-48 text-text-muted">
        {/* With a quote already there, never "No quote yet" (owner, 2026-10-22). */}
        {another ? "Need another price?" : "No quote yet."}
      </p>
      <Button
        type="button"
        kind="secondary"
        disabled={pending}
        onClick={() => run(() => startQuote(jobId))}
      >
        Start Quote
      </Button>
      <div className="w-full empty:hidden">
        <ErrorText error={error} />
      </div>
    </div>
  );
}

interface Item {
  id: string;
  name: string;
  price_cents: number;
}

export function QuoteBuilder({
  quote,
  findings,
  priceBook,
  settings,
  isOwner,
}: {
  quote: QuoteRow;
  /** Open findings with the price book items suggested for their component. */
  findings: { id: string; title: string; items: Item[] }[];
  priceBook: Item[];
  settings: Pick<CompanySettings, "tax_rate_bps" | "deposit" | "tech_discount_limit_bps">;
  isOwner: boolean;
}) {
  const { pending, error, run } = useRun();
  const [itemId, setItemId] = useState("");
  const [custom, setCustom] = useState({ description: "", price: "" });
  const totals = quoteTotals(
    quote.lines.map((l) => ({ ...l, quantity: Number(l.quantity) })) as QuoteLine[],
    quote.discount_cents,
    settings.tax_rate_bps,
    settings.deposit,
  );
  const onQuote = new Set(quote.lines.map((l) => l.price_book_item_id).filter(Boolean));

  return (
    <Draft form="quote" id={quote.id}>
      <div className="mt-4 space-y-5">
        {findings.length ? (
          <section aria-labelledby={`from-findings-${quote.id}`} className="space-y-3">
            <h4 id={`from-findings-${quote.id}`} className="font-display text-lg font-bold">
              Add From Findings
            </h4>
            {findings.map((f) => (
              <div key={f.id} className="space-y-2">
                <p className="font-semibold">{f.title}</p>
                {f.items.length === 0 ? (
                  <p className="text-[0.9375rem] text-text-muted">
                    No price book items for this component. Add a custom line.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {f.items.map((item) => {
                      const added = onQuote.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          disabled={added || pending}
                          aria-label={`Add ${item.name}, ${formatCents(item.price_cents)}`}
                          onClick={() =>
                            run(() =>
                              addPriceBookLine({
                                quoteId: quote.id,
                                itemId: item.id,
                                findingId: f.id,
                              }),
                            )
                          }
                          className={buttonClass("secondary", "px-4 text-[0.9375rem] font-medium")}
                        >
                          {added ? "✓ " : "+ "}
                          {item.name} · {formatCents(item.price_cents)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </section>
        ) : null}

        <section aria-labelledby={`lines-${quote.id}`} className="space-y-3">
          <h4 id={`lines-${quote.id}`} className="font-display text-lg font-bold">
            Lines
          </h4>
          {quote.lines.length === 0 ? <p className="text-text-muted">No lines yet.</p> : null}
          <ul className="space-y-3">
            {quote.lines.map((l) => (
              <QuoteLineRow key={l.id} quoteId={quote.id} line={l} run={run} pending={pending} />
            ))}
          </ul>
        </section>

        {priceBook.length ? (
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Add from the price book"
              name={`item-${quote.id}`}
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="min-w-0 flex-1"
              options={[
                { value: "", label: "Choose…" },
                ...priceBook.map((i) => ({
                  value: i.id,
                  label: `${i.name} (${formatCents(i.price_cents)})`,
                })),
              ]}
            />
            <Button
              type="button"
              kind="secondary"
              disabled={!itemId || pending}
              onClick={() => {
                const id = itemId;
                setItemId("");
                run(() => addPriceBookLine({ quoteId: quote.id, itemId: id, findingId: null }));
              }}
            >
              Add Item
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_auto] sm:items-end">
          <Field
            label="Custom line"
            name={`custom-${quote.id}`}
            placeholder="Replace skimmer lid"
            value={custom.description}
            onChange={(e) => setCustom((c) => ({ ...c, description: e.target.value }))}
          />
          <Field
            label="Price ($)"
            name={`custom-price-${quote.id}`}
            inputMode="decimal"
            value={custom.price}
            onChange={(e) => setCustom((c) => ({ ...c, price: e.target.value }))}
          />
          <Button
            type="button"
            kind="secondary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await addCustomLine({ quoteId: quote.id, ...custom });
                if (r.ok) setCustom({ description: "", price: "" });
                return r;
              })
            }
          >
            Add Line
          </Button>
        </div>

        <div className="max-w-xs">
          <Field
            label="Discount ($)"
            name={`discount-${quote.id}`}
            inputMode="decimal"
            key={quote.discount_cents}
            defaultValue={quote.discount_cents ? (quote.discount_cents / 100).toFixed(2) : ""}
            hint={
              isOwner
                ? undefined
                : `Techs can give up to ${settings.tech_discount_limit_bps / 100}% off.`
            }
            onBlur={(e) => {
              const value = e.target.value;
              const now = quote.discount_cents ? (quote.discount_cents / 100).toFixed(2) : "";
              if (value.trim() !== now)
                run(() => setQuoteDiscount({ quoteId: quote.id, discount: value }));
            }}
          />
        </div>

        <ErrorText error={error} />

        <dl className="grid max-w-sm grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 tabular-nums break-words">
          <dt className="text-text-muted">Subtotal</dt>
          <dd className="text-right">{formatCents(totals.subtotal_cents)}</dd>
          {totals.discount_cents ? (
            <>
              <dt className="text-text-muted">Discount</dt>
              <dd className="text-right">−{formatCents(totals.discount_cents)}</dd>
            </>
          ) : null}
          <dt className="text-text-muted">Tax</dt>
          <dd className="text-right">{formatCents(totals.tax_cents)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold">{formatCents(totals.total_cents)}</dd>
          <dt className="text-text-muted">Deposit</dt>
          <dd className="text-right">{formatCents(totals.deposit_cents)}</dd>
        </dl>
      </div>
    </Draft>
  );
}

function QuoteLineRow({
  quoteId,
  line,
  run,
  pending,
}: {
  quoteId: string;
  line: QuoteRow["lines"][number];
  run: Run;
  pending: boolean;
}) {
  const saved = {
    description: line.description,
    quantity: String(Number(line.quantity)),
    price: (line.unit_price_cents / 100).toFixed(2),
  };
  const [values, setValues] = useState(saved);
  const [base, setBase] = useState(saved);
  // A save elsewhere (or by another device) changes the line: show the new values.
  if (
    base.description !== saved.description ||
    base.quantity !== saved.quantity ||
    base.price !== saved.price
  ) {
    setBase(saved);
    setValues(saved);
  }
  const commit = () => {
    if (
      values.description === saved.description &&
      values.quantity === saved.quantity &&
      values.price === saved.price
    )
      return;
    run(() => updateQuoteLine({ quoteId, lineId: line.id, ...values }));
  };
  const [confirm, confirmSheet] = useConfirm();
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  return (
    <li
      aria-label={line.description}
      className="well space-y-2 p-3"
      data-testid="quote-line"
      data-autosave
    >
      <Field
        label="Description"
        name={`desc-${line.id}`}
        value={values.description}
        onChange={set("description")}
        onBlur={commit}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,8rem)_minmax(0,10rem)_1fr] sm:items-end">
        <Field
          label="Qty"
          name={`qty-${line.id}`}
          inputMode="decimal"
          value={values.quantity}
          onChange={set("quantity")}
          onBlur={commit}
        />
        <Field
          label="Price each ($)"
          name={`price-${line.id}`}
          inputMode="decimal"
          value={values.price}
          onChange={set("price")}
          onBlur={commit}
        />
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-3 sm:col-span-1">
          <span className="font-semibold tabular-nums">
            {formatCents(
              lineTotal({
                quantity: Number(line.quantity),
                unit_price_cents: line.unit_price_cents,
              }),
            )}
          </span>
          <Button
            type="button"
            kind="quiet"
            disabled={pending}
            onClick={async () => {
              if (
                await confirm({
                  title: `Remove “${line.description}” from the quote?`,
                  confirmLabel: "Remove Line",
                  destructive: true,
                })
              )
                run(() => removeQuoteLine({ quoteId, lineId: line.id }));
            }}
          >
            Remove
          </Button>
        </div>
      </div>
      {confirmSheet}
    </li>
  );
}
