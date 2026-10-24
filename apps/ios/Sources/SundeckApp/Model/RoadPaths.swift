#if os(iOS)
    import Foundation
    import MapKit
    import SundeckCore

    // Routes that follow the roads on the iPhone (owner, 2026-10-23: "The route between stops is
    // always a straight line and doesn't take roads"). The website and Android draw the server's
    // saved paths (public.route_leg, from Apple's Maps Server API); the iPhone asks MapKit on the
    // phone instead (MKDirections: free, and it needs no server), once per leg (core `legKey`), and
    // keeps each path in its Caches folder, so a map shown again asks nothing. A stop whose
    // coordinates change gives its legs new keys, and only those are asked. Not synced: it's a
    // cache of what MapKit says, never the shop's data, and the system may clear it. A leg with no
    // path yet (offline, an error, MapKit's limit) is drawn straight, so the map never breaks; a
    // leg MapKit has no road route for is drawn straight and asked again after a week.

    @MainActor
    final class RoadPaths {
        static let shared = RoadPaths()

        private struct Leg: Codable {
            /// The simplified path as an encoded polyline (core `legPolyline`), or nil: no road route.
            var polyline: String?
            var fetchedAt: Date
        }

        /// Paths kept on the phone, at most this many (the oldest go first).
        private let limit = 2000
        /// How long "no road route" stands before the leg is asked again.
        private let retryNoRoute: TimeInterval = 7 * 24 * 3600
        private var legs: [String: Leg] = [:]
        private var paths: [String: [LatLng]] = [:]
        private var loaded = false
        private var asking: Set<String> = []

        private var file: URL? {
            FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
                .appendingPathComponent("road-paths.json")
        }

        /// The route through `line` (route order) with the road paths kept so far; nothing asked.
        func kept(_ line: [LatLng]) -> [LatLng] {
            load()
            return joinLegs(routeLegPaths(line) { self.path($0) }.legs)
        }

        /// The route through `line` with each leg's road path, asking MapKit for the legs it
        /// doesn't have (one at a time: MapKit limits how many a phone may ask at once).
        func route(_ line: [LatLng]) async -> [LatLng] {
            load()
            var changed = false
            for leg in routeLegs(line) where needs(leg.key) && !asking.contains(leg.key) {
                asking.insert(leg.key)
                let answer = await ask(leg)
                asking.remove(leg.key)
                switch answer {
                case .path(let points):
                    legs[leg.key] = Leg(polyline: legPolyline(points), fetchedAt: Date())
                    paths[leg.key] = nil
                    changed = true
                case .noRoute:
                    legs[leg.key] = Leg(polyline: nil, fetchedAt: Date())
                    changed = true
                case .tryLater:
                    break
                case .stop:
                    // MapKit's limit: the rest stay straight until the map is shown again.
                    if changed { save() }
                    return kept(line)
                }
            }
            if changed { save() }
            return kept(line)
        }

        private func needs(_ key: String) -> Bool {
            guard let leg = legs[key] else { return true }
            return leg.polyline == nil && Date().timeIntervalSince(leg.fetchedAt) > retryNoRoute
        }

        private func path(_ key: String) -> [LatLng]? {
            if let p = paths[key] { return p }
            guard let polyline = legs[key]?.polyline, let p = decodePolyline(polyline) else { return nil }
            paths[key] = p
            return p
        }

        private enum Answer: Sendable {
            case path([LatLng])
            case noRoute
            case tryLater
            case stop
        }

        /// MapKit's driving route between the leg's two stored coordinates (never an address).
        private func ask(_ leg: RouteLeg) async -> Answer {
            let request = MKDirections.Request()
            request.source = MKMapItem(placemark: MKPlacemark(coordinate: leg.from.coordinate))
            request.destination = MKMapItem(placemark: MKPlacemark(coordinate: leg.to.coordinate))
            request.transportType = .automobile
            request.requestsAlternateRoutes = false
            let directions = MKDirections(request: request)
            // The answer is read where MapKit gives it, so only plain coordinates cross over.
            return await withCheckedContinuation { (done: CheckedContinuation<Answer, Never>) in
                directions.calculate { response, error in
                    done.resume(returning: Self.answer(response, error))
                }
            }
        }

        private nonisolated static func answer(_ response: MKDirections.Response?, _ error: (any Error)?) -> Answer {
            if let error = error as? MKError {
                switch error.code {
                case .directionsNotFound: return .noRoute
                case .loadingThrottled: return .stop
                default: return .tryLater
                }
            }
            // Offline, or cancelled as the map went away.
            if error != nil { return .stop }
            guard let polyline = response?.routes.first?.polyline, polyline.pointCount > 1 else { return .noRoute }
            var coords = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: polyline.pointCount)
            polyline.getCoordinates(&coords, range: NSRange(location: 0, length: polyline.pointCount))
            return .path(coords.map { LatLng(lat: $0.latitude, lng: $0.longitude) })
        }

        private func load() {
            guard !loaded else { return }
            loaded = true
            guard let file, let data = try? Data(contentsOf: file),
                let kept = try? JSONDecoder().decode([String: Leg].self, from: data)
            else { return }
            legs = kept
        }

        private func save() {
            if legs.count > limit {
                let oldest = legs.sorted { $0.value.fetchedAt < $1.value.fetchedAt }.prefix(legs.count - limit)
                for (key, _) in oldest {
                    legs[key] = nil
                    paths[key] = nil
                }
            }
            guard let file, let data = try? JSONEncoder().encode(legs) else { return }
            try? data.write(to: file, options: .atomic)
        }
    }
#endif
