import Foundation
import Testing

@testable import SundeckApp

/// Letting go of a lifted Day stop: over Needs a Time it comes off its day; anywhere else it goes
/// to its new place or stays (owner, 2026-10-21: "I can't drag jobs back into the 'Needs a Time'
/// box").
@Suite struct ScheduleReleaseTests {
    let heights: [Double] = [64, 80, 64, 64]
    let spacing = 4.0
    let tray = CGRect(x: 16, y: 200, width: 360, height: 120)

    @Test func overNeedsATimeTakesItOff() {
        let release = ScheduleReorder.release(
            from: 2, translation: -300, heights: heights, spacing: spacing, finger: CGPoint(x: 100, y: 250),
            tray: tray, canTakeOff: true)
        #expect(release == .takeOff)
    }

    @Test func overNeedsATimeButStartedStaysInItsDay() {
        // A stop that can't come off the schedule (started) reorders as usual.
        let release = ScheduleReorder.release(
            from: 2, translation: -300, heights: heights, spacing: spacing, finger: CGPoint(x: 100, y: 250),
            tray: tray, canTakeOff: false)
        #expect(release == .reorder(0))
    }

    @Test func elsewhereReordersOrStays() {
        let below = CGPoint(x: 100, y: 600)
        #expect(
            ScheduleReorder.release(
                from: 0, translation: 77, heights: heights, spacing: spacing, finger: below, tray: tray,
                canTakeOff: true) == .reorder(1))
        #expect(
            ScheduleReorder.release(
                from: 0, translation: 10, heights: heights, spacing: spacing, finger: below, tray: tray,
                canTakeOff: true) == .stay)
        // Needs a Time off screen (no frame): never taken off.
        #expect(
            ScheduleReorder.release(
                from: 1, translation: 0, heights: heights, spacing: spacing, finger: CGPoint(x: 100, y: 250),
                tray: nil, canTakeOff: true) == .stay)
    }

    @Test func overIsInsideTheFrameOnly() {
        #expect(ScheduleReorder.isOver(tray: tray, finger: CGPoint(x: 16, y: 200)))
        #expect(!ScheduleReorder.isOver(tray: tray, finger: CGPoint(x: 15, y: 250)))
        #expect(!ScheduleReorder.isOver(tray: tray, finger: CGPoint(x: 100, y: 321)))
        #expect(!ScheduleReorder.isOver(tray: .zero, finger: .zero))
        #expect(!ScheduleReorder.isOver(tray: tray, finger: nil))
    }
}
