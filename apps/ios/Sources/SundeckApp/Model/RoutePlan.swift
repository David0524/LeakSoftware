import Foundation
import SundeckCore

// The app's side of routing and scheduling: the rules themselves (routing.ts, route-plan.ts,
// office.ts, schedule-moves.ts) are in SundeckCore, checked against the TypeScript's fixtures.
// What's here reads the shop's settings for the app, opens maps links as URLs, and formats the
// dates and instants the screens show.

/// How On My Way texts go out: from the company number ("messages", the default) or the tech's phone.
public func onMyWayFromPhone(_ settings: JSONValue?) -> Bool { settings?["on_my_way"]?.string == "phone" }

// MARK: - Maps

extension MapsApp {
    /// More › On This Device › Directions open in (`app_kv`): "auto", "apple" or "google".
    /// Automatic is Apple Maps on an iPhone.
    public static let key = "directions_open_in"

    /// Apple Maps until changed.
    public init(_ kv: KeyValue) { self = kv.get(Self.key).flatMap(MapsApp.init(rawValue:)) ?? .apple }
}

/// Directions to one place.
public func directionsURL(_ p: MapPlace, app: MapsApp) -> URL? {
    let links = mapsLinks(p)
    return URL(string: app == .apple ? links.apple : links.google)
}

/// A whole day in Google Maps: from the shop, through the stops (up to 10), and back.
public func routeLink(origin: MapPlace?, stops: [MapPlace]) -> URL? {
    routeLink(origin, stops).flatMap { URL(string: $0) }
}

/// The day's directions: Google Maps takes the whole route; Apple Maps the next stop not done.
public func dayDirections(app: MapsApp, origin: MapPlace?, stops: [(place: MapPlace, done: Bool)]) -> URL? {
    dayDirections(app, origin, stops).flatMap { URL(string: $0.href) }
}

// MARK: - Days and instants

private let utc = TimeZone(identifier: "UTC")!

private func gregorian(_ zone: TimeZone) -> Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = zone
    return c
}

/// Noon UTC on a "YYYY-MM-DD" day.
func dayInstant(_ date: String) -> Date? {
    let p = date.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return nil }
    return gregorian(utc).date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))
}

/// "Sun, Oct 18" or, long, "Sunday, October 18" (`formatDay`); the text itself when it isn't a day.
public func formatDay(_ date: String, long: Bool = false) -> String {
    (try? formatDay(date, style: long ? .long : .short)) ?? date
}

/// "9:00 AM" in the shop's time zone (`formatTime`); empty without a time.
public func formatTime(_ iso: String?, timeZone: String) -> String {
    guard let iso else { return "" }
    return (try? formatTime(iso, timeZone)) ?? ""
}

private func formatter(_ pattern: String, _ zone: TimeZone) -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = zone
    f.dateFormat = pattern
    return f
}

/// "October 2026"
public func formatMonth(_ date: String) -> String {
    dayInstant(date).map { formatter("MMMM yyyy", utc).string(from: $0) } ?? date
}

/// An instant the rows hold ("2026-10-12T16:00:00.000Z", "…+00:00", "2026-10-12 16:00:00+00").
public func parseInstant(_ text: String?) -> Date? {
    guard var s = text?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
    if s.count > 10, s[s.index(s.startIndex, offsetBy: 10)] == " " {
        s.replaceSubrange(s.index(s.startIndex, offsetBy: 10)...s.index(s.startIndex, offsetBy: 10), with: "T")
    }
    if s.range(of: #"[+-]\d{2}$"#, options: .regularExpression) != nil { s += ":00" }
    return ISOParsers.fractional.date(from: s) ?? ISOParsers.plain.date(from: s)
}

/// Made once: building a formatter costs far more than parsing, and lists parse every row
/// (1,000 jobs took 4 s with a formatter per call). Parsing doesn't change them, so sharing is
/// safe.
enum ISOParsers {
    nonisolated(unsafe) static let plain = ISO8601DateFormatter()
    nonisolated(unsafe) static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

public func isoString(_ date: Date) -> String {
    isoTimestamp(milliseconds: (date.timeIntervalSince1970 * 1000).rounded())
}

/// "Oct 15, 2026" in the shop's time zone.
public func formatShortDate(_ iso: String?, timeZone: String) -> String {
    guard let d = parseInstant(iso) else { return "" }
    return formatter("MMM d, yyyy", TimeZone(identifier: timeZone) ?? utc).string(from: d)
}

/// Minutes after midnight in the zone (`localMinutes`).
public func localMinutes(_ date: Date, timeZone: String) -> Int {
    (try? localMinutes(isoString(date), timeZone)) ?? 0
}

/// "YYYY-MM-DD" of an instant in the zone.
public func localDay(_ date: Date, timeZone: String) -> String {
    let c = gregorian(TimeZone(identifier: timeZone) ?? utc).dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

/// The instant of `min` minutes after midnight on `date` in the zone, capped at 23:59
/// (`zonedMinutesToIso`, so a time the clocks skip lands where the TypeScript puts it).
public func zonedInstant(_ date: String, _ minutes: Int, timeZone: String) -> Date? {
    parseInstant(try? zonedMinutesToIso(date, minutes, timeZone))
}
