import { parseDollars, type Cents } from "./money";
import { REPAIR_ITEM_KEY } from "./models";

/**
 * A repair job's repairs (owner, 2026-10-22: "On repair jobs, (in the intake and actually
 * working the job) we need a button to 'add additional repair'. It's common to go out and repair
 * multiple parts in one job."; docs/design/2026-10-22-multiple-repairs.md).
 *
 * Each repair is a `job_repair` row (supabase/migrations/20261022000800_job_repairs.sql), so
 * two techs adding repairs at once each add a row and neither is lost. The job's price
 * (job.fee_cents) is the sum of its live repairs: the phones write it with each change, and the
 * server keeps it so (app.job_repair_fee). A job booked before repairs were rows has none: its
 * booking (job.intake.repair_item and job.fee_cents) shows as its one repair, and the first
 * change makes that a row whose id is the job's id, so two phones doing it at once write the
 * same row.
 */

/** Every platform's words for repairs. Title Case for buttons and titles. */
export const REPAIR_LABELS = {
  /** The job's list, on Details. */
  section: "Repairs",
  add: "Add Additional Repair",
  remove: "Remove",
  total: "Total",
  /** New Job › Repair: the first repair's picker, then each added one's. */
  first: "What do they need?",
  additional: "Additional repair",
  /** The picker on an added repair and in the job's Add sheet. */
  item: "Repair",
  pick: "Pick from the price book…",
  custom: "Something else",
  description: "Describe the repair",
  price: "Price ($)",
  /** A repair with a price and no name. */
  fallback: "Repair",
  empty: "No repairs yet.",
  /** The add sheet's button. */
  save: "Add Repair",
  removeTitle: "Remove this repair?",
  removeMessage: "It comes off the job’s price. An invoice already made keeps it.",
  removeConfirm: "Remove Repair",
  footer: "Billed on the invoice, one line each.",
} as const;

/** The picker's value for "Something else" (a typed description). */
export const REPAIR_CUSTOM = "custom";

/** A `job_repair` row as phones and the website read it. */
export interface JobRepair {
  id: string;
  company_id?: string;
  job_id: string;
  price_book_item_id?: string | null;
  description: string;
  price_cents: Cents;
  sort_order: number;
  created_at?: string | null;
  deleted_at?: string | null;
}

/** One repair in the job's list. */
export interface RepairLine {
  id: string;
  description: string;
  price_cents: Cents;
  price_book_item_id: string | null;
  /** Only the booking so far (no row yet): removing or adding writes it as a row first. */
  booked: boolean;
}

/** The fields of the job the list reads. */
export interface RepairJob {
  id: string;
  type: string;
  fee_cents?: number | null;
  intake?: Record<string, unknown> | null;
}

function bookedName(job: RepairJob): string {
  const v = job.intake?.[REPAIR_ITEM_KEY];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * The job's repairs, in order: its live rows, or (a job with no rows yet) the repair it was
 * booked for, when it was booked for one or with a price. Only repair jobs have repairs.
 */
export function jobRepairLines(job: RepairJob, rows: readonly JobRepair[]): RepairLine[] {
  if (job.type !== "repair") return [];
  const own = rows.filter((r) => r.job_id === job.id);
  if (own.length === 0) {
    const name = bookedName(job);
    const fee = job.fee_cents ?? 0;
    if (!name && fee <= 0) return [];
    return [
      {
        id: job.id,
        description: name || REPAIR_LABELS.fallback,
        price_cents: Math.max(fee, 0),
        price_book_item_id: null,
        booked: true,
      },
    ];
  }
  return own
    .filter((r) => !r.deleted_at)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
        a.id.localeCompare(b.id),
    )
    .map((r) => ({
      id: r.id,
      description: r.description,
      price_cents: r.price_cents,
      price_book_item_id: r.price_book_item_id ?? null,
      booked: false,
    }));
}

/** The repairs' total: the job's price. */
export function repairsTotal(lines: readonly { price_cents: Cents }[]): Cents {
  return lines.reduce((sum, l) => sum + l.price_cents, 0);
}

/** A price book item a repair can be picked from. */
export interface RepairItem {
  id: string;
  name: string;
  cents: Cents;
}

/** A repair as typed: the picker's value ("" none, an item's id, or REPAIR_CUSTOM). */
export interface RepairDraft {
  pick: string;
  description: string;
  price: string;
}

export const EMPTY_REPAIR_DRAFT: RepairDraft = { pick: "", description: "", price: "" };

/** A repair to save. */
export interface RepairValues {
  price_book_item_id: string | null;
  description: string;
  price_cents: Cents;
}

export interface RepairCheck {
  /** Null: nothing entered (a blank row, left out). */
  repair: RepairValues | null;
  /** What to fix, by field. */
  errors: { description?: string; price?: string };
}

