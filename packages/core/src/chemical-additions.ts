import {
  READING_LABELS,
  goalRange,
  targets,
  type ChemistryResult,
  type DoseStep,
  type ReadingKey,
} from "./chemistry";
import { formatCents } from "./money";
import { lineTotal } from "./quote";

// Added chemicals (owner, 2026-10-24: "the actual reading, the aim for, the suggested chemicals
// to add, and what was actually added"; docs/design/2026-10-24-chemicals-added.md). What a tech
// adds on a visit is a synced row, `chemical_addition`; a suggestion that wasn't added is worked
// out live from the readings. Shops that charge for chemicals bill the month's additions on the
// monthly invoice, one line per chemical. No I/O. Ported to the iPhone app
// (apps/ios/Sources/SundeckCore/ChemicalAdditions.swift) and checked by its fixtures.

/** A price book item a tech can add (the Chemicals category, or one with a chemical key). */
export interface ChemicalItem {
  id: string;
  name: string;
  unit: string;
  price_cents: number;
  taxable?: boolean | null;
  category?: string | null;
  chemical?: string | null;
  sort_order?: number | null;
  active?: boolean | null;
  deleted_at?: string | null;
}

/** One chemical added on a visit (table `chemical_addition`). */
export interface ChemicalAddition {
  id: string;
  job_id: string;
  property_id: string;
  price_book_item_id: string | null;
  name: string;
  unit: string;
  /** The reading it answered, for an accepted suggestion; null for one added on its own. */
  reading_key: ReadingKey | null;
  suggested_quantity: number | null;
  quantity: number;
  customer_supplied: boolean;
  note: string | null;
  /** Set by the server from the price book when the row arrives. */
  unit_price_cents: number;
  taxable?: boolean | null;
  billed_invoice_id?: string | null;
  added_at: string;
  sort_order: number;
  deleted_at?: string | null;
}

/** The fields a new addition is written with, before it has an id. */
export interface AdditionDraft {
  price_book_item_id: string | null;
  name: string;
  unit: string;
  reading_key: ReadingKey | null;
  suggested_quantity: number | null;
  quantity: number;
  /** The price the phone shows until the server's stored price arrives. */
  unit_price_cents: number;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Settings › Price Book › Charge for Chemicals (company.settings.charge_chemicals). Off unset. */
export function chargesChemicals(settings: unknown): boolean {
  return (settings as { charge_chemicals?: unknown } | null)?.charge_chemicals === true;
}

/**
 * The settings to save when Charge for Chemicals is switched: turning it on records the month
 * it starts ("2026-10-01", in the shop's time zone), so earlier months are never billed.
 */
export function chargeChemicalsSettings(on: boolean, today: string): Record<string, unknown> {
  return on
    ? { charge_chemicals: true, charge_chemicals_from: `${today.slice(0, 7)}-01` }
    : { charge_chemicals: false };
}

export const CHARGE_CHEMICALS_TEXT = {
  label: "Charge for Chemicals",
  on: "Chemicals techs add on visits go on the customer’s monthly invoice at these prices, one line per chemical, and on the visit report with their prices.",
  off: "Chemicals techs add are recorded and shown on visit reports, without prices.",
} as const;

// ---------------------------------------------------------------------------
// Items and units
// ---------------------------------------------------------------------------

/** The chemicals a tech can pick, in price book order. */
export function chemicalItems(items: ChemicalItem[]): ChemicalItem[] {
  return items
    .filter(
      (i) => !i.deleted_at && i.active !== false && (i.category === "Chemicals" || i.chemical),
    )
    .sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "en-US"),
    );
}

/** The shop's item for a chemical the calculator suggests, the first in price book order. */
export function itemForChemical(
  items: ChemicalItem[],
  chemical: string | null | undefined,
): ChemicalItem | null {
  if (!chemical) return null;
  return chemicalItems(items).find((i) => i.chemical === chemical) ?? null;
}

/** How much the − and + buttons move an amount in each unit. */
export const UNIT_STEPS: Record<string, number> = {
  gal: 0.25,
  qt: 0.5,
  lb: 0.5,
  oz: 1,
  bag: 0.5,
  tab: 1,
  each: 1,
};

export function unitStep(unit: string): number {
  return UNIT_STEPS[unit.trim().toLowerCase()] ?? 1;
}

