import Foundation

/// How a finger picks up a job on the schedule (owner, 2026-10-22: "It's slightly too easy to
/// slide jobs around in the schedule when flicking to scroll … it just needs to avoid flicks and
/// anything else unintentional"): core `SCHEDULE_DRAG`, the same numbers on the website and the
/// Android app (docs/design/2026-10-22-schedule-hold-drag.md).
public enum ScheduleDrag {
    /// The grip (≡): the finger rests on it this long, moving less than `slopPt`, before the job
    /// lifts. A flick that starts on the grip is gone sooner, so the page scrolls instead.
    public static let gripDwellMs = 130
    /// Anywhere else on a stop's tile: touch and hold this long, moving less than `slopPt`.
    public static let holdMs = 400
    /// How far (points) a finger may drift during the rest or the hold; further, it's a scroll.
    public static let slopPt = 8
    /// The page scrolled this recently when the finger came down (still gliding): the touch only
    /// stops the scroll, never lifts a job.
    public static let scrollSettleMs = 100

    public static var gripDwellSeconds: Double { Double(gripDwellMs) / 1000 }
    public static var holdSeconds: Double { Double(holdMs) / 1000 }
}
