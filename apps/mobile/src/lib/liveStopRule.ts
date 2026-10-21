import type { HeroMoment, LiveStopPhase } from "@leakbook/core";

// When the current stop's ongoing notification shows (features/today/LiveStop.tsx), without
// the notification API, so it can be tested. Owner, 2026-10-20: "It should run anytime you
// have the app open during the work day", not only when the app happens to be open at the day's
// start. A swipe-away holds only while the app stays in the background: opening the app, or
// bringing it to the front, brings it back.

/** What the notification's dismissal does next: the day it was swiped away, or none. */
export type LiveStopEvent =
  | { kind: "swiped"; day: string }
  /** The app was opened or came to the front (AppState "active"). */
  | { kind: "foreground" }
  /** On My Way was sent: a request to see the stop. */
  | { kind: "on_my_way" };

export function dismissalAfter(_was: string | null, event: LiveStopEvent): string | null {
  return event.kind === "swiped" ? event.day : null;
}

/**
 * Which phase the notification shows, or null. While the working day runs (core liveStopRuns),
 * the card's stop shows unless it was swiped away today while the app stayed in the
 * background; a stop on the way shows before the day starts too, and a done stop its minute.
 */
export function liveStopPhase(input: {
  moment: HeroMoment | null;
  runs: boolean;
  dismissedOn: string | null;
  today: string;
}): LiveStopPhase | null {
  const { moment } = input;
  if (!moment || moment === "day_done") return null;
  if (input.dismissedOn === input.today) return null;
  const phase = moment as LiveStopPhase;
  return phase === "done" || input.runs || phase === "driving" ? phase : null;
}
