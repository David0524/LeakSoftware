import Foundation

/// An empty Today shows the next day with stops (owner, 2026-10-29: "An empty Today shows what's
/// next"): its day, how many stops and when the first starts, and who's on it. Port of core's
/// next-day.ts.
public struct UpcomingStop: Codable, Equatable, Sendable {
    /// The shop's local date, YYYY-MM-DD.
    public var date: String
    /// When it starts (ISO), if it has a time.
    public var start: String?
    /// The customer's name.
    public var name: String

    public init(date: String, start: String?, name: String) {
        self.date = date
        self.start = start
        self.name = name
    }
}

/// How far ahead an empty Today looks.
public let nextDayLookahead = 14

public struct NextDayCard: Codable, Equatable, Sendable {
    public var date: String
    /// "Tomorrow", or "Mon, Nov 3".
    public var heading: String
    /// "See Tomorrow", or "See Monday".
    public var button: String
    /// "4 stops · first at 8:00 AM".
    public var line: String
    /// "Grace Holloway, Riley Rivera, and 2 more".
    public var names: String
}

/// The first day after today, up to two weeks out, with stops (given in route order), or nil.
public func nextDayCard(_ stops: [UpcomingStop], today: String, timeZone: String) throws -> NextDayCard? {
    let last = try addDays(today, nextDayLookahead)
    guard let date = stops.map(\.date).filter({ $0 > today && $0 <= last }).sorted().first else { return nil }
    let on = stops.filter { $0.date == date }
    let tomorrow = date == (try addDays(today, 1))
    let first = on.compactMap(\.start).filter { !$0.isEmpty }.sorted().first
    let count = "\(on.count) \(on.count == 1 ? "stop" : "stops")"
    var names: [String] = []
    for stop in on where !names.contains(stop.name) { names.append(stop.name) }
    let named: String
    switch names.count {
    case 0...2: named = names.joined(separator: " and ")
    case 3: named = "\(names[0]), \(names[1]), and \(names[2])"
    default: named = "\(names[0]), \(names[1]), and \(names.count - 2)\u{00A0}more"
    }
    let weekday = try formatDay(date, style: .long).split(separator: ",").first.map(String.init) ?? ""
    return NextDayCard(
        date: date,
        heading: tomorrow ? "Tomorrow" : try formatDay(date, style: .short),
        button: tomorrow ? "See Tomorrow" : "See \(weekday)",
        line: try first.map { "\(count) · first at \(minutesLabel(try localMinutes($0, timeZone)))" } ?? count,
        names: named)
}
