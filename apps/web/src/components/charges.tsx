"use client";

import { useState, type ReactNode } from "react";
import {
  chargeCents,
  chargeDetail,
  chargesFooter,
  formatCents,
  type VisitCharge,
} from "@leakbook/core";
import { addVisitCharge, removeVisitCharge } from "@/app/actions/monthly-billing";
import { Segmented } from "./segmented";
import {
  FieldError,
  SField,
  SSwitch,
  SettingsFields,
  SettingsForm,
  SheetDone,
} from "./settings-forms";
import { SheetNotices, SheetRow, useSheetNotice } from "./settings-list";
import { Sheet } from "./sheet";
import { Grouped, Row } from "./ui";
import type { FormState } from "@/app/actions/auth";

// Charges (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md): parts and services
// added on a maintenance visit ("Replace skimmer basket"), billed on the customer's monthly
// invoice; the same Add Charge sheet adds a line to a draft on a month's Monthly Billing page.

/** A price book item Add Charge offers (core chargeItems: services and parts). */
export interface ChargeItem {
  id: string;
  name: string;
  category: string | null;
  price_cents: number | null;
}

type Action = (prev: FormState, form: FormData) => Promise<FormState>;

/** The "+ Add Charge" row at the end of a grouped list, opening the Add Charge sheet. */
export function AddChargeRow({
  items,
  action,
  hidden,
  onAdded,
}: {
  items: ChargeItem[];
  action: Action;
  /** Hidden fields the action needs (the job, or the invoice and month). */
  hidden: Record<string, string>;
  onAdded?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const notify = useSheetNotice();
  return (
    <li>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-link hover:bg-text/[0.03] active:bg-text/[0.06]"
      >
        <span aria-hidden="true" className="text-xl leading-none">
          +
        </span>
        Add Charge
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add Charge">
        <SheetDone
          value={(message) => {
            setOpen(false);
            notify(message);
            onAdded?.(message);
          }}
        >
          {open ? <AddChargeForm items={items} action={action} hidden={hidden} /> : null}
        </SheetDone>
      </Sheet>
    </li>
  );
}

/** Add Charge: a price book item and how many, or a custom description and price. */
function AddChargeForm({
  items,
  action,
  hidden,
}: {
  items: ChargeItem[];
  action: Action;
  hidden: Record<string, string>;
}) {
  const [mode, setMode] = useState<"book" | "custom">(items.length ? "book" : "custom");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ChargeItem | null>(null);
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => !q || i.name.toLowerCase().includes(q));
  return (
    <div>
      <Segmented
        label="Charge from"
        hideLabel
        name="charge-mode"
        value={mode}
        options={[
          { value: "book", label: "Price Book" },
          { value: "custom", label: "Custom" },
        ]}
        onChange={setMode}
      />
      <SettingsForm action={action} submit="Add" full pinned>
        <input type="hidden" name="mode" value={mode} />
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {mode === "book" ? (
          <>
            <input type="hidden" name="item" value={picked?.id ?? ""} />
            <div className="mt-4 flex min-h-11 items-center gap-2 rounded-[10px] bg-fill px-3">
              <SearchIcon />
              <input
                type="search"
                aria-label="Search the price book"
                placeholder="Search the price book"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-h-11 min-w-0 flex-1 bg-transparent placeholder:text-placeholder"
              />
            </div>
            <Grouped className="mt-4">
              {shown.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(i)}
                    aria-pressed={picked?.id === i.id}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left hover:bg-text/[0.03]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block">{i.name}</span>
                      <span className="block text-[0.9375rem] text-text-muted">
                        {i.price_cents != null ? formatCents(i.price_cents) : "No price"}
                        {i.category ? ` · ${i.category}` : ""}
                      </span>
                    </span>
                    {picked?.id === i.id ? <Check /> : null}
                  </button>
                </li>
              ))}
              {shown.length === 0 ? (
                <li className="px-4 py-3 text-text-muted">
                  Nothing matches. Add it in Settings › Price Book, or use Custom.
                </li>
              ) : null}
            </Grouped>
            <div className="mt-4">
              <SettingsFields>
                <SField
                  label="Quantity"
                  name="quantity"
                  inputMode="decimal"
                  defaultValue="1"
                  required
                />
              </SettingsFields>
            </div>
            <FieldError name="item" />
          </>
        ) : (
          <div className="mt-4">
            <SettingsFields>
              <SField label="Description" name="description" required maxLength={200} />
              <SField
                label="Price ($)"
                name="price"
                inputMode="decimal"
                required
                placeholder="24.00"
              />
              <SField label="Quantity" name="quantity" inputMode="decimal" defaultValue="1" />
              <SSwitch label="Taxable" name="taxable" defaultChecked />
            </SettingsFields>
          </div>
        )}
      </SettingsForm>
    </div>
  );
}

/** A maintenance visit's Charges, on its Checklist tab. */
export function VisitCharges({
  jobId,
  charges,
  items,
  firstName,
  month,
  sentInvoice,
  extra,
}: {
  jobId: string;
  charges: VisitCharge[];
  items: ChargeItem[];
  firstName: string;
  month: string;
  /** The sent invoice they're on (they can't change then). */
  sentInvoice: { number: number | null; sentOn: string } | null;
  extra?: ReactNode;
}) {
  const locked = !!sentInvoice;
  return (
    <SheetNotices>
      <Grouped
        title="Charges"
        className="mb-6 max-w-2xl"
        footer={chargesFooter({ firstName, month, sentInvoice })}
      >
        {charges.map((c) =>
          locked ? (
            <Row
              key={c.id}
              label={c.name}
              detail={chargeDetail(c)}
              value={formatCents(chargeCents(c))}
            />
          ) : (
            <SheetRow
              key={c.id}
              label={c.name}
              detail={chargeDetail(c)}
              value={<span className="tabular-nums">{formatCents(chargeCents(c))}</span>}
              title={c.name}
            >
              <p className="mb-4 text-text-muted">
                {chargeDetail(c)} · {formatCents(chargeCents(c))}
              </p>
              <SettingsForm
                action={removeVisitCharge}
                submit="Remove Charge"
                danger
                full
                confirm="Remove this charge?"
              >
                <input type="hidden" name="charge" value={c.id} />
                <input type="hidden" name="job" value={jobId} />
              </SettingsForm>
            </SheetRow>
          ),
        )}
        {locked ? null : (
          <AddChargeRow items={items} action={addVisitCharge} hidden={{ job: jobId }} />
        )}
        {extra}
      </Grouped>
    </SheetNotices>
  );
}

function SearchIcon() {
  return (
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
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5 text-link"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