/** The next amount up or down: to the next whole step, never below one step. */
export function stepQuantity(quantity: number, unit: string, direction: 1 | -1): number {
  const step = unitStep(unit);
  const at = quantity / step;
  const next =
    direction > 0 ? Math.floor(at + 1e-9) * step + step : Math.ceil(at - 1e-9) * step - step;
  return Math.max(step, Math.round(next * 100) / 100);
}

const PER: Record<string, Record<string, number>> = {
  gal: { qt: 4, oz: 128 },
  qt: { gal: 0.25, oz: 32 },
  lb: { oz: 16 },
  oz: { lb: 1 / 16 },
};

/** An amount in another unit (gallons to quarts, pounds to ounces), or null when it can't be. */
export function convertQuantity(quantity: number, from: string, to: string): number | null {
  const f = from.trim().toLowerCase();
  const t = to.trim().toLowerCase();
  if (f === t) return quantity;
  const k = PER[f]?.[t];
  return k ? Math.round(quantity * k * 100) / 100 : null;
}

const FRACTIONS: [number, string][] = [
  [0.25, "¼"],
  [0.33, "⅓"],
  [0.5, "½"],
  [0.67, "⅔"],
  [0.75, "¾"],
];

/** 2.75 → "2¾", 0.33 → "⅓", 1.2 → "1.2". */
function amount(n: number): string {
  const r = Math.round(n * 100) / 100;
  const whole = Math.floor(r);
  const part = Math.round((r - whole) * 100) / 100;
  if (part === 0) return String(whole);
  const f = FRACTIONS.find(([v]) => Math.abs(v - part) < 0.005);
  if (f) return whole ? `${whole}${f[1]}` : f[1];
  return String(r);
}

const PLURAL: Record<string, string> = { tab: "tabs", bag: "bags", cup: "cups" };

/**
 * An amount the way a tech reads it: "½ gal", "2¾ gal", "1½ lb", "3 tabs", "1 bag". Under a
 * quarter gallon it reads in cups ("2 cups"), the way it was measured; "each" reads as a count.
 */
export function formatQuantity(quantity: number, unit: string): string {
  const u = unit.trim().toLowerCase();
  if (u === "gal" && quantity < 0.24) {
    const cups = Math.max(0.5, Math.round(quantity * 16 * 2) / 2);
    return `${amount(cups)} ${cups > 1 ? "cups" : "cup"}`;
  }
  if (u === "each") return amount(quantity);
  const word = quantity > 1 && PLURAL[u] ? PLURAL[u] : unit.trim();
  return `${amount(quantity)} ${word}`;
}

/** "½ gal Liquid chlorine", "2 × Phosphate remover". */
export function additionLabel(a: { quantity: number; unit: string; name: string }): string {
  return a.unit.trim().toLowerCase() === "each"
    ? `${amount(a.quantity)} × ${a.name}`
    : `${formatQuantity(a.quantity, a.unit)} ${a.name}`;
}

/** The price per unit: "$8.00 / gal", "$35.00 each". */
export function unitPriceLabel(cents: number, unit: string): string {
  const price = formatCents(cents);
  return unit.trim().toLowerCase() === "each" ? `${price} each` : `${price} / ${unit.trim()}`;
}

// ---------------------------------------------------------------------------
// Suggestions and the visit's rows
// ---------------------------------------------------------------------------

/** What a step suggests, in words: "½ gal liquid chlorine". */
export function suggestionText(step: DoseStep): string {
  if (step.quantity === null || step.unit === null) return step.product;
  const product = step.product.replace(/ \d+(\.\d+)?%/, "").replace(/ \(.*\)$/, "");
  return `${formatQuantity(step.quantity, step.unit)} ${product.toLowerCase()}`;
}

/**
 * The addition a suggestion makes when the tech taps it: the shop's item for the chemical
 * (its name, unit and price), the amount in that unit. Without an item it's the calculator's
 * product at no price. Null for an action (drain, hold off).
 */
export function suggestedAddition(step: DoseStep, items: ChemicalItem[]): AdditionDraft | null {
  if (step.chemical === null || step.quantity === null || step.unit === null) return null;
  const item = itemForChemical(items, step.chemical);
  if (!item) {
    const name = step.product.replace(/ \d+(\.\d+)?%/, "");
    return {
      price_book_item_id: null,
      name,
      unit: step.unit,
      reading_key: step.key,
      suggested_quantity: step.quantity,
      quantity: step.quantity,
      unit_price_cents: 0,
    };
  }
  const converted = convertQuantity(step.quantity, step.unit, item.unit);
  return {
    price_book_item_id: item.id,
    name: item.name,
    unit: item.unit,
    reading_key: step.key,
    suggested_quantity: converted ?? step.quantity,
    // A unit that doesn't convert (a jug, a bucket) starts at one of it; the tech sets it.
    quantity: converted ?? 1,
    unit_price_cents: item.price_cents,
  };
}

