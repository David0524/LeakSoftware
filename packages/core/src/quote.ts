import type { Cents } from "./money";
import type { CompanySettings } from "./models";

// Quotes (BUILD_PLAN 6.4). All money is integer cents and rates are basis points
// (1% = 100). The database recomputes the same totals when a quote is sent
// (app.quote_totals in 20261012001300_quotes.sql); test/quote.test.ts and
// supabase/tests/090_quotes.test.sql use the same figures.

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export interface Quote {
  id: string;
  company_id: string;
  job_id: string;
  number?: number | null;
  status: QuoteStatus;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_rule?: DepositRule | null;
  deposit_cents: number;
  valid_until?: string | null;
  notes?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  accepted_by_name?: string | null;
  repair_job_id?: string | null;
  deleted_at?: string | null;
}

export interface QuoteLine {
  id?: string;
  quantity: number;
  unit_price_cents: number;
  taxable: boolean;
  description?: string;
  finding_id?: string | null;
  price_book_item_id?: string | null;
  warranty_months?: number | null;
  sort_order?: number;
  deleted_at?: string | null;
}

export interface PriceBookItem {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  component_type_key?: string | null;
  unit: string;
  price_cents: number;
  taxable: boolean;
  warranty_months?: number | null;
  sort_order: number;
  active: boolean;
  deleted_at?: string | null;
}

export type DepositRule = CompanySettings["deposit"];

/** Round half away from zero, for money. */
function roundCents(n: number): Cents {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** quantity × unit price. Quantities have at most 2 decimals. */
export function lineTotal(line: Pick<QuoteLine, "quantity" | "unit_price_cents">): Cents {
  const hundredths = Math.round(line.quantity * 100);
  return roundCents((hundredths * line.unit_price_cents) / 100);
}

export interface QuoteTotals {
  subtotal_cents: Cents;
  discount_cents: Cents;
  tax_cents: Cents;
  total_cents: Cents;
  deposit_cents: Cents;
}

/**
 * Totals for a quote. The discount comes off before tax, shared between taxable and
 * untaxed lines in proportion to their amounts. The deposit follows the rule, never below
 * its minimum and never above the total.
 */
export function quoteTotals(
  lines: QuoteLine[],
  discountCents: Cents,
  taxRateBps: number,
  deposit: DepositRule,
): QuoteTotals {
  const live = lines.filter((l) => !l.deleted_at);
  const subtotal = live.reduce((sum, l) => sum + lineTotal(l), 0);
  const taxable = live.filter((l) => l.taxable).reduce((sum, l) => sum + lineTotal(l), 0);
  const discount = Math.min(Math.max(0, Math.round(discountCents)), subtotal);
  const taxableDiscount = subtotal === 0 ? 0 : roundCents((discount * taxable) / subtotal);
  const tax = roundCents(((taxable - taxableDiscount) * taxRateBps) / 10_000);
  const total = subtotal - discount + tax;
  return {
    subtotal_cents: subtotal,
    discount_cents: discount,
    tax_cents: tax,
    total_cents: total,
    deposit_cents: depositFor(total, deposit),
  };
}

export function depositFor(total: Cents, rule: DepositRule): Cents {
  if (total <= 0) return 0;
  const base =
    rule.type === "fixed"
      ? (rule.value_cents ?? 0)
      : roundCents((total * (rule.value_bps ?? 0)) / 10_000);
  return Math.min(total, Math.max(base, rule.minimum_cents ?? 0));
}

/** Discount as basis points of the subtotal, for the tech discount limit. */
export function discountBps(subtotal: Cents, discount: Cents): number {
  return subtotal <= 0 ? 0 : Math.ceil((discount * 10_000) / subtotal);
}

/** A tech's discount is capped by company settings; owners may give any discount. */
export function discountAllowed(
  subtotal: Cents,
  discount: Cents,
  isOwner: boolean,
  limitBps: number,
): boolean {
  return isOwner || discountBps(subtotal, discount) <= limitBps;
}

/** Price book items to suggest for a finding on a component of this type. */
export function suggestItems(
  items: PriceBookItem[],
  componentTypeKey: string | null | undefined,
): PriceBookItem[] {
  const active = items.filter((i) => i.active && !i.deleted_at);
  const order = (a: PriceBookItem, b: PriceBookItem) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  const matching = componentTypeKey
    ? active.filter((i) => i.component_type_key === componentTypeKey).sort(order)
    : [];
  return matching;
}

/** A new line copied from a price book item, so later price changes don't touch the quote. */
export function lineFromItem(item: PriceBookItem, findingId: string | null): QuoteLine {
  return {
    description: item.description ? `${item.name}: ${item.description}` : item.name,
    quantity: 1,
    unit_price_cents: item.price_cents,
    taxable: item.taxable,
    warranty_months: item.warranty_months ?? null,
    finding_id: findingId,
    price_book_item_id: item.id,
  };
}

/** The text a tech sends with the quote link. */
export function quoteShareText(shopName: string, link: string): string {
  return `${shopName}: your repair quote. Review and accept it here: ${link}`;
}
