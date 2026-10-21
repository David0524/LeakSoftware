// A page that follows the finger (owner, 2026-10-21: "Should be able to drag it as fast or slow
// as you want, hold halfway, etc. All the stuff we built earlier for web app."): Schedule's week
// strip and its days, weeks and months. The website's rule (apps/web use-swipe.ts) and the
// iPhone app's (PagerRule): the page moves 1:1 with the finger, gives like a rubber band where
// there's no page that way, and a release turns the page past a third of the width or on a
// flick the same way; otherwise it springs back. Worklets, so they run with the finger.

import { rubberBand } from "./heroBrowse";

export { rubberBand };

/** How far a finger moves before the drag is sideways (ours) or up-and-down (the scroll). */
export const PAGER_LOCK = 10;

/**
 * A pager that shares its page with cards (Schedule): it gives up once a drag moves this far up
 * or down, so only a clearly sideways drag (about 1.5 times as far across as up or down) turns
 * the page; anything else scrolls (owner, 2026-10-21: "I can't scroll on a Scheduling tile").
 */
export const PAGER_FAIL_Y = PAGER_LOCK / 1.5;
/** The share of the width a slow drag must pass to turn the page. */
export const PAGER_SHARE = 1 / 3;
/** A flick: at least this fast (pt/s) and this far (pt), the same way as the drag. */
export const PAGER_FLICK_SPEED = 500;
export const PAGER_FLICK_DISTANCE = 24;
/** The settle: a spring of 0.35 s with no bounce, as on the iPhone and the website. */
export const PAGER_SETTLE = { duration: 350, dampingRatio: 1 } as const;

/** Where the page is drawn under a finger `dx` from where it started. */
export function pagerFollow(
  dx: number,
  width: number,
  canPrevious: boolean,
  canNext: boolean,
): number {
  "worklet";
  const open = dx < 0 ? canNext : canPrevious;
  return open ? dx : rubberBand(dx, width);
}

/**
 * Where a released drag goes: 1 (the next page, a drag to the left), -1 (the previous one) or 0
 * (back where it was). `vx` is in pt/s, negative to the left.
 */
export function pagerStep(
  dx: number,
  vx: number,
  width: number,
  canPrevious: boolean,
  canNext: boolean,
): -1 | 0 | 1 {
  "worklet";
  const far = width > 0 && Math.abs(dx) > width * PAGER_SHARE;
  const flick =
    Math.abs(vx) >= PAGER_FLICK_SPEED && Math.abs(dx) >= PAGER_FLICK_DISTANCE && vx < 0 === dx < 0;
  if ((!far && !flick) || dx === 0) return 0;
  if (dx < 0) return canNext ? 1 : 0;
  return canPrevious ? -1 : 0;
}
