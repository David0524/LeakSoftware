import Foundation

/// What counts as a page swipe (the job page's sections, Schedule's days): a mostly sideways
/// drag of at least 70 points that doesn't start at the left edge, where the system's swipe back
/// begins.
public enum PageSwipeRule {
    public static let edge: CGFloat = 28
    public static let distance: CGFloat = 70

    /// -1 for the previous page (a swipe right), 1 for the next (a swipe left), else 0.
    public static func direction(start: CGPoint, translation: CGSize) -> Int {
        let dx = translation.width
        let dy = translation.height
        guard start.x > edge, abs(dx) >= distance, abs(dx) > 2 * abs(dy) else { return 0 }
        return dx < 0 ? 1 : -1
    }

    /// The page `direction` lands on among `pages`, or nil at either end.
    public static func page<T: Equatable>(_ pages: [T], from current: T, direction: Int) -> T? {
        guard direction != 0, let index = pages.firstIndex(of: current) else { return nil }
        let next = index + direction
        return pages.indices.contains(next) ? pages[next] : nil
    }
}
