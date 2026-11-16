import { useMemo } from "react";
import { chargeItems, parseDollars, type VisitCharge } from "@leakbook/core";
import { lineDescriptionError } from "../lib/limits";
import { parseLineQuantity } from "../lib/lineQuantity";
import { getServices } from "../lib/services";
import { useJobRows, useRows } from "./hooks";

// Charges (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md): parts and services
// added on a maintenance visit ("Replace skimmer basket"), billed on the customer's monthly
// invoice, as the website's components/charges.tsx. Each is a `visit_charge` row written on the
// phone (row + outbox), so it works offline like the rest of a visit. A price book item's price
// is the server's (it replaces what the phone sends); a custom charge keeps the price typed. The
// same Add Charge sheet adds a line to a draft on a month's Monthly Billing page.

/** A price book item Add Charge offers (core chargeItems: services and parts, not chemicals). */
export interface ChargeItem {
  id: string;
  name: string;
  category: string | null;
  price_cents: number | null;
  taxable: boolean;
}

interface ItemRow {
  id: string;
  name: string;
  category?: string | null;
  chemical?: string | null;
  price_cents?: number | null;
  taxable?: boolean | null;
  active?: boolean | null;
  sort_order?: number | null;
  deleted_at?: string | null;
}

/** The shop's price book as Add Charge offers it: active services and parts, in book order. */
export function chargeItemsOf(rows: ItemRow[]): ChargeItem[] {
  return chargeItems(rows.filter((r) => r.active !== false))
    .sort(
      (a, b) =>
        Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || a.name.localeCompare(b.name),
    )
    .map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category ?? null,
      price_cents: r.price_cents ?? null,
      taxable: r.taxable ?? true,
    }));
}

export function useChargeItems(companyId: string): ChargeItem[] {
  const rows = useRows<ItemRow>("price_book_item", companyId);
  return useMemo(() => chargeItemsOf(rows), [rows]);
}

type ChargeRow = Omit<VisitCharge, "quantity"> & { quantity: number | string };

/** The visit's charges (removed ones left out), oldest first. */
export function useVisitCharges(companyId: string, jobId: string): VisitCharge[] {
  const rows = useJobRows<ChargeRow>("visit_charge", companyId, jobId);
  return useMemo(
    () =>
      rows
        .filter((r) => !r.deleted_at)
        .map((r) => ({ ...r, quantity: Number(r.quantity) }))
        .sort((a, b) =>
          (a.added_at ?? "") < (b.added_at ?? "")
            ? -1
            : (a.added_at ?? "") > (b.added_at ?? "")
              ? 1
              : a.id.localeCompare(b.id),
        ),
    [rows],
  );
}

interface InvoiceRow {
  id: string;
  status: string;
  number?: number | null;
  sent_at?: string | null;
}

/**
 * The sent invoice the visit's charges are on, if any (they can't change then; the server
 * refuses it). One billed on an invoice that isn't on this phone counts as sent, with no number
 * or date (`known: false`), as the visit's chemicals do.
 */
export function chargesSentInvoice(
  charges: Pick<VisitCharge, "billed_invoice_id">[],
  invoices: InvoiceRow[],
): { number: number | null; sentAt: string | null; known: boolean } | null {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  for (const c of charges) {
    if (!c.billed_invoice_id) continue;
    const inv = byId.get(c.billed_invoice_id);
    if (!inv) return { number: null, sentAt: null, known: false };
    if (inv.status !== "draft" && inv.status !== "void")
      return { number: inv.number ?? null, sentAt: inv.sent_at ?? null, known: true };
  }
  return null;
}

export function useChargesSentInvoice(companyId: string, charges: VisitCharge[]) {
  const invoices = useRows<InvoiceRow>("invoice", companyId);
  return useMemo(() => chargesSentInvoice(charges, invoices), [charges, invoices]);
}

/** What Add Charge typed or picked. */
export type ChargeInput =
  | { mode: "book"; item: ChargeItem | null; quantity: string }
  | { mode: "custom"; description: string; price: string; quantity: string; taxable: boolean };

export type ChargeFieldErrors = Partial<
  Record<"item" | "description" | "price" | "quantity", string>
>;

/** A charge ready to save: the name, how many, the price, and the price book item. */
export interface ChargeValues {
  name: string;
  quantity: number;
  unit_price_cents: number;
  taxable: boolean;
  price_book_item_id: string | null;
}

/** Add Charge's fields checked as the website's (actions/monthly-billing.ts chargeFields). */
export function checkCharge(
  input: ChargeInput,
): { values: ChargeValues; errors: null } | { values: null; errors: ChargeFieldErrors } {
  const quantity = parseLineQuantity(input.quantity.trim());
  if (quantity === null || quantity <= 0 || quantity > 10_000)
    return { values: null, errors: { quantity: "Enter a quantity like 1 or 2.5." } };
  if (input.mode === "book") {
    if (!input.item) return { values: null, errors: { item: "Pick an item from the price book." } };
    return {
      errors: null,
      values: {
        name: input.item.name,
        quantity,
        unit_price_cents: input.item.price_cents ?? 0,
        taxable: input.item.taxable,
        price_book_item_id: input.item.id,
      },
    };
  }
  const errors: ChargeFieldErrors = {};
  const name = input.description.trim();
  const described = lineDescriptionError(name);
  if (described) errors.description = described;
  const price = parseDollars(input.price.trim());
  if (price === null || price < 0) errors.price = "Enter a price like 24.";
  if (Object.keys(errors).length) return { values: null, errors };
  return {
    errors: null,
    values: {
      name,
      quantity,
      unit_price_cents: price!,
      taxable: input.taxable,
      price_book_item_id: null,
    },
  };
}

/** Add Charge on a visit (anyone on the team who can see it). Returns the new row's id. */
export function addVisitCharge(companyId: string, jobId: string, v: ChargeValues): string {
  return getServices().sync.insert("visit_charge", companyId, {
    job_id: jobId,
    price_book_item_id: v.price_book_item_id,
    name: v.name,
    quantity: v.quantity,
    unit_price_cents: v.unit_price_cents,
    taxable: v.taxable,
    added_at: new Date().toISOString(),
  });
}

/** Remove a charge from a visit (soft delete, so it leaves every phone). */
export function removeVisitCharge(companyId: string, id: string) {
  getServices().sync.write("visit_charge", id, companyId, {
    deleted_at: new Date().toISOString(),
  });
}

/** Add Charge on a month's page: a line at the end of that customer's draft. */
export function addInvoiceCharge(companyId: string, invoiceId: string, v: ChargeValues): string {
  const { sync } = getServices();
  const last = sync
    .list("invoice_line_item", companyId)
    .filter((l) => l.invoice_id === invoiceId)
    .reduce((max, l) => Math.max(max, Number(l.sort_order ?? 0)), 0);
  return sync.insert("invoice_line_item", companyId, {
    invoice_id: invoiceId,
    kind: "item",
    description: v.name,
    quantity: v.quantity,
    unit_price_cents: v.unit_price_cents,
    taxable: v.taxable,
    sort_order: last + 1,
  });
}

/** Remove a line from a draft on a month's page (soft delete). */
export function removeInvoiceLine(companyId: string, id: string) {
  getServices().sync.write("invoice_line_item", id, companyId, {
    deleted_at: new Date().toISOString(),
  });
}
