import Foundation
import SundeckCore

// Day maps and locks on Schedule (owner, 2026-10-20, docs/plans/route-maps.md). Port of
// apps/web/src/lib/day-map.ts: which pins a tech's day shows and the words around the map. The
// website and Android draw the pins on a map image; the iPhone draws them with Apple Maps
// (UI/DayMapViews.swift), from the same rule (core `dayMapPins`).

/// Statuses still to do on the day (a stop is done once its report, quote or invoice is).
private let openStatuses: Set<JobStatus> = [.unscheduled, .scheduled, .inProgress]

/// A pin as Apple Maps draws it: the shop as a house, a stop as its number in a circle.
public struct DayMapAnnotation: Equatable, Sendable, Identifiable {
    /// The stop's job id, or "shop".
    public var id: String
    /// "1", "2", … (the stop's place in the day), "" for the shop.
    public var label: String
    public var at: LatLng
    public var tone: PinTone
    /// VoiceOver: "Stop 2, Grace Holloway", or "The shop".
    public var spoken: String

    public var isShop: Bool { tone == .shop }
}

/// A row of the large map's list: the stop's number, time and customer.
public struct DayMapStop: Equatable, Sendable, Identifiable {
    public var id: String
    public var number: Int
    /// "9:00 AM", or "No time".
    public var time: String
    public var customer: String
    /// Whether it has a pin (a stop without a map location is listed, never guessed).
    public var located: Bool
}

/// The part of the map the camera shows: every pin, with room around them.
public struct MapFit: Equatable, Sendable {
    public var center: LatLng
    public var latDelta: Double
    public var lngDelta: Double
}

/// A tech's day as a map.
public struct DayMapModel: Equatable, Sendable {
    public var annotations: [DayMapAnnotation]
    public var stops: [DayMapStop]
    /// Stops with a pin, and stops without a map location.
    public var located: Int
    public var missing: Int
    /// The thin line in route order: the shop, the stops, back to the shop.
    public var line: [LatLng]
    /// VoiceOver: "Map of Priya Shah’s stops on Monday: 5 stops".
    public var label: String
    /// "Priya Shah · Monday", the large map's title.
    public var title: String
    public var fit: MapFit?

    /// Whether there's a map to draw (at least one stop has a pin).
    public var drawable: Bool { located > 0 }
    /// "2 stops aren’t on the map", or nil.
    public var note: String? { missingNote(missing) }
}

/// The map of a tech's day: the shop, then the stops in route order, numbered by their place in
/// the day (as the list is), toned done, current (the first stop not done, on today), or to do.
/// Nil when the day has no stops.
public func dayMapModel(
    jobs: [ScheduleJob], depot: LatLng?, date: String, today: String, tech: String, timeZone: String
) -> DayMapModel? {
    guard !jobs.isEmpty else { return nil }
    let stops = jobs.map { MapStop(id: $0.id, location: $0.location, done: !openStatuses.contains($0.status)) }
    let currentId = date == today ? stops.first(where: { !$0.done })?.id : nil
    let found = dayMapPins(stops: stops, depot: depot, currentId: currentId)
    let names = Dictionary(jobs.map { ($0.id, $0.customerName) }, uniquingKeysWith: { a, _ in a })
    let annotations = mapAnnotations(found.pins, customers: names)
    let located = annotations.filter { !$0.isShop }.count
    let day = weekdayName(date)
    return DayMapModel(
        annotations: annotations,
        stops: jobs.enumerated().map { i, j in
            DayMapStop(
                id: j.id, number: i + 1,
                time: j.scheduledStart == nil ? "No time" : formatTime(j.scheduledStart, timeZone: timeZone),
                customer: j.customerName, located: j.location != nil)
        },
        located: located, missing: found.missing, line: routeLine(annotations),
        label: mapLabel(tech: tech, day: day, stops: jobs.count), title: "\(tech) · \(day)",
        fit: mapFit(annotations.map(\.at)))
}

/// Pins as annotations, with what VoiceOver says for each.
public func mapAnnotations(_ pins: [MapPin], customers: [String: String]) -> [DayMapAnnotation] {
    pins.map { p in
        let shop = p.tone == .shop
        let name = p.id.flatMap { customers[$0] }
        return DayMapAnnotation(
            id: p.id ?? "shop", label: p.label, at: p.at, tone: p.tone,
            spoken: shop ? "The shop" : ["Stop \(p.label)", name].compactMap { $0 }.joined(separator: ", "))
    }
}

