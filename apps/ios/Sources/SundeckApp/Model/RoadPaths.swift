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
            /// "No road route" answers in a row. MapKit says so for a leg it was too busy to route
            /// (the last legs of a day, asked last), so one answer stands only an hour; two in a
            /// row stand a week.
            var misses: Int?
        }

        /// Paths kept on the phone, at most this many (the oldest go first).
        private let limit = 2000
        /// How long "no road route" stands before the leg is asked again: an hour after the first
        /// such answer, a week after two in a row.
        private let retryNoRouteOnce: TimeInterval = 3600
        private let retryNoRoute: TimeInterval = 7 * 24 * 3600
        /// How long to wait after MapKit's limit before asking for the rest (it allows about 50
        /// requests a minute).
        static let throttleWait: Duration = .seconds(61)
        /// How long a road path is used before it's asked for again (owner, 2026-10-24): Apple's
        /// terms let us keep its map data only temporarily. The old path is drawn until then.
        private let keepPath: TimeInterval = 30 * 24 * 3600
        private var legs: [String: Leg] = [:]
        private var paths: [String: [LatLng]] = [:]
        private var loaded = false
        /// Legs being asked now, so two maps of the same day (the still map and Enlarge, the
        /// week row and a column) wait for one answer instead of one of them drawing it straight.
        private var asking: [String: Task<Answer, Never>] = [:]

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
        /// doesn't have (one at a time: MapKit limits how many a phone may ask at once). `done` is
        /// false when MapKit's limit (or being offline) stopped it before every leg was asked:
        /// ask again after `throttleWait`, so the last legs (the drive home) get their roads too.
        func route(_ line: [LatLng]) async -> (line: [LatLng], done: Bool) {
            load()
            var changed = false
            var done = true
            for leg in routeLegs(line) where needs(leg.key) {
                let task: Task<Answer, Never>
                if let running = asking[leg.key] {
                    task = running
                } else {
                    task = Task { await self.ask(leg) }
                    asking[leg.key] = task
                }
                let answer = await task.value
                asking[leg.key] = nil
                switch answer {
                case .path(let points):
                    legs[leg.key] = Leg(polyline: legPolyline(points), fetchedAt: Date())
                    paths[leg.key] = nil
                    changed = true
                case .noRoute:
                    // A path we had stays drawn after one such answer; two in a row and it's straight.
                    let before = legs[leg.key]
                    let misses = (before?.misses ?? 0) + 1
                    legs[leg.key] = Leg(
                        polyline: misses >= 2 ? nil : before?.polyline, fetchedAt: Date(), misses: misses)
                    changed = true
                case .tryLater:
                    done = false
                case .stop:
                    // MapKit's limit: the rest stay straight for now, and are asked after a wait.
                    if changed { save() }
                    return (kept(line), false)
                }
            }
            if changed { save() }
            return (kept(line), done)
        }

        private func needs(_ key: String) -> Bool {
            guard let leg = legs[key] else { return true }
            let age = Date().timeIntervalSince(leg.fetchedAt)
            if leg.polyline != nil { return age > keepPath || ((leg.misses ?? 0) > 0 && age > retryNoRouteOnce) }
            // Kept from before misses were counted: asked again within the hour, so a drive home
            // MapKit was too busy to route isn't left straight for a week.
            return age > ((leg.misses ?? 1) >= 2 ? retryNoRoute : retryNoRouteOnce)
        }

        private func path(_ key: String) -> [LatLng]? {
            if let p = paths[key] { return p }
            guard let polyline = legs[key]?.polyline, let p = decodePolyline(polyline) else { return nil }
            paths[key] = p
            return p
        }

        enum Answer: Sendable {
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
