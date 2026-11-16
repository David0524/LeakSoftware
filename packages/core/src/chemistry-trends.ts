import {
  READING_LABELS,
  goalRange,
  targets,
  type ChemicalKey,
  type ChemicalReading,
  type ReadingKey,
} from "./chemistry";
import {
  additionsCents,
  convertQuantity,
  formatQuantity,
  type ChemicalAddition,
} from "./chemical-additions";
import { formatCents } from "./money";
import type { NotificationText } from "./notifications";

// Water chemistry trends, out-of-range readings and dose limits (docs/design/2026-11-16-
// chemistry-trends.md). Turns the pool's chemical log into chart series, finds readings well
// outside their range (the alert and the Chemicals page's Out of Range list), and warns when a
// tech records more of a chemical than is usual in one dose. No I/O. Ported to the iPhone app
// (apps/ios/Sources/SundeckCore/ChemistryTrends.swift) and checked by its fixtures.

const READING_ORDER: ReadingKey[] = ["fc", "ph", "ta", "ch", "cya", "salt"];
const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** 7.5 -> "7.5", 8 -> "8", 7.25 -> "7.25". */
const show = (n: number) => String(round2(n));

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export type TrendPeriod = "90d" | "6m" | "1y";

/** The Segmented control on a pool's chemical log: 90 Days | 6 Months | 1 Year. */
export const TREND_PERIODS: { key: TrendPeriod; label: string; days: number }[] = [
  { key: "90d", label: "90 Days", days: 90 },
  { key: "6m", label: "6 Months", days: 183 },
  { key: "1y", label: "1 Year", days: 365 },
];

/** The period's first and last moment (ISO), ending now. */
export function trendWindow(period: TrendPeriod, now: string): { from: string; to: string } {
  const days = TREND_PERIODS.find((p) => p.key === period)?.days ?? 90;
  const to = Date.parse(now);
  return { from: new Date(to - days * DAY_MS).toISOString(), to: new Date(to).toISOString() };
}

export interface TrendPoint {
  at: string;
  value: number;
}

/** One reading's line: its points, the range to shade, the chart's vertical span. */
export interface ReadingSeries {
  key: ReadingKey;
  label: string;
  points: TrendPoint[];
  /** The shaded range, from the latest reading's levels (Aim For included). */
  low: number;
  high: number;
  /** The chart's vertical span: every point and the range, with a little room. */
  min: number;
  max: number;
  latest: number;
  status: "low" | "ok" | "high";
  /** One sentence for VoiceOver and TalkBack. */
  summary: string;
}

/**
 * A line per reading taken in the period (Free Chlorine, pH, Alkalinity, Calcium, Stabilizer,
 * Salt where present), oldest point first, each with the range the pool aims for.
 */
export function readingSeries(
  readings: ChemicalReading[],
  period: TrendPeriod,
  now: string,
): ReadingSeries[] {
  const w = trendWindow(period, now);
  const from = Date.parse(w.from);
  const to = Date.parse(w.to);
  const rows = readings
    .filter((r) => {
      const t = Date.parse(r.recorded_at);
      return t >= from && t <= to;
    })
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const out: ReadingSeries[] = [];
  for (const key of READING_ORDER) {
    const taken = rows.filter((r) => typeof r[key] === "number" && Number.isFinite(r[key]));
    if (taken.length === 0) continue;
    const points = taken.map((r) => ({ at: r.recorded_at, value: r[key] as number }));
    const last = taken[taken.length - 1]!;
    const range = goalRange(targets(last.cya ?? null)[key], key, last.goals?.[key]);
    const low = round2(range.low);
    const high = round2(range.high);
    const values = points.map((p) => p.value);
    const lo = Math.min(...values, low);
    const hi = Math.max(...values, high);
    const pad = hi > lo ? (hi - lo) * 0.1 : 1;
    const latest = values[values.length - 1]!;
    const status = latest < low ? "low" : latest > high ? "high" : "ok";
    const word = status === "ok" ? "in range" : status;
    const aim = `Aim for ${show(low)} to ${show(high)}.`;
    const label = READING_LABELS[key];
    const summary =
      points.length === 1
        ? `${label}: 1 reading, ${show(latest)} (${word}). ${aim}`
        : `${label}: ${points.length} readings, from ${show(values[0]!)} to ${show(latest)} (${word}). Lowest ${show(Math.min(...values))}, highest ${show(Math.max(...values))}. ${aim}`;
    out.push({
      key,
      label,
      points,
      low,
      high,
      min: round2(Math.max(0, lo - pad)),
      max: round2(hi + pad),
      latest,
      status,
      summary,
    });
  }
  return out;
}

