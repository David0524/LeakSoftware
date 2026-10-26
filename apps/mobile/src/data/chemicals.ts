import { useMemo } from "react";
import {
  READING_LABELS,
  READING_LIMITS,
  chemicalItems,
  type AcidProduct,
  type AdditionDraft,
  type ChemicalAddition,
  type ChemicalItem,
  type ChemicalReading,
  type ChlorineProduct,
  type Property,
  type ReadingKey,
} from "@leakbook/core";
import type { JsonValue, Row as SyncRow } from "@leakbook/sync";
import { createAutosave, type Autosave } from "../lib/autosave";
import { removeRows } from "../lib/removal";
import { announceRemoved } from "../lib/removedBanner";
import { getServices } from "../lib/services";
import { useJobRows, useRow, useRows } from "./hooks";

type Row = ChemicalReading & { deleted_at?: string | null };

/**
 * The shop's chemical log on this phone (owner, 2026-10-19): every pool's submitted readings,
 * newest first, removed ones left out. Table `chemical_reading`.
 */
export function useChemicalLog(companyId: string): ChemicalReading[] {
  const rows = useRows<Row>("chemical_reading", companyId);
  return useMemo(
    () =>
      rows
        .filter((r) => !r.deleted_at)
        .sort((a, b) =>
          a.recorded_at < b.recorded_at ? 1 : a.recorded_at > b.recorded_at ? -1 : 0,
        ),
    [rows],
  );
}

/** Each pool's latest entry, by property id. */
export function latestByPool(log: ChemicalReading[]): Map<string, ChemicalReading> {
  const latest = new Map<string, ChemicalReading>();
  for (const r of log) if (!latest.has(r.property_id)) latest.set(r.property_id, r);
  return latest;
}

// ---------------------------------------------------------------------------
// A visit's Chemicals (owner, 2026-10-24: "the actual reading, the aim for, the suggested
// chemicals to add, and what was actually added"; docs/design/2026-10-24-chemicals-added.md;
// website components/visit-chemicals.tsx). The visit's readings are one `chemical_reading` row
// whose id is the visit's id, saved as the tech types (no Submit on visits); each chemical added
// is a `chemical_addition` row. Everything is written on the phone (row + outbox), so it works
// offline. The server sets each addition's price from the price book: the phone never writes
// it, and shows the price book's price until the server's arrives.
// ---------------------------------------------------------------------------

type AdditionRow = Omit<
  ChemicalAddition,
  "quantity" | "suggested_quantity" | "unit_price_cents"
> & {
  quantity: number | string;
  suggested_quantity: number | string | null;
  unit_price_cents: number | null;
};

/** The shop's chemicals as the visit and the Add Chemical sheet offer them. */
export function useChemicalItems(companyId: string): ChemicalItem[] {
  const rows = useRows<ChemicalItem>("price_book_item", companyId);
  return useMemo(() => chemicalItems(rows), [rows]);
}

function toAddition(r: AdditionRow, items: ChemicalItem[]): ChemicalAddition {
  return {
    ...r,
    quantity: Number(r.quantity),
    suggested_quantity: r.suggested_quantity === null ? null : Number(r.suggested_quantity),
    customer_supplied: !!r.customer_supplied,
    // Before the server's stored price arrives, the price book's.
    unit_price_cents:
      r.unit_price_cents ?? items.find((i) => i.id === r.price_book_item_id)?.price_cents ?? 0,
    sort_order: Number(r.sort_order ?? 0),
    added_at: r.added_at ?? "",
  };
}

/** The visit's added chemicals (removed ones left out). */
export function useVisitAdditions(
  companyId: string,
  jobId: string,
  items: ChemicalItem[],
): ChemicalAddition[] {
  const rows = useJobRows<AdditionRow>("chemical_addition", companyId, jobId);
  return useMemo(
    () => rows.filter((r) => !r.deleted_at).map((r) => toAddition(r, items)),
    [rows, items],
  );
}