/// The line through the day: from the shop, through each stop in order, and back.
public func routeLine(_ annotations: [DayMapAnnotation]) -> [LatLng] {
    let shop = annotations.first(where: \.isShop)?.at
    let stops = annotations.filter { !$0.isShop }.map(\.at)
    guard !stops.isEmpty else { return [] }
    let line = (shop.map { [$0] } ?? []) + stops + (shop.map { [$0] } ?? [])
    return line.count > 1 ? line : []
}

/// A camera that shows every point with a fifth of the span spare on each side; a single point
/// gets a neighborhood around it.
public func mapFit(_ points: [LatLng]) -> MapFit? {
    guard let first = points.first else { return nil }
    var (minLat, maxLat, minLng, maxLng) = (first.lat, first.lat, first.lng, first.lng)
    for p in points.dropFirst() {
        minLat = min(minLat, p.lat)
        maxLat = max(maxLat, p.lat)
        minLng = min(minLng, p.lng)
        maxLng = max(maxLng, p.lng)
    }
    let minimum = 0.012
    return MapFit(
        center: LatLng(lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2),
        latDelta: max(minimum, (maxLat - minLat) * 1.4), lngDelta: max(minimum, (maxLng - minLng) * 1.4))
}

private func stopsWord(_ n: Int) -> String { "\(n) \(n == 1 ? "stop" : "stops")" }

/// "Map of Priya Shah’s stops on Monday: 5 stops" (`mapAlt`).
public func mapLabel(tech: String, day: String, stops: Int) -> String {
    "Map of \(tech)’s stops on \(day): \(stopsWord(stops))"
}

/// The line under a map when some stops have no map location, else nil (`missingNote`).
public func missingNote(_ missing: Int) -> String? {
    if missing <= 0 { return nil }
    return missing == 1 ? "1 stop isn’t on the map" : "\(missing) stops aren’t on the map"
}

/// The Map row's detail on phones: "Hide" while it's open, else how many stops it shows.
public func mapDisclosureDetail(open: Bool, stops: Int) -> String { open ? "Hide" : stopsWord(stops) }

/// "Monday", from "2026-10-19" (`weekdayName`).
public func weekdayName(_ date: String) -> String {
    let names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return weekday(date).map { names[$0] } ?? date
}

// MARK: - Locks

/// What a card shows about what keeps it in place (`lockTag`, the website's `LockTag`). A lock is
/// an icon only (owner, 2026-10-20: "Do icons"): a calendar with a padlock for a day lock, a clock
/// with a padlock for a time lock, a padlock for both, with `label` ("Day locked", "Time locked",
/// "Locked") read aloud and shown on hover. "Two techs" stays words. A started job says nothing
/// here (its status does).
public struct LockTag: Equatable, Sendable {
    public enum Kind: Equatable, Sendable { case day, time, both, twoTechs }
    public var label: String
    public var kind: Kind
}

public func lockTag<J: PlanJobFields>(_ job: J) -> LockTag? {
    let reason = lockReason(job)
    if reason == .started { return nil }
    let lock = jobLock(job)
    if let tag = lock.tag {
        return LockTag(label: tag, kind: lock == .day ? .day : lock == .time ? .time : .both)
    }
    if reason == .twoTechs { return LockTag(label: LockReason.twoTechs.label, kind: .twoTechs) }
    return nil
}

/// The job's schedule saved with a lock: the move's rows with the lock's columns added to the
/// job's own row (one write), and the move planned as if the lock were already saved, so a time
/// lock keeps its time on the new day.
public func scheduleWithLock(
    _ lock: JobLock, jobId: String, jobs: [ScheduleJob],
    _ move: ([ScheduleJob]) throws -> (updates: [JobUpdate], message: String)
) rethrows -> (updates: [JobUpdate], message: String) {
    let cols = lockColumns(lock)
    let locked = jobs.map { j -> ScheduleJob in
        guard j.id == jobId else { return j }
        var copy = j
        copy.lockDay = cols.lockDay
        copy.lockTime = cols.lockTime
        copy.arrivalFixed = cols.arrivalFixed
        return copy
    }
    var (updates, message) = try move(locked)
    if let i = updates.firstIndex(where: { $0.id == jobId }) {
        updates[i].values.merge(cols.values) { _, new in new }
    } else {
        updates.insert(JobUpdate(id: jobId, values: cols.values), at: 0)
    }
    return (updates, message)
}

/// Only the lock changed: its columns, and no message (owner, 2026-10-20: "Don't do lock
/// messages"; the Schedule group's Lock row and the success haptic say it).
public func lockOnlyChange(_ lock: JobLock, jobId: String) -> (updates: [JobUpdate], message: String) {
    ([JobUpdate(id: jobId, values: lockColumns(lock).values)], "")
}
