"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import {
  CARD_IMPORT_TEXT as T,
  cardHolderName,
  cardMatchLine,
  savedMethodLabel,
  type CardImportPlan,
  type CardImportRow,
} from "@leakbook/core";
import { importCardsAction, type CardImportState } from "@/app/actions/card-import";
import { Sheet, useConfirm } from "./sheet";
import { Grouped, Notice, buttonClass, cx, pillClass } from "./ui";

// Settings › Payments and Deposits › Import Saved Cards (core card-import.ts): the copied
// customers we matched, with a switch each; the ones we couldn't, with Choose Customer; then
// Turn On Autopay for everyone chosen, after a confirmation.

export interface PickCustomer {
  id: string;
  name: string;
  detail: string | null;
}

type Choice = { customer_id: string | null; on: boolean };

const initial = (plan: CardImportPlan) =>
  Object.fromEntries(
    [...plan.ready, ...plan.needsMatch].map((r) => [
      r.holder.stripe_customer_id,
      { customer_id: r.customer_id, on: r.selected } satisfies Choice,
    ]),
  );

export function CardImport({
  plan,
  customers,
}: {
  plan: CardImportPlan;
  customers: PickCustomer[];
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>(() => initial(plan));
  const [picking, setPicking] = useState<CardImportRow | null>(null);
  const [state, action, pending] = useActionState<CardImportState, FormData>(importCardsAction, {});
  const [confirm, confirmSheet] = useConfirm();
  const form = useRef<HTMLFormElement>(null);
  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const failed = new Map((state.failed ?? []).map((f) => [f.stripe_customer_id, f.message]));
  // Listed by the customer's name in Sundeck Pro, which is the name each row shows.
  const ready = useMemo(
    () =>
      plan.ready
        .map((r) => ({ r, label: names.get(r.customer_id!) ?? cardHolderName(r.holder) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [plan.ready, names],
  );

  const picks = Object.entries(choices)
    .filter(([, c]) => c.on && c.customer_id)
    .map(([stripe_customer_id, c]) => ({ stripe_customer_id, customer_id: c.customer_id! }));

  const set = (id: string, c: Partial<Choice>) =>
    setChoices((old) => ({ ...old, [id]: { ...old[id]!, ...c } }));

  async function submit() {
    const ok = await confirm({
      title: T.confirmTitle(picks.length),
      message: T.confirmBody,
      confirmLabel: T.confirmAction,
    });
    if (ok) form.current?.requestSubmit();
  }

  const empty = plan.ready.length === 0 && plan.needsMatch.length === 0;

  return (
    <div className="space-y-6" data-testid="card-import">
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      {empty ? (
        <p className="card p-5 text-text-muted">{T.none}</p>
      ) : (
        <>
          {plan.ready.length ? (
            <Grouped title={`${T.ready} (${plan.ready.length})`} footer={T.readyFooter}>
              {ready.map(({ r, label }) => {
                const id = r.holder.stripe_customer_id;
                const c = choices[id]!;
                return (
                  <li key={id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block">{label}</span>
                        <span className="block text-[0.9375rem] text-text-muted">
                          {failed.get(id) ?? cardMatchLine(r, label)}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        className="ios-switch shrink-0"
                        aria-label={`Import ${label}`}
                        checked={c.on}
                        onChange={(e) => set(id, { on: e.target.checked })}
                      />
                    </label>
                  </li>
                );
              })}
            </Grouped>
          ) : null}

          {plan.needsMatch.length ? (
            <Grouped
              title={`${T.needsMatch} (${plan.needsMatch.length})`}
              footer={T.needsMatchFooter}
            >
              {plan.needsMatch.map((r) => {
                const id = r.holder.stripe_customer_id;
                const c = choices[id]!;
                const chosen = c.customer_id ? names.get(c.customer_id) : null;
                const card = r.holder.method ? savedMethodLabel(r.holder.method) : "";
                const from = [card, r.note, r.holder.name ? r.holder.email : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={id} className="flex min-h-11 items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block">{cardHolderName(r.holder)}</span>
                      <span className="block text-[0.9375rem] text-text-muted">
                        {failed.get(id) ?? (chosen ? `${card} · to ${chosen}` : from)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPicking(r)}
                      className={cx(pillClass(false), "shrink-0")}
                      aria-label={`${chosen ? T.change : T.chooseCustomer} for ${cardHolderName(r.holder)}`}
                    >
                      {chosen ? T.change : T.chooseCustomer}
                    </button>
                  </li>
                );
              })}
            </Grouped>
          ) : null}
        </>
      )}

      {plan.done ? (
        <p className="px-4 text-[0.9375rem] text-text-muted">
          {T.done}: {plan.done}
        </p>
      ) : null}

      {!empty ? (
        <form ref={form} action={action} className="sticky bottom-4 z-10">
          <input type="hidden" name="picks" value={JSON.stringify(picks)} />
          <button
            type="button"
            disabled={picks.length === 0 || pending}
            onClick={() => void submit()}
            className={buttonClass("primary", "w-full shadow-lg disabled:shadow-none")}
          >
            {pending ? "Turning On Autopay…" : T.importButton(picks.length)}
          </button>
        </form>
      ) : null}

      <ChooseCustomer
        row={picking}
        customers={customers}
        onClose={() => setPicking(null)}
        onChoose={(customerId) => {
          if (picking)
            set(picking.holder.stripe_customer_id, {
              customer_id: customerId,
              on: customerId !== null,
            });
          setPicking(null);
        }}
      />
      {confirmSheet}
    </div>
  );
}

/** Choose Customer: a searchable list of the shop's customers, and Leave Out. */
function ChooseCustomer({
  row,
  customers,
  onClose,
  onChoose,
}: {
  row: CardImportRow | null;
  customers: PickCustomer[];
  onClose: () => void;
  onChoose: (customerId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = (
    q ? customers.filter((c) => `${c.name} ${c.detail ?? ""}`.toLowerCase().includes(q)) : customers
  ).slice(0, 60);
  return (
    <Sheet
      open={row !== null}
      onClose={() => {
        setQuery("");
        onClose();
      }}
      title={T.chooseCustomer}
    >
      {row ? (
        <p className="mb-3 text-text-muted">
          {[
            cardHolderName(row.holder),
            row.holder.method ? savedMethodLabel(row.holder.method) : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      <div className="flex min-h-11 items-center gap-2 rounded-[10px] bg-fill px-3">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-5 text-text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          aria-label={T.search}
          placeholder={T.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 min-w-0 flex-1 bg-transparent placeholder:text-placeholder"
        />
      </div>
      <ul className="grouped mt-4">
        {shown.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                onChoose(c.id);
              }}
              className="flex min-h-11 w-full items-center px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06]"
            >
              <span className="min-w-0 flex-1">
                <span className="block">{c.name}</span>
                {c.detail ? (
                  <span className="block text-[0.9375rem] text-text-muted">{c.detail}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-4 py-3 text-text-muted">No customers match.</li>
        ) : null}
      </ul>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          onChoose(null);
        }}
        className="mt-4 min-h-11 w-full rounded-full font-semibold text-status-fail hover:bg-status-fail/10"
      >
        {T.leaveOut}
      </button>
    </Sheet>
  );
}
