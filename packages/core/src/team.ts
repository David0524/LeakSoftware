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

// ---------------------------------------------------------------------------
// The order of techs on the Schedule (owner, 2026-10-21: "Make a way to reorder techs in the
// schedule"; docs/design/2026-10-21-tech-order.md)
// ---------------------------------------------------------------------------

/** The words of Reorder Techs, the same on every platform. */
export const REORDER_TECHS = {
  action: "Reorder Techs",
  title: "Reorder Techs",
  done: "Done",
  cancel: "Cancel",
  moveUp: "Move Up",
  moveDown: "Move Down",
  saved: "Order saved.",
  help: "Drag techs into the order the Schedule and Today show them.",
} as const;

const placed = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * The order the Schedule lists techs in (Day columns, Week rows, Whose schedule, Everyone) and
 * Today's Whose Day. When an owner or admin has saved an order (any member's `schedule_order`
 * is set), it wins: people with a place first, lowest first, then anyone without one (someone
 * added since) A to Z by name. Without a saved order, the old rule: `me` (the person signed in,
 * when given) first, then A to Z by name. Names ignore case and accents, no name last; ties
 * keep the input order. "Me first" only applies while there's no saved order: the owner set the
 * order on purpose.
 */
export function scheduleOrder<
  T extends { user_id: string; name: string | null; schedule_order?: number | null },
>(members: T[], me?: string | null): T[] {
  const saved = members.some((m) => placed(m.schedule_order));
  return members
    .map((m, n) => ({ m, n }))
    .sort((x, y) => {
      const a = x.m.schedule_order;
      const b = y.m.schedule_order;
      if (placed(a) || placed(b)) {
        if (!placed(a)) return 1;
        if (!placed(b)) return -1;
        if (a !== b) return a - b;
      } else if (me && !saved) {
        const mine = Number(y.m.user_id === me) - Number(x.m.user_id === me);
        if (mine) return mine;
      }
      return byName(x.m.name, y.m.name) || x.n - y.n;
    })
    .map((x) => x.m);
}

/** One `schedule_order` to write (on the membership with this id). */
export interface ScheduleOrderWrite {
  id: string;
  schedule_order: number;
}

/**
 * The writes that save a reordered list: `ordered` holds the ids top to bottom, and each gets
 * its place (1 first). Only rows whose place changed are written; ids not in `members` are
 * skipped. `members` are the rows as saved now.
 */
export function scheduleOrderWrites(
  members: { id: string; schedule_order?: number | null }[],
  ordered: string[],
): ScheduleOrderWrite[] {
  const now = new Map(members.map((m) => [m.id, m.schedule_order ?? null]));
  const writes: ScheduleOrderWrite[] = [];
  ordered.forEach((id, i) => {
    if (!now.has(id)) return;
    if (now.get(id) !== i + 1) writes.push({ id, schedule_order: i + 1 });
  });
  return writes;
}

/**
 * The list with the item at `from` moved to `to` (both clamped to the list). Reorder Techs'
 * drag, Move Up (`to = from - 1`) and Move Down (`to = from + 1`).
 */
export function moveInList<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}
