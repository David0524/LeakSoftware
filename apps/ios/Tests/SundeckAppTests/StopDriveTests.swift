import Foundation
import Testing

@testable import SundeckApp

/// Schedule tiles' drive chips and the block's drive home, and where a tile dragged out of its
/// block lands (docs/design/2026-10-21-schedule-tile.md).
@Suite struct StopDriveTests {
    @Test func eachStopCarriesTheDriveToIt() {
        // The first from the shop, then each from the stop before.
        #expect(
            StopDrive.chips(legs: [23, 14, 9, 31], located: [true, true, true, true], startLocated: true) == [
                23, 14, 9, 31,
            ])
    }

    @Test func noChipWhenAnEndIsOffTheMap() {
        // Stop 2 off the map: no drive to it, nor from it to stop 3.
        #expect(
            StopDrive.chips(legs: [23, 0, 0, 31], located: [true, false, true, true], startLocated: true) == [
                23, nil, nil, 31,
            ])
        // The shop has no map location: the first stop's drive isn't known.
        #expect(StopDrive.chips(legs: [0, 14], located: [true, true], startLocated: false) == [nil, 14])
        // Fewer legs than stops (still working it out).
        #expect(StopDrive.chips(legs: [23], located: [true, true], startLocated: true) == [23, nil])
    }

    @Test func driveHome() {
        #expect(StopDrive.home(backMin: 27, located: [true, true], startLocated: true) == 27)
        #expect(StopDrive.home(backMin: 0, located: [true], startLocated: true) == nil)
        #expect(StopDrive.home(backMin: 27, located: [true, false], startLocated: true) == nil)
        #expect(StopDrive.home(backMin: 27, located: [true], startLocated: false) == nil)
        #expect(StopDrive.home(backMin: 27, located: [], startLocated: true) == nil)
    }

    @Test func spoken() {
        #expect(StopDrive.spoken(23) == "23 minute drive")
    }

    @Test func letGoOnAnotherBlock() {
        let zones: [String: ScheduleReorder.Zone] = [
            "block|a|2026-10-26": .init(
                frame: CGRect(x: 0, y: 100, width: 300, height: 174), mids: [29, 87, 145], owner: "a|2026-10-26"),
            "block|b|2026-10-27": .init(
                frame: CGRect(x: 0, y: 400, width: 300, height: 116), mids: [29, 87], owner: "b|2026-10-27"),
            "head|b|2026-10-27": .init(
                frame: CGRect(x: 0, y: 350, width: 300, height: 44), mids: nil, owner: "b|2026-10-27"),
        ]
        // Never its own block.
        #expect(ScheduleReorder.zone(at: CGPoint(x: 10, y: 150), zones: zones, from: "a|2026-10-26") == nil)
        #expect(
            ScheduleReorder.zone(at: CGPoint(x: 10, y: 150), zones: zones, from: "b|2026-10-27")
                == "block|a|2026-10-26")
        #expect(ScheduleReorder.zone(at: CGPoint(x: 10, y: 600), zones: zones, from: "a|2026-10-26") == nil)
        #expect(ScheduleReorder.zone(at: nil, zones: zones, from: "a|2026-10-26") == nil)
        // Between the other block's first and second tiles: second place.
        let b = zones["block|b|2026-10-27"]!
        #expect(ScheduleReorder.index(in: b, finger: CGPoint(x: 10, y: 450)) == 1)
        #expect(ScheduleReorder.index(in: b, finger: CGPoint(x: 10, y: 405)) == 0)
        #expect(ScheduleReorder.index(in: b, finger: CGPoint(x: 10, y: 510)) == 2)
        // A header: last.
        #expect(ScheduleReorder.index(in: zones["head|b|2026-10-27"]!, finger: CGPoint(x: 10, y: 360)) == nil)
    }

    @Test func kindsOfVisit() {
        #expect(visitKind(.repair) == "Repair")
        #expect(visitKind(.detection) == "Leak detection")
    }
}
