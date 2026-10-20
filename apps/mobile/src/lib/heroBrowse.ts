import { stopDone, type TodayHero } from "@leakbook/core";

// Browsing Today's card (owner, 2026-10-20: "Needs to be a better way to move the hero tile on
// Today back to a previous job"; docs/design/2026-10-20-gestures.md section 1): swipe the card,
// tap a progress segment, or adjust it with TalkBack. The parts with no React, so they're tested
// without a phone. Core todayHero({ viewing }) decides what the card says.

/** A stop as browsing reads it: its id, and what moves the day on (start, complete). */
export interface BrowseStop {
  id: string;
  status: string;
  stop_done_on?: string | null;
}

/**
 * The stop the card moves to: the one after (`1`) or before (`-1`) the stop it shows, in route
 * order. Null at either end, where the card resists and springs back.
 */
export function stepStop(
  ids: readonly string[],
  shownId: string | null,
  dir: 1 | -1,
): string | null {
  if (!ids.length) return null;
  // The day done: the card stands after the last stop, so going back shows the last one.
  const at = shownId ? ids.indexOf(shownId) : ids.length;
  if (at < 0) return null;
  return ids[at + dir] ?? null;
}

/**
 * The `viewing` value for a stop the tech picked: none when it's the stop the day is on, so the
 * card is back to following the day (no Back to Now for the stop you're already on).
 */
export function viewingFor(picked: string | null, currentId: string | null): string | null {
  return picked && picked !== currentId ? picked : null;
}

/**
 * What TalkBack and VoiceOver read as the card's value while it's adjusted: "Stop 2 of 3, Derek
 * Jeter". The day done reads its own words.
 */
export function heroAdjustValue(
  hero: Pick<TodayHero, "moment" | "stop" | "stops" | "content">,
  name: string | null | undefined,
): string {
  if (hero.moment === "day_done") return hero.content.headline;
  return `Stop ${hero.stop} of ${hero.stops}${name ? `, ${name}` : ""}`;
}

/**
 * Past the first or last stop the card resists: the farther the finger goes, the less it
 * follows (the iOS rubber band, 0.55), never more than `limit`.
 */
export function rubberBand(offset: number, limit: number, coefficient = 0.55): number {
  "worklet";
  if (limit <= 0) return 0;
  const sign = offset < 0 ? -1 : 1;
  const x = Math.abs(offset);
  return sign * (1 - 1 / ((x * coefficient) / limit + 1)) * limit;
}

/** How far (a share of the card's width) or how fast (pt/s) a release moves to the next stop. */
export const HERO_SWIPE_SHARE = 0.25;
export const HERO_SWIPE_VELOCITY = 500;

/**
 * Where a released drag goes: the next stop (`1`, a drag to the left), the one before (`-1`),
 * or back (`0`). A quick flick counts even when short.
 */
export function heroSwipeStep(dx: number, vx: number, width: number): -1 | 0 | 1 {
  "worklet";
  const far = Math.abs(dx) >= width * HERO_SWIPE_SHARE;
  const fast = Math.abs(vx) >= HERO_SWIPE_VELOCITY && Math.sign(vx) === Math.sign(dx);
  if (!far && !fast) return 0;
  if (dx === 0) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * What sends the card back to the stop the day is on by itself (besides the app opening again):
 * the day changing, the tech whose day it is, and any stop starting or completing. A sync that
 * changes anything else (notes, a phone number) leaves the tech where they browsed.
 */
export function viewingResetKey(stops: readonly BrowseStop[], today: string, tech: string): string {
  return [
    today,
    tech,
    ...stops.map((s) => `${s.id}:${s.status}:${stopDone(s, today) ? 1 : 0}`),
  ].join("|");
}

/**
 * The stops completed since `before` (the ids done then; null on the first look, which reports
 * none), for Today's "Derek Jeter done" banner with Undo (gestures spec section 9). Stops that
 * were done and still are, or that left the day, are not reported.
 */
export function newlyDone(
  before: ReadonlySet<string> | null,
  stops: readonly BrowseStop[],
  today: string,
): string[] {
  if (!before) return [];
  return stops.filter((s) => stopDone(s, today) && !before.has(s.id)).map((s) => s.id);
}

/** The ids of the stops done today, for newlyDone's next look. */
export function doneIds(stops: readonly BrowseStop[], today: string): Set<string> {
  return new Set(stops.filter((s) => stopDone(s, today)).map((s) => s.id));
}
