import { canMoveJob, canUnschedule } from "@leakbook/core";

// Schedule drag and drop (owner, 2026-10-20: "bring back drag/drop on mobile"), as the
// website's route board: hold a stop to pick it up, drop it at a place in a tech's day, on a
// day in the week strip, or in Needs a Time. These are the rules with no I/O; the screen hands
// the result to the same move the Move sheet uses (core moveJobChange, through the sync layer).

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a stop can be dropped. Rects are in window points. */
export type DropZone =
  | { kind: "route"; id: string; tech: string; date: string; open: boolean; rect: Rect }
  | { kind: "day"; id: string; date: string; rect: Rect }
  | { kind: "tray"; id: string; rect: Rect };

/** A stop already on a route, for working out the place a drop lands at. */
export interface Slot {
  id: string;
  /** The route it's on (DropZone id). */
  route: string;
  rect: Rect;
}

/**
 * Where the picked-up stop came from. `plan`: a maintenance plan from Customers to Add (its id
 * is the plan's), which a drop onto a tech's day puts on that weekday with that tech (team and
 * week spec sections 6 and 8).
 */
export type DragFrom =
  | { kind: "route"; route: string; tech: string; date: string; index: number }
  | { kind: "tray" }
  | { kind: "plan" };

export interface DragItem {
  id: string;
  status: string;
  from: DragFrom;
}

export type DropPlan =
  /** tech null: nobody yet (waits in Needs a Time, still booked that day). */
  | { kind: "move"; tech: string | null; date: string; index: number }
  /** Take it off the schedule (back to Needs a Time). */
  | { kind: "tray" }
  /** A plan from Customers to Add: serviced on this date's weekday, by this tech. */
  | { kind: "plan"; tech: string; date: string }
  | { kind: "refuse"; error: string }
  /** Dropped where it already is, or nowhere. */
  | { kind: "none" };

export const PAST_DAY = "Pick today or a later day.";
export const STARTED =
  "This job has started, so it stays on the schedule. Move it to another day instead.";
export const CANCELED = "This job was canceled, so it stays off the schedule.";

/** Past the end of a day: the move puts it last. */
export const LAST = 9_999;

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/** The rect after the page scrolled `dy` points down since it was measured. */
export function scrolled(r: Rect, dy: number): Rect {
  return dy ? { ...r, y: r.y - dy } : r;
}

/**
 * The zone under the finger. A day in the strip or Needs a Time wins over a route around it,
 * and of overlapping zones the smallest wins.
 */
export function zoneAt(zones: DropZone[], x: number, y: number): DropZone | null {
  let best: DropZone | null = null;
  for (const z of zones) {
    if (!contains(z.rect, x, y)) continue;
    if (!best || z.rect.width * z.rect.height < best.rect.width * best.rect.height) best = z;
  }
  return best;
}

/**
 * The place in a route a drop at `y` lands at (0 = first), counted among the route's other
 * stops: the stops whose middle is above the finger come before it.
 */
export function insertIndex(slots: Slot[], route: string, dragged: string, y: number): number {
  return slots
    .filter((s) => s.route === route && s.id !== dragged)
    .sort((a, b) => a.rect.y - b.rect.y)
    .filter((s) => s.rect.y + s.rect.height / 2 < y).length;
}

/**
 * What dropping `item` on `zone` does, with the same rules as Move…: any job but a canceled
 * one moves; only one that hasn't started goes back to Needs a Time; past days refuse.
 * `fallbackTech` is whose day a job from Needs a Time joins when it's dropped on a day in the
 * week strip (the tech in view, or nobody).
 */
export function planDrop(input: {
  item: DragItem;
  zone: DropZone | null;
  /** For a route: the place from insertIndex. */
  index: number;
  today: string;
  fallbackTech: string | null;
}): DropPlan {
  const { item, zone, index, today } = input;
  if (!zone) return { kind: "none" };
  // A plan's day is a weekday, so any tech's day takes it, past ones too; nothing else does.
  if (item.from.kind === "plan")
    return zone.kind === "route"
      ? { kind: "plan", tech: zone.tech, date: zone.date }
      : { kind: "none" };
  if (!canMoveJob(item.status)) return { kind: "refuse", error: CANCELED };
  const from = item.from;
  if (zone.kind === "tray") {
    if (from.kind === "tray") return { kind: "none" };
    if (!canUnschedule(item.status)) return { kind: "refuse", error: STARTED };
    return { kind: "tray" };
  }
  if (zone.kind === "route") {
    if (!zone.open || zone.date < today) return { kind: "refuse", error: PAST_DAY };
    if (from.kind === "route" && from.route === zone.id && from.index === index)
      return { kind: "none" };
    return { kind: "move", tech: zone.tech, date: zone.date, index };
  }
  // A day in the week strip: last on that day, for the same tech.
  if (zone.date < today) return { kind: "refuse", error: PAST_DAY };
  if (from.kind === "route") {
    if (from.date === zone.date) return { kind: "none" };
    return { kind: "move", tech: from.tech, date: zone.date, index: LAST };
  }
  return { kind: "move", tech: input.fallbackTech, date: zone.date, index: LAST };
}

/**
 * Auto-scroll while a stop is held near the top or bottom of the page: points to scroll this
 * frame (negative: up), faster the closer the finger is to the edge.
 */
export function autoScrollStep(
  y: number,
  top: number,
  bottom: number,
  edge = 72,
  max = 14,
): number {
  if (bottom - top < edge * 2) return 0;
  if (y < top + edge) return -Math.ceil(max * Math.min(1, (top + edge - y) / edge));
  if (y > bottom - edge) return Math.ceil(max * Math.min(1, (y - (bottom - edge)) / edge));
  return 0;
}

/** The scroll offset after a step, kept inside the page. */
export function clampScroll(y: number, contentHeight: number, viewHeight: number): number {
  return Math.max(0, Math.min(y, Math.max(0, contentHeight - viewHeight)));
}

/** What a carried stop's slide needs to know (the Schedule's DragHover). */
export interface SlideState {
  /** The stop being carried. */
  id: string | null;
  /** Where it was picked up from, when that's a route: its place there. */
  from: { route: string; index: number } | null;
  /** Where it would land in a route: its place among the others there. */
  target: { route: string; index: number } | null;
  /** How far the stops after its old place move up to close it. */
  closeGap: number;
  /** How far the stops after its new place move down to open it. */
  openGap: number;
}

/**
 * How far the stop `id` at `position` on `route` moves while another is carried
 * (docs/design/2026-10-21-schedule-card.md): the stops after the carried one's old place move
 * up to close it, and the stops from its new place on move down to open the gap where it will
 * land. Over nothing (or Needs a Time), nothing moves.
 */
export function slideFor(
  state: SlideState,
  id: string,
  route: string | null,
  position: number,
): number {
  if (state.id == null || state.id === id || !route || !state.target) return 0;
  let shift = 0;
  let others = position;
  if (state.from?.route === route && position > state.from.index) {
    shift -= state.closeGap;
    others -= 1;
  }
  if (state.target.route === route && others >= state.target.index) shift += state.openGap;
  return shift;
}
