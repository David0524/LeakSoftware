// Team colors, the Team list's order, and moving a plan visit (owner, 2026-10-20,
// docs/design/2026-10-20-team-week.md sections 2, 3 and 5). Pure; the same rules on the
// website, the iPhone app (SundeckCore) and Android.

/** Every tech color, in palette order (brand/tokens.json › color.tech). */
export const TECH_COLORS = [
  { key: "blue", label: "Blue" },
  { key: "green", label: "Green" },
  { key: "orange", label: "Orange" },
  { key: "purple", label: "Purple" },
  { key: "pink", label: "Pink" },
  { key: "teal", label: "Teal" },
  { key: "red", label: "Red" },
  { key: "olive", label: "Olive" },
  { key: "brown", label: "Brown" },
  { key: "slate", label: "Slate" },
] as const satisfies readonly { key: string; label: string }[];

export type TechColor = (typeof TECH_COLORS)[number]["key"];

const KEYS: readonly string[] = TECH_COLORS.map((c) => c.key);

/** A stored color as a palette key; anything else (missing, old, mistyped) is Slate. */
export function techColor(key: unknown): TechColor {
  return typeof key === "string" && KEYS.includes(key) ? (key as TechColor) : "slate";
}

/**
 * The color for a new member, given the colors the shop's active members use: the first
 * palette color nobody uses; when all ten are used, the least-used one, earliest in the
 * palette. Values that aren't palette keys are ignored. The migration
 * 20261012007900_team_colors.sql does the same in SQL (app.next_tech_color).
 */
export function nextTechColor(used: (string | null | undefined)[]): TechColor {
  const counts = new Map<string, number>(KEYS.map((k) => [k, 0]));
  for (const u of used) if (u != null && counts.has(u)) counts.set(u, counts.get(u)! + 1);
  let best = KEYS[0]!;
  for (const k of KEYS) if (counts.get(k)! < counts.get(best)!) best = k;
  return best as TechColor;
}

const byName = (a: string | null, b: string | null) =>
  (a?.trim() || "￿").localeCompare(b?.trim() || "￿", "en", { sensitivity: "base" });

/**
 * Settings › Team's one list: active members A to Z by name (ignoring case and accents, like
 * sortJobs' Customer; no name last), then those turned off, the most recently turned off
 * first (no `disabled_at` last), then by name. Ties keep the input order.
 */
export function teamOrder<
  T extends { name: string | null; status: string; disabled_at?: string | null },
>(members: T[]): { active: T[]; off: T[] } {
  const indexed = members.map((m, n) => ({ m, n }));
  const time = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);
  const active = indexed
    .filter((x) => x.m.status === "active")
    .sort((x, y) => byName(x.m.name, y.m.name) || x.n - y.n)
    .map((x) => x.m);
  const off = indexed
    .filter((x) => x.m.status !== "active")
    .sort((x, y) => {
      const a = time(x.m.disabled_at);
      const b = time(y.m.disabled_at);
      const when = Number.isNaN(a) ? (Number.isNaN(b) ? 0 : 1) : Number.isNaN(b) ? -1 : b - a;
      return when || byName(x.m.name, y.m.name) || x.n - y.n;
    })
    .map((x) => x.m);
  return { active, off };
}

/** Where a visit is: its shop-local date ("2026-10-21") and its tech. */
export interface VisitSlot {
  date: string;
  techId: string | null;
}

/**
 * Whether moving this job asks "Move <Customer>'s visits?" (Change Schedule / Just This
 * Visit / Cancel): it's a maintenance plan's visit (`service_plan_id`) that is still
 * Scheduled, so not started, finished, canceled or sent back to Needs a Time. With `move`,
 * only a move to another day or another tech asks; a new place in the same tech's same day
 * (reordering, Optimize) doesn't. A visit already moved once (`plan_moved`) still asks.
 */
export function asksPlanMove(
  job: { service_plan_id?: string | null; status: string },
  move?: { from: VisitSlot; to: VisitSlot },
): boolean {
  if (!job.service_plan_id || job.status !== "scheduled") return false;
  if (!move) return true;
  return move.from.date !== move.to.date || (move.from.techId ?? null) !== (move.to.techId ?? null);
}

/** The spec's name for the same rule (section 5, "Data"). */
export const planVisitMoveChoices = asksPlanMove;

/** The action sheet for moving a plan visit; buttons in this order. */
export const PLAN_MOVE_CHOICES = {
  title: (customer: string) => `Move ${customer}’s visits?`,
  changeSchedule: "Change Schedule",
  justThisVisit: "Just This Visit",
  cancel: "Cancel",
} as const;

/**
 * After Change Schedule: "Rivera is now on Tuesdays with Luis". `weekdayName` is the day's
 * name ("Tuesday"); with no tech (an unassigned plan) the "with" part is left off.
 */
export function planMovedBanner(customer: string, weekdayName: string, techName: string): string {
  const tech = techName.trim();
  return `${customer} is now on ${weekdayName}s${tech ? ` with ${tech}` : ""}`;
}

/** After Just This Visit. */
export const visitMovedBanner = "Moved this visit only";