/** A pool's added chemicals, for its log's monthly use. */
export function usePoolAdditions(companyId: string, propertyId: string): ChemicalAddition[] {
  const rows = useRows<AdditionRow>("chemical_addition", companyId);
  return useMemo(
    () =>
      rows
        .filter((r) => r.property_id === propertyId && !r.deleted_at)
        .map((r) => toAddition(r, [])),
    [rows, propertyId],
  );
}

/**
 * Additions billed on a sent invoice: they can't change (sent invoices are final; the server
 * refuses it). One whose invoice isn't on this phone yet counts as sent. The website's `locked`.
 */
export function useLockedAdditions(companyId: string, additions: ChemicalAddition[]): Set<string> {
  const invoices = useRows<{ id: string; status: string }>("invoice", companyId);
  return useMemo(() => {
    const status = new Map(invoices.map((i) => [i.id, i.status]));
    return new Set(
      additions
        .filter((a) => {
          if (!a.billed_invoice_id) return false;
          const s = status.get(a.billed_invoice_id);
          return s !== "draft" && s !== "void";
        })
        .map((a) => a.id),
    );
  }, [invoices, additions]);
}

/** The visit's own readings: the row whose id is the visit's, if typed yet. */
export function useVisitReading(jobId: string): ChemicalReading | null {
  const row = useRow<ChemicalReading & { deleted_at?: string | null }>("chemical_reading", jobId);
  return row && !row.deleted_at ? row : null;
}

export interface VisitReadingInput {
  companyId: string;
  jobId: string;
  pool: Property;
  gallons: string;
  readings: Partial<Record<ReadingKey, string>>;
  goals: Partial<Record<ReadingKey, string>>;
  chlorine: ChlorineProduct;
  acid: AcidProduct;
  notes: string;
}

/**
 * Saves the visit's readings as typed: one row per visit (its id the visit's, so two phones write
 * the same row), updated in place; cleared of every reading, removed (and back when typed
 * again). Fills in the pool's gallons when it has none. Returns why when something typed isn't
 * a reading yet (the website's messages).
 */
export function saveVisitReading(input: VisitReadingInput): string | null {
  const readings: Record<string, JsonValue> = {};
  const goals: Record<string, JsonValue> = {};
  for (const key of Object.keys(READING_LIMITS) as ReadingKey[]) {
    const { min, max } = READING_LIMITS[key];
    const raw = (input.readings[key] ?? "").replace(/,/g, "").trim();
    if (raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < min || n > max)
        return `${READING_LABELS[key]} should be between ${min} and ${max}.`;
      readings[key] = n;
    } else readings[key] = null;
    const goal = Number((input.goals[key] ?? "").replace(/,/g, "").trim() || "x");
    if (Number.isFinite(goal) && goal >= min && goal <= max) goals[key] = goal;
  }
  const gallonsText = input.gallons.replace(/[,\s]/g, "");
  const gallons = gallonsText ? Math.round(Number(gallonsText)) : null;
  if (gallons !== null && !(gallons > 0 && gallons < 10_000_000))
    return "Enter the gallons as a number, like 20,000.";
  const any = Object.values(readings).some((v) => v !== null);
  const { sync } = getServices();
  const existing = sync.get<SyncRow>("chemical_reading", input.jobId);
  const fields: Record<string, JsonValue> = {
    gallons,
    goals,
    chlorine_product: input.chlorine,
    acid_product: input.acid,
    notes: input.notes.trim() || null,
  };
  sync.batch(() => {
    if (!existing) {
      if (!any) return;
      sync.write("chemical_reading", input.jobId, input.companyId, {
        property_id: input.pool.id,
        job_id: input.jobId,
        recorded_at: new Date().toISOString(),
        ...fields,
        ...Object.fromEntries(Object.entries(readings).filter(([, v]) => v !== null)),
      });
    } else if (!any) {
      if (!existing.deleted_at)
        sync.write("chemical_reading", input.jobId, input.companyId, {
          deleted_at: new Date().toISOString(),
        });
    } else {
      const next: Record<string, JsonValue> = { ...fields, ...readings, deleted_at: null };
      // Only what changed goes in the outbox.
      const changed = Object.fromEntries(
        Object.entries(next).filter(
          ([k, v]) => JSON.stringify(existing[k] ?? null) !== JSON.stringify(v),
        ),
      );
      if (Object.keys(changed).length)
        sync.write("chemical_reading", input.jobId, input.companyId, changed);
    }
    // A pool's gallons fill in from the first visit that has them, as on the website.
    if (gallons !== null && !input.pool.approx_gallons)
      sync.write("property", input.pool.id, input.pool.company_id, { approx_gallons: gallons });
  });
  return null;
}