/** The price a picked item fills in: "450.00". */
export function repairPriceText(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

/**
 * Picking from the menu: an item fills in its price; "Something else" and "Pick…" keep what's
 * typed.
 */
export function pickRepair(
  draft: RepairDraft,
  pick: string,
  items: readonly RepairItem[],
): RepairDraft {
  const item = items.find((i) => i.id === pick);
  return { ...draft, pick, price: item ? repairPriceText(item.cents) : draft.price };
}

/**
 * One repair as typed. Its name is the item picked, else what was typed (a price alone is a
 * "Repair"); its price is required once it has a name. A row with nothing in it is left out,
 * unless `required` (the job's Add sheet).
 */
export function checkRepairDraft(
  draft: RepairDraft,
  items: readonly RepairItem[],
  required = false,
): RepairCheck {
  const item =
    draft.pick && draft.pick !== REPAIR_CUSTOM ? items.find((i) => i.id === draft.pick) : undefined;
  const typed = draft.pick === REPAIR_CUSTOM || items.length === 0 ? draft.description.trim() : "";
  const name = item?.name.trim() || typed;
  const priceText = draft.price.trim();
  if (!name && !priceText) {
    return required
      ? { repair: null, errors: { description: "Pick a repair or describe it." } }
      : { repair: null, errors: {} };
  }
  const errors: RepairCheck["errors"] = {};
  if (draft.pick === REPAIR_CUSTOM && !typed) errors.description = "Describe the repair.";
  else if (name.length > 200) errors.description = "Keep it under 200 characters.";
  const cents = priceText ? parseDollars(priceText) : null;
  if (!priceText) errors.price = "Enter a price like 185.";
  else if (cents === null || cents < 0) errors.price = "Enter a price like 185.";
  if (errors.description || errors.price) return { repair: null, errors };
  return {
    repair: {
      price_book_item_id: item?.id ?? null,
      description: name || REPAIR_LABELS.fallback,
      price_cents: cents!,
    },
    errors,
  };
}

/** New Job › Repair: every row checked; the repairs to save, in order, and each row's errors. */
export function checkRepairDrafts(
  drafts: readonly RepairDraft[],
  items: readonly RepairItem[],
): { repairs: RepairValues[]; errors: RepairCheck["errors"][]; ok: boolean } {
  const checks = drafts.map((d) => checkRepairDraft(d, items));
  return {
    repairs: checks.flatMap((c) => (c.repair ? [c.repair] : [])),
    errors: checks.map((c) => c.errors),
    ok: checks.every((c) => !c.errors.description && !c.errors.price),
  };
}

/**
 * What New Job keeps in job.intake.repair_item (older apps show it as "What they need"): the
 * repairs' names, or null when none.
 */
export function repairBookingName(repairs: readonly RepairValues[]): string | null {
  const names = repairs.map((r) => r.description.trim()).filter(Boolean);
  return names.length ? names.join(", ") : null;
}

/**
 * New Job: the job's price from its repairs (null when it has none, as a repair booked with no
 * price was before).
 */
export function repairsFee(repairs: readonly RepairValues[]): Cents | null {
  return repairs.length ? repairsTotal(repairs) : null;
}

/** A row to write through the sync layer: new (`insert`) or changed (`update`, by id). */
export type RepairWrite =
  | { kind: "insert"; id?: string; values: Omit<JobRepair, "id" | "company_id"> }
  | { kind: "update"; id: string; values: Partial<JobRepair> };

/** The booked repair as a row, with the job's id as its id (the same row on every phone). */
function bookedRow(
  job: RepairJob,
  line: RepairLine,
): Extract<RepairWrite, { kind: "insert" }> & { id: string } {
  return {
    kind: "insert",
    id: job.id,
    values: {
      job_id: job.id,
      price_book_item_id: null,
      description: line.description,
      price_cents: line.price_cents,
      sort_order: 0,
    },
  };
}

/**
 * Adding a repair on the job: its row, after the booked repair's row when there was only the
 * booking. Returns the writes, in order, and the job's new price.
 */
export function addRepairWrites(
  job: RepairJob,
  rows: readonly JobRepair[],
  repair: RepairValues,
): { writes: RepairWrite[]; fee_cents: Cents } {
  const lines = jobRepairLines(job, rows);
  const writes: RepairWrite[] = lines.filter((l) => l.booked).map((l) => bookedRow(job, l));
  const own = rows.filter((r) => r.job_id === job.id);
  const next = Math.max(0, ...own.map((r) => r.sort_order + 1), lines.length);
  writes.push({ kind: "insert", values: { job_id: job.id, ...repair, sort_order: next } });
  return { writes, fee_cents: repairsTotal(lines) + repair.price_cents };
}

/**
 * Removing a repair (soft delete, so it syncs): the booked one is written as a removed row.
 * `now` is the removal time (ISO). Returns the writes and the job's new price.
 */
export function removeRepairWrites(
  job: RepairJob,
  rows: readonly JobRepair[],
  id: string,
  now: string,
): { writes: RepairWrite[]; fee_cents: Cents } {
  const lines = jobRepairLines(job, rows);
  const line = lines.find((l) => l.id === id);
  if (!line) return { writes: [], fee_cents: repairsTotal(lines) };
  const fee = repairsTotal(lines.filter((l) => l.id !== id));
  if (line.booked) {
    const row = bookedRow(job, line);
    return { writes: [{ ...row, values: { ...row.values, deleted_at: now } }], fee_cents: fee };
  }
  return { writes: [{ kind: "update", id, values: { deleted_at: now } }], fee_cents: fee };
}