/** The addition picked from the Add Chemical sheet: one step of the item's unit. */
export function itemAddition(item: ChemicalItem, quantity?: number): AdditionDraft {
  return {
    price_book_item_id: item.id,
    name: item.name,
    unit: item.unit,
    reading_key: null,
    suggested_quantity: null,
    quantity: quantity ?? Math.max(1, unitStep(item.unit)),
    unit_price_cents: item.price_cents,
  };
}

const live = <T extends { deleted_at?: string | null }>(rows: T[]) =>
  rows.filter((r) => !r.deleted_at);

export interface ChemicalRow {
  key: ReadingKey;
  /** The step for this reading, with its place in the order to add (1, 2, 3), if any. */
  step: DoseStep | null;
  order: number | null;
  /** What the suggestion would add, for "Not added yet" and the one-tap add. */
  suggestion: AdditionDraft | null;
  /** What was added for this reading. */
  added: ChemicalAddition[];
}

/**
 * The visit's Chemicals section: one row per reading (the calculator's reading order), each
 * with its suggestion and what was added for it; then what was added on its own ("Also
 * Added"), oldest first.
 */
export function chemicalRows(
  result: ChemistryResult,
  additions: ChemicalAddition[],
  items: ChemicalItem[],
): { rows: ChemicalRow[]; extras: ChemicalAddition[] } {
  const order: ReadingKey[] = ["fc", "ph", "ta", "ch", "cya", "salt"];
  const added = live(additions).sort(
    (a, b) => a.sort_order - b.sort_order || a.added_at.localeCompare(b.added_at),
  );
  const rows = order.map((key) => {
    const i = result.steps.findIndex((s) => s.key === key);
    const step = i >= 0 ? result.steps[i]! : null;
    return {
      key,
      step,
      order: i >= 0 ? i + 1 : null,
      suggestion: step ? suggestedAddition(step, items) : null,
      added: added.filter((a) => a.reading_key === key),
    };
  });
  return { rows, extras: added.filter((a) => a.reading_key === null) };
}

/** The suggestions not added yet: what Mark All Added adds. */
export function openSuggestions(rows: ChemicalRow[]): AdditionDraft[] {
  return rows
    .filter((r) => r.suggestion && r.added.length === 0)
    .map((r) => r.suggestion as AdditionDraft);
}

/** What the added chemicals come to (customer-supplied ones are never billed). */
export function additionsCents(additions: ChemicalAddition[]): number {
  return live(additions)
    .filter((a) => !a.customer_supplied)
    .reduce(
      (sum, a) => sum + lineTotal({ quantity: a.quantity, unit_price_cents: a.unit_price_cents }),
      0,
    );
}

/** The chemical card's closed line: "3 added · FC 1 · pH 7.8" (the count first, so a narrow
 * screen that cuts the line short still shows it). */
export function chemicalCardLine(readingLine: string, additions: ChemicalAddition[]): string {
  const n = live(additions).length;
  const parts = [n ? `${n} added` : "", readingLine].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Add today’s readings";
}

// ---------------------------------------------------------------------------
// Totals: the monthly invoice's lines, the monthly report, the pool's log
// ---------------------------------------------------------------------------

export interface ChemicalTotal {
  name: string;
  unit: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  customer_supplied: boolean;
}

/**
 * Added chemicals totaled per chemical, unit and price, in the order first added: one invoice
 * line each (the database's app.chemical_lines groups the same way), the monthly report's
 * "Chemicals This Month". Customer-supplied ones are totaled apart, at no charge.
 */
export function chemicalTotals(additions: ChemicalAddition[]): ChemicalTotal[] {
  const out: ChemicalTotal[] = [];
  const sorted = live(additions).sort(
    (a, b) => a.added_at.localeCompare(b.added_at) || a.sort_order - b.sort_order,
  );
  for (const a of sorted) {
    const supplied = !!a.customer_supplied;
    const price = supplied ? 0 : a.unit_price_cents;
    const t = out.find(
      (x) =>
        x.name === a.name &&
        x.unit === a.unit &&
        x.unit_price_cents === price &&
        x.customer_supplied === supplied,
    );
    if (t) t.quantity = Math.round((t.quantity + Number(a.quantity)) * 100) / 100;
    else
      out.push({
        name: a.name,
        unit: a.unit,
        quantity: Number(a.quantity),
        unit_price_cents: price,
        total_cents: 0,
        customer_supplied: supplied,
      });
  }
  for (const t of out)
    t.total_cents = lineTotal({ quantity: t.quantity, unit_price_cents: t.unit_price_cents });
  return out;
}

