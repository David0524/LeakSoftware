import Foundation
import SundeckCore
import Testing

/// day-map.ts (a day's map on Schedule and Today).
@Suite struct DayMapTests {
    let module = "day-map"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "MAP_PIN_LIMIT", "ROUTE_STYLE", "routeColor", "dayMapPins", "encodePins", "decodePins",
            ])
    }

    struct Input: Decodable {
        let stops: [MapStop]
        let depot: LatLng?
        let currentId: String?
    }

    @Test func pins() {
        checkRule(module, "MAP_PIN_LIMIT") { _ in mapPinLimit }
        checkRule(module, "ROUTE_STYLE") { _ in routeStyle }
        checkRule(module, "routeColor") { c in routeColor(try c.arg(0, as: String?.self)) }
        checkRule(module, "dayMapPins") { c in
            let input = try c.arg(0, as: Input.self)
            return dayMapPins(stops: input.stops, depot: input.depot, currentId: input.currentId)
        }
        checkRule(module, "encodePins") { c in encodePins(try c.arg(0)) }
        checkRule(module, "decodePins") { c in decodePins(try c.arg(0)) }
    }

    @Test func pinsRoundTrip() throws {
        let pins = dayMapPins(
            stops: [
                MapStop(id: "a", location: LatLng(lat: 33.5, lng: -112.1), done: true),
                MapStop(id: "b", location: LatLng(lat: 33.6, lng: -112.2), done: false),
            ], depot: LatLng(lat: 33.45, lng: -112.07), currentId: "b"
        ).pins
        let back = try #require(decodePins(encodePins(pins)))
        #expect(back.map(\.label) == ["", "1", "2"])
        #expect(back.map(\.tone) == [.shop, .done, .current])
    }
}