/** Where this phone remembers the levels the tech aims for (as the calculator). */
export const GOALS_KEY = "chemicals:goals";

/** The visit's Chemicals as typed: what `saveVisitReading` saves. */
export type VisitForm = Omit<VisitReadingInput, "companyId" | "jobId" | "pool">;

/**
 * The visit's readings save by themselves while the tech types (owner, 2026-10-25: "a little
 * laggy … when typing in multi digit numbers"): nothing is written per keystroke. They save a
 * second after typing stops, when a field is left and when the screen is left (`flush`), as
 * typed text everywhere (one-handed use, item 4). Each save also remembers the levels aimed for
 * on this phone. `visit` gives the visit at save time (the pool's gallons may have filled in).
 */
export function createVisitReadingSaver({
  visit,
  onSaved,
  delay,
}: {
  visit: () => { companyId: string; jobId: string; pool: Property };
  /** Why something typed isn't a reading yet, or null when it saved. */
  onSaved: (problem: string | null) => void;
  delay?: number;
}): Autosave<VisitForm> {
  return createAutosave<VisitForm>({
    initial: null as unknown as VisitForm,
    same: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    delay,
    save: (form) => {
      getServices().kv.set(GOALS_KEY, JSON.stringify(form.goals));
      onSaved(saveVisitReading({ ...visit(), ...form }));
    },
  });
}

/** Added: one chemical, or every open suggestion at once (Mark All Added). */
export function addChemicals(
  companyId: string,
  jobId: string,
  propertyId: string,
  drafts: AdditionDraft[],
  firstSort: number,
  extra?: { customer_supplied?: boolean; note?: string | null },
) {
  const { sync } = getServices();
  const now = new Date().toISOString();
  sync.batch(() => {
    drafts.forEach((d, i) =>
      sync.insert("chemical_addition", companyId, {
        job_id: jobId,
        property_id: propertyId,
        price_book_item_id: d.price_book_item_id,
        name: d.name,
        unit: d.unit,
        reading_key: d.reading_key,
        suggested_quantity: d.suggested_quantity,
        quantity: d.quantity,
        customer_supplied: !!extra?.customer_supplied,
        note: extra?.note?.trim() || null,
        added_at: now,
        sort_order: firstSort + i,
      }),
    );
  });
}

/** A change to an added chemical: another chemical, the amount, Customer Supplied, the note. */
export function updateChemical(companyId: string, a: ChemicalAddition) {
  getServices().sync.write("chemical_addition", a.id, companyId, {
    price_book_item_id: a.price_book_item_id,
    name: a.name,
    unit: a.unit,
    quantity: a.quantity,
    customer_supplied: a.customer_supplied,
    note: a.note?.trim() || null,
  });
}

/** Not added after all (soft delete, so it leaves every phone). */
export function removeChemical(companyId: string, id: string) {
  getServices().sync.write("chemical_addition", id, companyId, {
    deleted_at: new Date().toISOString(),
  });
}

/**
 * Remove Chemical on the Added Chemical sheet: off the visit at once, with "Chemical removed"
 * and Undo for five seconds (owner, 2026-10-26), not asked first.
 */
export function removeChemicalWithUndo(companyId: string, id: string) {
  announceRemoved(
    removeRows(getServices().sync, companyId, "chemical", [{ table: "chemical_addition", id }]),
  );
}