/** "October", from a date ("2026-10-23" or a timestamp) in the shop's time zone. */
export function monthName(isoOrDate: string, timeZone: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)
    ? new Date(`${isoOrDate}T12:00:00Z`)
    : new Date(isoOrDate);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? "UTC" : timeZone,
  }).format(d);
}

/**
 * The pool's chemicals by month (owner, 2026-10-24: monthly usage on the pool's chemical log),
 * newest month first: "October · 2¾ gal Liquid chlorine, 12 tabs Chlorine tabs".
 */
export function monthlyUsage(
  additions: ChemicalAddition[],
  timeZone: string,
  months = 3,
): { month: string; label: string; line: string }[] {
  const key = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone })
      .format(new Date(iso))
      .slice(0, 7);
  const byMonth = new Map<string, ChemicalAddition[]>();
  for (const a of live(additions)) {
    const m = key(a.added_at);
    byMonth.set(m, [...(byMonth.get(m) ?? []), a]);
  }
  return [...byMonth.keys()]
    .sort()
    .reverse()
    .slice(0, months)
    .map((m) => {
      const totals = chemicalTotals(byMonth.get(m)!).reduce<ChemicalTotal[]>((acc, t) => {
        // Usage, not billing: one figure per chemical whatever it cost.
        const same = acc.find((x) => x.name === t.name && x.unit === t.unit);
        if (same) same.quantity = Math.round((same.quantity + t.quantity) * 100) / 100;
        else acc.push({ ...t });
        return acc;
      }, []);
      return {
        month: m,
        label: monthName(`${m}-15`, timeZone),
        line: totals.map((t) => additionLabel(t)).join(", "),
      };
    });
}

// ---------------------------------------------------------------------------
// The visit report
// ---------------------------------------------------------------------------

/** An added chemical as the report snapshot keeps it. */
export interface ReportAddition {
  name: string;
  unit: string;
  quantity: number;
  reading_key: ReadingKey | null;
  note: string | null;
  customer_supplied: boolean;
  unit_price_cents: number;
}

export interface ReportAddedRow {
  label: string;
  /** "To lower pH", the note, or nothing. */
  why: string | null;
  /** "$4.00" when the shop charged; null otherwise or when the customer supplied it. */
  price: string | null;
  supplied: boolean;
}

/**
 * The report's Added Chemicals: one line each, why it was added (from the reading it answered:
 * up or down from where it was aimed), and the price when the shop charged for it.
 */
export function reportAddedRows(
  added: ReportAddition[],
  reading: Partial<Record<ReadingKey, number | null>> | null | undefined,
  goals: Partial<Record<ReadingKey, number | null>> | null | undefined,
  charged: boolean,
): ReportAddedRow[] {
  const t = targets(reading?.cya ?? null);
  return added.map((a) => {
    let why: string | null = a.note?.trim() || null;
    const key = a.reading_key;
    const value = key ? reading?.[key] : null;
    if (!why && key && value !== null && value !== undefined) {
      const aim = goalRange(t[key], key, goals?.[key]).target;
      why = `To ${Number(value) > aim ? "lower" : "raise"} ${READING_LABELS[key] === "pH" ? "pH" : READING_LABELS[key].toLowerCase()}`;
    }
    const supplied = !!a.customer_supplied;
    return {
      label: additionLabel(a),
      why,
      price:
        charged && !supplied
          ? formatCents(lineTotal({ quantity: a.quantity, unit_price_cents: a.unit_price_cents }))
          : null,
      supplied,
    };
  });
}

/** What the report's chemicals came to, when the shop charged: "$28.75". */
export function reportAddedTotal(added: ReportAddition[], charged: boolean): string | null {
  if (!charged) return null;
  const cents = added
    .filter((a) => !a.customer_supplied)
    .reduce(
      (s, a) => s + lineTotal({ quantity: a.quantity, unit_price_cents: a.unit_price_cents }),
      0,
    );
  return cents > 0 ? formatCents(cents) : null;
}
