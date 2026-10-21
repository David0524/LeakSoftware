import Foundation

// Schedule › Day: dragging a stop within its day (owner, 2026-10-21, after a TestFlight recording:
// "That's not good"; docs/design/2026-10-21-schedule-card.md). The real card lifts and follows
// the finger; the others slide up or down by its height so the gap is always where it will land.
// This is the math, with no views: where the card lands, how far each other row slides, and where
// the lifted card settles. Rows are measured top to bottom (`heights`), `spacing` apart.

public enum ScheduleReorder {
    /// Where the row at `from` lands (its index in the new order, 0 first) when it's been dragged
    /// `translation` points (down is positive): among the other rows, the ones whose middle is
    /// above the dragged row's middle come before it.
    public static func target(from: Int, translation: Double, heights: [Double], spacing: Double) -> Int {
        guard heights.indices.contains(from) else { return max(0, min(from, heights.count - 1)) }
        let tops = tops(heights, spacing: spacing)
        let center = tops[from] + heights[from] / 2 + translation
        var index = 0
        for j in heights.indices where j != from && tops[j] + heights[j] / 2 < center {
            index += 1
        }
        return index
    }

    /// How far each row slides while the row at `from` would land at `to`: the rows it passed
    /// move by its height (and the spacing) to make room, the rest stay. The dragged row's own
    /// entry is 0 (it follows the finger instead).
    public static func offsets(from: Int, to: Int, heights: [Double], spacing: Double) -> [Double] {
        guard heights.indices.contains(from) else { return heights.map { _ in 0 } }
        let pitch = heights[from] + spacing
        return heights.indices.map { j in
            if j == from { return 0 }
            if to > from, j > from, j <= to { return -pitch }
            if to < from, j >= to, j < from { return pitch }
            return 0
        }
    }

    /// Where the gap is, from the dragged row's own place: the distance it settles to when it's
    /// let go at `to`.
    public static func settle(from: Int, to: Int, heights: [Double], spacing: Double) -> Double {
        guard heights.indices.contains(from), heights.indices.contains(to), to != from else { return 0 }
        if to > from {
            return heights[(from + 1)...to].reduce(0) { $0 + $1 + spacing }
        }
        return -heights[to..<from].reduce(0) { $0 + $1 + spacing }
    }

    /// The order shown while the row at `from` would land at `to` (ids moved, nothing else).
    public static func order<T>(_ ids: [T], from: Int, to: Int) -> [T] {
        guard ids.indices.contains(from) else { return ids }
        var next = ids
        let item = next.remove(at: from)
        next.insert(item, at: max(0, min(to, next.count)))
        return next
    }

    /// Where something dropped at `y` goes among rows whose middles are `mids` (a stop from Needs
    /// a Time dropped on a day's stops): after every row whose middle is above it.
    public static func insertion(y: Double, mids: [Double]) -> Int {
        mids.filter { $0 < y }.count
    }

    /// Each row's top, from the first row's top.
    private static func tops(_ heights: [Double], spacing: Double) -> [Double] {
        var result: [Double] = []
        var y = 0.0
        for h in heights {
            result.append(y)
            y += h + spacing
        }
        return result
    }
}
