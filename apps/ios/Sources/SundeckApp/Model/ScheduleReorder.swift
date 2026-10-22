import Foundation

// Schedule › Day: dragging a stop within its day (owner, 2026-10-21, after a TestFlight recording:
// "That's not good"; docs/design/2026-10-21-schedule-card.md). The real card lifts and follows
// the finger; the others slide up or down by its height so the gap is always where it will land.
// This is the math, with no views: where the card lands, how far each other row slides, and where
// the lifted card settles. Rows are measured top to bottom (`heights`), `spacing` apart.

public enum ScheduleReorder {
    /// How long a finger rests on a stop's tile before it lifts to drag (owner, 2026-10-22:
    /// "Press-and-hold-then-drag on any tile, keeping the grip as a backup"): 0.4 s on every
    /// platform (website `HOLD_MS`, Android `STOP_HOLD_MS`).
    public static let holdSeconds: Double = 0.4

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

// Letting go of a lifted Day stop (owner, 2026-10-21: "I can't drag jobs back into the 'Needs a
// Time' box"): over Needs a Time it comes off its day, the same as Take Off Schedule; anywhere
// else it goes to the place `target` gives.
extension ScheduleReorder {
    /// What letting go does.
    public enum Release: Equatable, Sendable {
        /// Back to its own place.
        case stay
        /// To this place in its day (its index in the new order).
        case reorder(Int)
        /// Off its day, to Needs a Time.
        case takeOff
    }

    /// The finger (`finger`, global) is over Needs a Time (`tray`, its global frame; nil when it
    /// isn't on screen).
    public static func isOver(tray: CGRect?, finger: CGPoint?) -> Bool {
        guard let tray, let finger, !tray.isEmpty else { return false }
        return tray.contains(finger)
    }

    /// Let go `translation` points from its place with the finger at `finger`: over Needs a Time
    /// (and it can come off the schedule) it comes off; else to its new place, or it stays.
    public static func release(
        from: Int, translation: Double, heights: [Double], spacing: Double, finger: CGPoint?, tray: CGRect?,
        canTakeOff: Bool
    ) -> Release {
        if canTakeOff && isOver(tray: tray, finger: finger) { return .takeOff }
        guard heights.indices.contains(from) else { return .stay }
        let to = target(from: from, translation: translation, heights: heights, spacing: spacing)
        return to == from ? .stay : .reorder(to)
    }
}

// Schedule tiles' drive (owner, 2026-10-21: "can we remove the little '5 min drive' tags between
// each job"; docs/design/2026-10-21-schedule-tile.md): each stop's tile carries the drive to it as
// a chip, the first one's from the shop (or home), and the drive home is the block's last line.
// The minutes are the day's saved legs (`DaySummary.legs`, the numbers the drive lines between
// stops used to show); a leg with an end off the map isn't known, so it has no chip.
public enum StopDrive {
    /// The chip's minutes on each stop, nil where the drive isn't known: the stop or the place
    /// before it (the stop before, or the start for the first) has no map location, or there's
    /// no leg for it.
    public static func chips(legs: [Int], located: [Bool], startLocated: Bool) -> [Int?] {
        located.indices.map { i in
            guard located[i], i == 0 ? startLocated : located[i - 1], legs.indices.contains(i) else { return nil }
            return legs[i]
        }
    }

    /// The drive home's minutes for the block's last line, nil when there's none to show: no
    /// stops, the last stop or the start off the map, or no driving.
    public static func home(backMin: Int, located: [Bool], startLocated: Bool) -> Int? {
        guard let last = located.last, last, startLocated, backMin > 0 else { return nil }
        return backMin
    }

    /// What VoiceOver reads for the chip: "23 minute drive".
    public static func spoken(_ minutes: Int) -> String { "\(minutes) minute drive" }
}

// Dragging a tile out of its block (owner, 2026-10-21: "The drag/drop on the week schedule page
// should be similar to the daily one"): let go over another tech's or day's block, it moves
// there, where it's let go in that block's order; over a day's or a tech's header, it goes last.
extension ScheduleReorder {
    /// A place a lifted tile can be let go (global frame). `mids` are the middles of the block's
    /// tiles from its top, nil for a header (it goes last).
    public struct Zone: Equatable, Sendable {
        public var frame: CGRect
        public var mids: [Double]?
        /// The block or header's day (`routeKey`): a tile is never dropped on its own.
        public var owner: String

        public init(frame: CGRect, mids: [Double]?, owner: String) {
            self.frame = frame
            self.mids = mids
            self.owner = owner
        }
    }

    /// The zone under the finger (global) for a tile from the day `from`, if any: never the tile's
    /// own block or header.
    public static func zone(at finger: CGPoint?, zones: [String: Zone], from: String) -> String? {
        guard let finger else { return nil }
        return zones.filter { $0.value.owner != from && !$0.value.frame.isEmpty && $0.value.frame.contains(finger) }
            .keys.sorted().first
    }

    /// Where a tile let go at `finger` goes in `zone`: its place among the block's tiles, or nil
    /// (last) on a header.
    public static func index(in zone: Zone, finger: CGPoint) -> Int? {
        zone.mids.map { insertion(y: Double(finger.y - zone.frame.minY), mids: $0) }
    }
}
