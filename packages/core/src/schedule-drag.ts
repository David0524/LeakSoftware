// How a finger picks up a job on the schedule (owner, 2026-10-22: "It's slightly too easy to
// slide jobs around in the schedule when flicking to scroll. I like the hamburger drag but make
// it slightly less sensitive … it just needs to avoid flicks and anything else unintentional";
// docs/design/2026-10-22-schedule-hold-drag.md). The same numbers on the website, the iPhone app
// and the Android app. Touch only: a mouse or trackpad on a computer is unchanged.

export const SCHEDULE_DRAG = {
  /**
   * The grip (≡): the finger rests on it this long, moving less than `slopPt`, before the job
   * lifts. Short enough not to feel like a hold; a flick that starts on the grip is gone before
   * it ends, so the page scrolls instead.
   */
  gripDwellMs: 130,
  /** Anywhere else on a stop's tile: touch and hold this long, moving less than `slopPt`. */
  holdMs: 400,
  /**
   * How far (points; CSS pixels; dp) a finger may drift during the rest or the hold. Further,
   * and the touch is a scroll: the page has it and the job stays put.
   */
  slopPt: 8,
  /**
   * The page scrolled this recently when the finger came down (still gliding, or just stopped
   * by that touch): the touch only stops the scroll, never lifts a job.
   */
  scrollSettleMs: 100,
} as const;
