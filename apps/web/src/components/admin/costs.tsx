"use client";

import { startTransition, useActionState, useState } from "react";
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  PAYER_LABELS,
  PAYERS,
  REPEAT_LABELS,
  REPEATS,
  type CompanyCost,
  type Payer,
  type Repeats,
} from "@leakbook/core";
import { deleteCost, saveCost, setInternal, type AdminState } from "@/app/actions/admin";
import { Segmented } from "@/components/segmented";
import { Sheet, useConfirm } from "@/components/sheet";
import { Button, Field, Notice, Select, TextArea } from "@/components/ui";

// Company finances (owner, 2026-11-16): add and change what Sundeck Pro pays for, and who
// paid: David, Cole or the company. And Leave Out of Counts for our own shops and accounts.

function Result({ state }: { state: AdminState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Add Expense, Add Service, or Edit on a row: a sheet with what it was, the amount, how often,
 * who paid, the date and a note. Editing also offers Delete.
 */
export function CostButton({
  cost,
  repeats: startRepeats = "once",
  label,
  kind = "secondary",
}: {
  cost?: CompanyCost;
  repeats?: Repeats;
  label: string;
  kind?: "primary" | "secondary" | "plain";
}) {
  const [open, setOpen] = useState(false);
  // Close once saved; the list behind shows the change.
  const closing =
    (run: typeof saveCost) =>
    async (prev: AdminState, form: FormData): Promise<AdminState> => {
      const r = await run(prev, form);
      if (r.message) setOpen(false);
      return r;
    };
  const [state, action, pending] = useActionState(closing(saveCost), {});
  const [removed, remove, removing] = useActionState(closing(deleteCost), {});
  const [confirm, confirmSheet] = useConfirm();
  const [repeats, setRepeats] = useState<Repeats>(cost?.repeats ?? startRepeats);
  const [paidBy, setPaidBy] = useState<Payer>(cost?.paid_by ?? "company");
  const title = cost ? `Edit ${cost.name}` : label;
  return (
    <>
      {kind === "plain" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 px-2 text-link hover:underline"
          aria-label={`Edit ${cost?.name ?? ""}`}
        >
          Edit
        </button>
      ) : (
        <Button type="button" kind={kind} onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <form action={action} className="space-y-4">
          {cost ? <input type="hidden" name="id" value={cost.id} /> : null}
          <Field
            label="What"
            name="name"
            required
            maxLength={120}
            defaultValue={cost?.name}
            placeholder={repeats === "once" ? "Business cards" : "Supabase"}
          />
          <Field
            label="Amount"
            name="amount"
            inputMode="decimal"
            defaultValue={
              cost?.amount_cents != null ? (cost.amount_cents / 100).toFixed(2) : undefined
            }
            placeholder="$0.00"
            required={repeats === "once"}
            hint={repeats === "once" ? undefined : "Leave empty until you know the price."}
          />
          <Segmented
            label="How Often"
            name="repeats"
            value={repeats}
            onChange={setRepeats}
            options={REPEATS.map((r) => ({ value: r, label: REPEAT_LABELS[r] }))}
          />
          <Segmented
            label="Paid By"
            name="paid_by"
            value={paidBy}
            onChange={setPaidBy}
            options={PAYERS.map((p) => ({ value: p, label: PAYER_LABELS[p] }))}
          />
          <Select
            label="Category"
            name="category"
            defaultValue={cost?.category ?? (repeats === "once" ? "other" : "software")}
            options={COST_CATEGORIES.map((c) => ({ value: c, label: COST_CATEGORY_LABELS[c] }))}
          />
          <Field
            label={repeats === "once" ? "Date Paid" : "First Charge"}
            name="spent_on"
            type="date"
            required
            defaultValue={cost?.spent_on ?? today()}
          />
          {repeats === "once" ? null : (
            <Field
              label="Canceled On"
              name="ended_on"
              type="date"
              defaultValue={cost?.ended_on ?? undefined}
              hint="Only when we stopped paying for it."
            />
          )}
          <TextArea label="Note" name="note" maxLength={1000} defaultValue={cost?.note ?? ""} />
          <Result state={state} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : cost ? "Save" : label}
          </Button>
        </form>
        {cost ? (
          <div className="mt-3 space-y-2">
            <Result state={removed} />
            <Button
              type="button"
              kind="danger"
              disabled={removing}
              className="w-full"
              onClick={async () => {
                const ok = await confirm({
                  title: `Delete ${cost.name}?`,
                  message: "It comes off the totals. This can’t be undone.",
                  confirmLabel: "Delete",
                  destructive: true,
                });
                if (!ok) return;
                const form = new FormData();
                form.set("id", cost.id);
                startTransition(() => remove(form));
              }}
            >
              {removing ? "Deleting…" : "Delete"}
            </Button>
          </div>
        ) : null}
        {confirmSheet}
      </Sheet>
    </>
  );
}

/** Leave Out of Counts / Count Again, for a shop or a person (Sundeck Pro's own). */
export function InternalToggle({
  kind,
  id,
  internal,
}: {
  kind: "shop" | "person";
  id: string;
  internal: boolean;
}) {
  const [state, action, pending] = useActionState(setInternal, {});
  const [confirm, confirmSheet] = useConfirm();
  const what = kind === "shop" ? "shop" : "person";
  return (
    <div>
      <Button
        type="button"
        kind="secondary"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm(
            internal
              ? {
                  title: `Count this ${what} again?`,
                  message: "It comes back into the lists, counts and finances.",
                  confirmLabel: "Count Again",
                }
              : {
                  title: `Leave this ${what} out of the counts?`,
                  message:
                    "For our own shops and accounts. It keeps working, but the portal doesn’t count it anywhere. It’s listed under Internal.",
                  confirmLabel: "Leave Out",
                },
          );
          if (!ok) return;
          const form = new FormData();
          form.set("kind", kind);
          form.set("id", id);
          form.set("internal", internal ? "0" : "1");
          startTransition(() => action(form));
        }}
      >
        {internal ? "Count Again" : "Leave Out of Counts"}
      </Button>
      {state.error ? (
        <div className="mt-2">
          <Result state={state} />
        </div>
      ) : null}
      {confirmSheet}
    </div>
  );
}