export interface CostBar {
  /** "2026-10" */
  month: string;
  /** "Oct" */
  label: string;
  cents: number;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * What the pool's added chemicals cost each calendar month of the period, oldest first, a bar
 * for every month (zero when nothing was added). Prices are the ones stored on each addition;
 * customer-supplied chemicals cost nothing.
 */
export function chemicalCostBars(
  additions: ChemicalAddition[],
  period: TrendPeriod,
  now: string,
  timeZone: string,
): CostBar[] {
  const key = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone })
      .format(new Date(iso))
      .slice(0, 7);
  const w = trendWindow(period, now);
  const last = key(w.to);
  const byMonth = new Map<string, ChemicalAddition[]>();
  for (const a of additions) {
    if (a.deleted_at) continue;
    const m = key(a.added_at);
    byMonth.set(m, [...(byMonth.get(m) ?? []), a]);
  }
  const bars: CostBar[] = [];
  let year = Number(key(w.from).slice(0, 4));
  let month = Number(key(w.from).slice(5, 7));
  for (let i = 0; i < 14; i++) {
    const m = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
    if (m > last) break;
    bars.push({
      month: m,
      label: SHORT_MONTHS[month - 1]!,
      cents: additionsCents(byMonth.get(m) ?? []),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return bars;
}

/** The cost chart for VoiceOver: "Chemicals cost $85.00 in 4 months. Aug $0.00, Sep $40.00…". */
export function costSummary(bars: CostBar[]): string {
  const total = bars.reduce((sum, b) => sum + b.cents, 0);
  return `Chemicals cost ${formatCents(total)} in ${bars.length} ${bars.length === 1 ? "month" : "months"}. ${bars.map((b) => `${b.label} ${formatCents(b.cents)}`).join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Out of range
// ---------------------------------------------------------------------------

/**
 * How far past the range's edge a reading must be to count as out of range: a reading a hair
 * outside isn't news, and the tech was there to fix it. Free chlorine 1 ppm, pH 0.2, alkalinity
 * 20, calcium 50, stabilizer 10, salt 300.
 */
export const OUT_OF_RANGE_MARGIN: Record<ReadingKey, number> = {
  fc: 1,
  ph: 0.2,
  ta: 20,
  ch: 50,
  cya: 10,
  salt: 300,
};

export interface OutOfRangeReading {
  key: ReadingKey;
  label: string;
  value: number;
  /** "7.4"; the value as it reads in a sentence. */
  valueText: string;
  /** "7.4–7.6" */
  range: string;
  direction: "low" | "high";
}

/** The readings of one log entry that are outside their range by more than the margin. */
export function outOfRangeReadings(r: ChemicalReading): OutOfRangeReading[] {
  const t = targets(r.cya ?? null);
  const out: OutOfRangeReading[] = [];
  for (const key of READING_ORDER) {
    const value = r[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const range = goalRange(t[key], key, r.goals?.[key]);
    const margin = OUT_OF_RANGE_MARGIN[key];
    const direction =
      value < range.low - margin ? "low" : value > range.high + margin ? "high" : null;
    if (!direction) continue;
    out.push({
      key,
      label: READING_LABELS[key],
      value,
      valueText: show(value),
      range: `${show(range.low)}–${show(range.high)}`,
      direction,
    });
  }
  return out;
}

/** One out-of-range reading on the Out of Range list. */
export interface OutOfRangeRow extends OutOfRangeReading {
  /** "<log entry id>:<reading key>" */
  id: string;
  readingId: string;
  propertyId: string;
  recordedAt: string;
  recordedBy: string | null;
}

/** The last 30 days' out-of-range readings, newest first (Chemicals › Out of Range). */
export function outOfRangeRows(
  readings: ChemicalReading[],
  now: string,
  days = 30,
): OutOfRangeRow[] {
  const from = Date.parse(now) - days * DAY_MS;
  const rows: OutOfRangeRow[] = [];
  for (const r of readings) {
    const at = Date.parse(r.recorded_at);
    if (!(at >= from) || at > Date.parse(now)) continue;
    for (const o of outOfRangeReadings(r))
      rows.push({
        ...o,
        id: `${r.id}:${o.key}`,
        readingId: r.id,
        propertyId: r.property_id,
        recordedAt: r.recorded_at,
        recordedBy: r.recorded_by ?? null,
      });
  }
  return rows.sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
}

/** "pH 8.2 high (aim 7.4–7.6)". */
export function outOfRangeLine(o: OutOfRangeReading): string {
  return `${o.label} ${o.valueText} ${o.direction} (aim ${o.range})`;
}

/** The push to owners and admins: "Rebecca Soto: pH 8.2 high (aim 7.4–7.6)". */
export function outOfRangeNotification(
  customer: string,
  found: OutOfRangeReading[],
): NotificationText {
  return {
    title: found.length === 1 ? "Out-of-range reading" : "Out-of-range readings",
    body: `${customer}: ${found.map(outOfRangeLine).join(", ")}`,
  };
}

// ---------------------------------------------------------------------------
// Dose limits
// ---------------------------------------------------------------------------

/**
 * The most of each chemical that is usual in one dose, per 10,000 gallons (starting points
 * from product labels and the calculator's own steps; a warning, never a block). In units the
 * price book's units convert to (gallons and quarts, pounds and ounces); an item sold by the
 * jug or "each" has no limit to compare.
 */
export const DOSE_LIMITS: Record<ChemicalKey, { quantity: number; unit: string }> = {
  liquid_chlorine: { quantity: 1, unit: "gal" },
  muriatic_acid: { quantity: 0.5, unit: "gal" },
  dry_acid: { quantity: 2, unit: "lb" },
  cal_hypo: { quantity: 2, unit: "lb" },
  tabs: { quantity: 3, unit: "tab" },
  baking_soda: { quantity: 3, unit: "lb" },
  soda_ash: { quantity: 1, unit: "lb" },
  calcium_chloride: { quantity: 3, unit: "lb" },
  stabilizer: { quantity: 3, unit: "lb" },
  salt: { quantity: 3, unit: "bag" },
  algaecide: { quantity: 0.25, unit: "gal" },
  clarifier: { quantity: 0.125, unit: "gal" },
  enzyme: { quantity: 0.125, unit: "gal" },
  phosphate_remover: { quantity: 0.25, unit: "gal" },
};

/**
 * "That's more than the usual 1 gal per 10,000 gal at once. Check the amount." when `quantity`
 * of the chemical is above the limit for the pool's gallons; null when it's fine, or when the
 * chemical, its unit or the pool's size doesn't allow a comparison.
 */
export function doseWarning(input: {
  chemical: string | null | undefined;
  unit: string;
  quantity: number;
  gallons: number | null | undefined;
}): string | null {
  const limit = input.chemical ? DOSE_LIMITS[input.chemical as ChemicalKey] : undefined;
  const gallons = input.gallons ?? 0;
  if (!limit || !(gallons > 0) || !(input.quantity > 0)) return null;
  const per10k = convertQuantity(limit.quantity, limit.unit, input.unit);
  if (per10k === null) return null;
  if (input.quantity <= (per10k * gallons) / 10_000 + 1e-9) return null;
  return `That’s more than the usual ${formatQuantity(per10k, input.unit)} per 10,000 gal at once. Check the amount.`;
}
