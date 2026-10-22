import Testing

@testable import SundeckApp

/// Schedule › Day's drag within a day: where the card lands, how the others make room, and where
/// it settles (owner, 2026-10-21).
@Suite struct ScheduleReorderTests {
    // Four stops: 64, 80 (larger text), 64, 64 tall, 4 apart. Middles at 32, 108, 184, 252.
    let heights: [Double] = [64, 80, 64, 64]
    let spacing = 4.0

    /// Touch and hold lifts a stop's tile after 0.4 s on every platform (owner, 2026-10-22).
    @Test func aHoldLiftsAfterFourTenthsOfASecond() {
        #expect(ScheduleReorder.holdSeconds == 0.4)
    }

    @Test func staysPutUntilItPassesAMiddle() {
        #expect(ScheduleReorder.target(from: 0, translation: 0, heights: heights, spacing: spacing) == 0)
        // Its middle at 32 + 75 = 107: not yet past the next middle (108).
        #expect(ScheduleReorder.target(from: 0, translation: 75, heights: heights, spacing: spacing) == 0)
        #expect(ScheduleReorder.target(from: 0, translation: 77, heights: heights, spacing: spacing) == 1)
    }

    @Test func dragsDownAndUp() {
        #expect(ScheduleReorder.target(from: 0, translation: 400, heights: heights, spacing: spacing) == 3)
        #expect(ScheduleReorder.target(from: 3, translation: -400, heights: heights, spacing: spacing) == 0)
        // Stop 4 (middle 252) up past stop 3’s middle (184) only.
        #expect(ScheduleReorder.target(from: 3, translation: -70, heights: heights, spacing: spacing) == 2)
        #expect(ScheduleReorder.target(from: 3, translation: -150, heights: heights, spacing: spacing) == 1)
    }

    @Test func othersMakeRoomByTheDraggedHeight() {
        // Stop 1 (64 + 4) over to place 2: stops 2 and 3 slide up.
        #expect(ScheduleReorder.offsets(from: 0, to: 2, heights: heights, spacing: spacing) == [0, -68, -68, 0])
        // Stop 2 (80 + 4) up to the top: stop 1 slides down.
        #expect(ScheduleReorder.offsets(from: 1, to: 0, heights: heights, spacing: spacing) == [84, 0, 0, 0])
        #expect(ScheduleReorder.offsets(from: 2, to: 2, heights: heights, spacing: spacing) == [0, 0, 0, 0])
    }

    @Test func settlesInTheGap() {
        // Down past stops 2 and 3: 84 + 68.
        #expect(ScheduleReorder.settle(from: 0, to: 2, heights: heights, spacing: spacing) == 152)
        // Up past stops 2 and 3 from the bottom: -(84 + 68).
        #expect(ScheduleReorder.settle(from: 3, to: 1, heights: heights, spacing: spacing) == -152)
        #expect(ScheduleReorder.settle(from: 1, to: 1, heights: heights, spacing: spacing) == 0)
    }

    @Test func gapAndSettleAgree() {
        // Where the dragged row settles is exactly where the others left room for it.
        for from in heights.indices {
            for to in heights.indices {
                let offsets = ScheduleReorder.offsets(from: from, to: to, heights: heights, spacing: spacing)
                let order = ScheduleReorder.order(Array(heights.indices), from: from, to: to)
                var y = 0.0
                for j in order {
                    if j == from {
                        let original = heights[..<from].reduce(0) { $0 + $1 + spacing }
                        #expect(
                            original + ScheduleReorder.settle(from: from, to: to, heights: heights, spacing: spacing)
                                == y)
                    } else {
                        let original = heights[..<j].reduce(0) { $0 + $1 + spacing }
                        #expect(original + offsets[j] == y)
                    }
                    y += heights[j] + spacing
                }
            }
        }
    }

    @Test func orderAndInsertion() {
        #expect(ScheduleReorder.order(["a", "b", "c"], from: 0, to: 2) == ["b", "c", "a"])
        #expect(ScheduleReorder.order(["a", "b", "c"], from: 2, to: 0) == ["c", "a", "b"])
        #expect(ScheduleReorder.insertion(y: 10, mids: [32, 116, 192]) == 0)
        #expect(ScheduleReorder.insertion(y: 150, mids: [32, 116, 192]) == 2)
        #expect(ScheduleReorder.insertion(y: 500, mids: [32, 116, 192]) == 3)
    }
}
