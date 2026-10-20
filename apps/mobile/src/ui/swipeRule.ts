// The website's rule for a sideways swipe between pages (owner, 2026-10-20: one-handed use,
// item 7), the same on every platform: at least 70 pt sideways, and the sideways distance at
// least 1.8 times the vertical, so a scroll that drifts never changes the page.

/** Points sideways before a swipe counts. */
export const SWIPE_MIN_DISTANCE = 70;
/** How much more sideways than vertical a swipe must be. */
export const SWIPE_RATIO = 1.8;

/** Which way a finished drag pages, or null when it doesn't count. */
export function swipeDirection(dx: number, dy: number): "previous" | "next" | null {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null;
  return dx < 0 ? "next" : "previous";
}
