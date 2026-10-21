import Foundation

/// What counts as a page swipe (the job page's sections, Schedule's days): the website's rule
/// (owner, 2026-10-20): at least 70 points sideways, the sideways distance at least 1.8 times
/// the vertical, and not from the left edge, where the system's swipe back begins.
public enum PageSwipeRule {
    public static let edge: CGFloat = 28
    public static let distance: CGFloat = 70
    /// Sideways must be at least this many times the vertical.
    public static let ratio: CGFloat = 1.8

    /// -1 for the previous page (a swipe right), 1 for the next (a swipe left), else 0.
    public static func direction(start: CGPoint, translation: CGSize) -> Int {
        let dx = translation.width
        let dy = translation.height
        // A drag without real numbers (NaN, infinity) never pages.
        guard dx.isFinite, dy.isFinite, start.x > edge, abs(dx) >= distance, abs(dx) >= ratio * abs(dy) else {
            return 0
        }
        return dx < 0 ? 1 : -1
    }

    /// The page `direction` lands on among `pages`, or nil at either end.
    public static func page<T: Equatable>(_ pages: [T], from current: T, direction: Int) -> T? {
        guard direction != 0, let index = pages.firstIndex(of: current) else { return nil }
        let next = index + direction
        return pages.indices.contains(next) ? pages[next] : nil
    }
}

/// A page that follows the finger (owner, 2026-10-21: "Should be able to drag it as fast or slow
/// as you want, hold halfway, etc. All the stuff we built earlier for web app."): Schedule's week
/// strip and its days, weeks and months. The website's rule (apps/web use-swipe.ts) and the
/// Android app's (apps/mobile lib/pager.ts): a drag decides its direction after 10 points (up or
/// down is the page's scrolling), the page moves 1:1 with the finger and gives like a rubber band
/// where there's no page that way, and a release turns the page past a third of the width or on
/// a flick the same way; otherwise it springs back.
public enum PagerRule {
    /// How far a finger moves before the drag is sideways or up-and-down.
    public static let lockDistance: CGFloat = 10
    /// The share of the width a slow drag must pass to turn the page.
    public static let share: CGFloat = 1.0 / 3.0
    /// A flick: at least this fast (points a second) and this far, the same way as the drag.
    public static let flickSpeed: CGFloat = 500
    public static let flickDistance: CGFloat = 24
    /// The settle: a spring of 0.35 s, no bounce (motion.md: quick, and interruptible).
    public static let settle: TimeInterval = 0.35

    public enum Axis: Equatable, Sendable { case horizontal, vertical }

    /// Which way a drag goes once it has moved far enough to tell; nil until then.
    public static func lock(_ translation: CGSize, at distance: CGFloat = lockDistance) -> Axis? {
        let dx = abs(translation.width)
        let dy = abs(translation.height)
        guard max(dx, dy) >= distance else { return nil }
        return dx > dy ? .horizontal : .vertical
    }

    /// Past the first or last page the content gives less and less, as iOS's rubber band does.
    public static func rubberBand(_ dx: CGFloat, width: CGFloat, coefficient: CGFloat = 0.55) -> CGFloat {
        guard width > 0 else { return 0 }
        let d = abs(dx)
        let given = (1 - 1 / ((d * coefficient) / width + 1)) * width
        return dx < 0 ? -given : given
    }

    /// Where the page is drawn under a finger `dx` from where it started.
    public static func follow(_ dx: CGFloat, width: CGFloat, canPrevious: Bool, canNext: Bool) -> CGFloat {
        let open = dx < 0 ? canNext : canPrevious
        return open ? dx : rubberBand(dx, width: width)
    }

    /// Where a released drag goes: 1 (the next page, a drag to the left), -1 (the previous one)
    /// or 0 (back where it was). `velocity` is in points a second, negative to the left.
    public static func outcome(
        _ dx: CGFloat, velocity: CGFloat, width: CGFloat, canPrevious: Bool, canNext: Bool
    ) -> Int {
        let far = width > 0 && abs(dx) > width * share
        let flick = abs(velocity) >= flickSpeed && abs(dx) >= flickDistance && (velocity < 0) == (dx < 0)
        guard far || flick, dx != 0 else { return 0 }
        if dx < 0 { return canNext ? 1 : 0 }
        return canPrevious ? -1 : 0
    }

    /// The spring's starting speed for a release at `velocity` (points a second) from `from` to
    /// `to`, as SwiftUI's springs take it: a share of the distance left, a second; never
    /// backwards, so a page never jumps the wrong way.
    public static func springVelocity(_ velocity: CGFloat, from: CGFloat, to: CGFloat) -> Double {
        let left = to - from
        guard abs(left) > 1 else { return 0 }
        return Double(min(max(velocity / left, 0), 40))
    }
}
