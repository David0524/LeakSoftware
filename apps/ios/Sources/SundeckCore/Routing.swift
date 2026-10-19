/// A point on the map. Port of routing.ts and route-plan.ts.
public struct LatLng: Codable, Equatable, Sendable {
    public var lat: Double
    public var lng: Double

    public init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }
}

/// A place to give directions to: its address, and its point when known.
public struct MapPlace: Codable, Equatable, Sendable {
    public var address: String
    public var location: LatLng?

    public init(address: String, location: LatLng? = nil) {
        self.address = address
        self.location = location
    }
}

/// A property's point, when it has both coordinates.
public func propertyLocation(_ p: Property?) -> LatLng? {
    guard let lat = p?.latitude, let lng = p?.longitude else { return nil }
    return LatLng(lat: lat, lng: lng)
}

private func point(_ l: LatLng) -> String { "\(ECMA.numberString(l.lat)),\(ECMA.numberString(l.lng))" }

/// Directions to one place in Apple Maps and Google Maps (each opens the app on a phone).
private func mapsLinks(_ p: MapPlace) -> (apple: String, google: String) {
    let destination = ECMA.encodeURIComponent(p.location.map(point) ?? p.address)
    let q = ECMA.encodeURIComponent(p.address)
    return (
        apple: "https://maps.apple.com/?daddr=\(destination)&q=\(q)&dirflg=d",
        google: "https://www.google.com/maps/dir/?api=1&destination=\(destination)&travelmode=driving"
    )
}

/// Directions from the phone app: Apple Maps on iPhone; on Android a geo: link, which opens
/// the phone's own maps app (Google Maps, Waze, …) at the pool.
public func nativeMapsUrl(_ p: MapPlace, _ os: String) -> String {
    if os == "ios" { return mapsLinks(p).apple }
    if os == "android" {
        let q = p.location.map { "\(point($0))(\(p.address))" } ?? p.address
        return "geo:0,0?q=\(ECMA.encodeURIComponent(q))"
    }
    return mapsLinks(p).google
}
