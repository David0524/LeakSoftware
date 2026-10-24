import Foundation
import SundeckCore
import Testing

/// route-path.ts (routes that follow the roads, owner 2026-10-23).
@Suite struct RoutePathTests {
    let module = "route-path"

    @Test func everyRuleIsChecked() {
        #expect(
            Fixtures.rules(module) == [
                "LEG_POLYLINE_MAX", "LEG_TOLERANCE_M", "legKey", "routeLegs", "encodePolyline", "decodePolyline",
                "simplifyPath", "legPolyline", "routeLegPaths", "joinLegs",
            ])
    }

    @Test func legsAndPaths() {
        checkRule(module, "LEG_POLYLINE_MAX") { _ in legPolylineMax }
        checkRule(module, "LEG_TOLERANCE_M") { _ in legToleranceMeters }
        checkRule(module, "legKey") { c in legKey(try c.arg(0), try c.arg(1)) }
        checkRule(module, "routeLegs") { c in routeLegs(try c.arg(0)) }
        checkRule(module, "encodePolyline") { c in
            encodePolyline(try c.arg(0), precision: try c.arg(1, as: Int?.self) ?? 5)
        }
        checkRule(module, "decodePolyline") { c in
            decodePolyline(try c.arg(0), precision: try c.arg(1, as: Int?.self) ?? 5)
        }
        checkRule(module, "simplifyPath") { c in simplifyPath(try c.arg(0), try c.arg(1)) }
        checkRule(module, "legPolyline") { c in legPolyline(try c.arg(0)) }
        checkRule(module, "routeLegPaths") { c in
            let found = try c.arg(1, as: [String: [LatLng]?].self)
            return routeLegPaths(try c.arg(0)) { found[$0] ?? nil }
        }
        checkRule(module, "joinLegs") { c in joinLegs(try c.arg(0)) }
    }

    @Test func roundTrip() throws {
        let points = [LatLng(lat: 33.4152, lng: -111.8315), LatLng(lat: 33.41, lng: -111.903)]
        #expect(try #require(decodePolyline(encodePolyline(points))) == points)
    }
}
