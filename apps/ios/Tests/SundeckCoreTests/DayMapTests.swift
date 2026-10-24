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
                "ROUTE_STYLE_SMALL", "ROUTE_ZOOM", "routeStyleAt", "routeTierStyle", "pinSizeAt", "imageTier",
                "projectPoint", "zoomForSpan", "fitZoom", "metersPerPoint",
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

    struct TierStyle: Encodable {
        let zoom: Double
        let style: RouteSizes

        func encode(to encoder: Encoder) throws {
            try style.encode(to: encoder)
            var c = encoder.container(keyedBy: Key.self)
            try c.encode(zoom, forKey: .zoom)
        }

        enum Key: String, CodingKey { case zoom }
    }

    struct Size: Decodable {
        let w: Double
        let h: Double
    }

    /// Smaller zoomed out (owner, 2026-10-23: "thinner lines and smaller dots when zoomed out").
    @Test func sizesByZoom() {
        checkRule(module, "ROUTE_STYLE_SMALL") { _ in routeStyleSmall }
        checkRule(module, "ROUTE_ZOOM") { _ in routeZoom }
        checkRule(module, "routeStyleAt") { c in routeStyleAt(try c.arg(0)) }
        checkRule(module, "routeTierStyle") { c in
            let tier = try c.arg(0, as: RouteTier.self)
            return TierStyle(zoom: tier.zoom, style: tier.style)
        }
        checkRule(module, "pinSizeAt") { c in pinSizeAt(try c.arg(0), routeStyleAt(try c.arg(1))) }
        checkRule(module, "imageTier") { c in imageTier(try c.arg(0), try c.arg(1)) }
        checkRule(module, "projectPoint") { c in projectPoint(try c.arg(0), try c.arg(1)) }
        checkRule(module, "zoomForSpan") { c in zoomForSpan(try c.arg(0), try c.arg(1)) }
        checkRule(module, "fitZoom") { c in
            let size = try c.arg(1, as: Size.self)
            let maxZoom = try c.arg(3, as: Double?.self) ?? 16
            return fitZoom(try c.arg(0), w: size.w, h: size.h, padding: try c.arg(2), maxZoom: maxZoom)
        }
        checkRule(module, "metersPerPoint") { c in metersPerPoint(try c.arg(0), try c.arg(1)) }
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
