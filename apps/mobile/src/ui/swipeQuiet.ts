// A swipe is not a tap (owner, 2026-10-21: "On schedule, do not make the address clickable when
// swiping left/right on a card. Just like you did for the hero tile"). Gesture handler cancels
// the JS responder when a sideways pan activates, so Pressables and Text links under the finger
// normally don't act; this is the guard for the rest: while a row or page is dragged sideways,
// and for a moment after the finger lifts, a link or button on it does nothing. One clock for
// the app, since one finger drags at a time.

/** How long after a swipe ends a tap still counts as its lift. */
export const SWIPE_TAP_QUIET_MS = 350;

let dragging = false;
let endedAt = 0;

/** A row or page started moving sideways. */
export function swipeStarted(): void {
  dragging = true;
}

/** The sideways drag is over (opened, closed, turned or sprung back). */
export function swipeEnded(now = Date.now()): void {
  if (!dragging) return;
  dragging = false;
  endedAt = now;
}

/** True while a sideways drag is on or just ended: a tap now is the swipe's lift. */
export function swipeTapBlocked(now = Date.now()): boolean {
  return dragging || now - endedAt < SWIPE_TAP_QUIET_MS;
}

/** Wraps an onPress so the lift of a swipe doesn't press it. */
export function unlessSwiping<A extends unknown[]>(
  press: (...args: A) => void,
): (...args: A) => void;
export function unlessSwiping<A extends unknown[]>(
  press: ((...args: A) => void) | undefined,
): ((...args: A) => void) | undefined;
export function unlessSwiping<A extends unknown[]>(
  press: ((...args: A) => void) | undefined,
): ((...args: A) => void) | undefined {
  if (!press) return undefined;
  return (...args: A) => {
    if (!swipeTapBlocked()) press(...args);
  };
}
