import Foundation

// Activity: what happened in the shop, newest first (owner, 2026-10-20; docs/plans/
// search-and-activity.md, section 2). Port of packages/core/src/activity.ts: the database
// records the events and hands them out through activity_feed(); the words are made here so
// the website and both apps say the same thing.

public enum ActivityKind: String, Codable, CaseIterable, Sendable {
    case quoteAccepted = "quote_accepted"
    case paymentReceived = "payment_received"
    case reportSigned = "report_signed"
    case reportSent = "report_sent"
    case jobCompleted = "job_completed"
    case jobAssigned = "job_assigned"
    case jobMoved = "job_moved"
    case textReceived = "text_received"

    var symbol: ActivitySymbol {
        switch self {
        case .quoteAccepted: .quote
        case .paymentReceived: .payment
        case .reportSigned: .signature
        case .reportSent: .report
        case .jobCompleted: .done
        case .jobAssigned: .person
        case .jobMoved: .calendar
        case .textReceived: .text
        }
    }
}

/// One event as activity_feed() returns it.
public struct ActivityEvent: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    /// An `ActivityKind`, or one this version doesn't know yet.
    public var kind: String
    public var createdAt: String
    public var jobId: String?
    public var conversationId: String?
    public var customerName: String?
    public var jobNumber: Int?
    public var amountCents: Cents?
    public var scheduledAt: String?
    public var preview: String?
    public var actorName: String?
    public var assigneeName: String?

    enum CodingKeys: String, CodingKey {
        case id, kind, preview
        case createdAt = "created_at"
        case jobId = "job_id"
        case conversationId = "conversation_id"
        case customerName = "customer_name"
        case jobNumber = "job_number"
        case amountCents = "amount_cents"
        case scheduledAt = "scheduled_at"
        case actorName = "actor_name"
        case assigneeName = "assignee_name"
    }

    public init(
        id: String, kind: String, createdAt: String, jobId: String? = nil, conversationId: String? = nil,
        customerName: String? = nil, jobNumber: Int? = nil, amountCents: Cents? = nil, scheduledAt: String? = nil,
        preview: String? = nil, actorName: String? = nil, assigneeName: String? = nil
    ) {
        self.id = id
        self.kind = kind
        self.createdAt = createdAt
        self.jobId = jobId
        self.conversationId = conversationId
        self.customerName = customerName
        self.jobNumber = jobNumber
        self.amountCents = amountCents
        self.scheduledAt = scheduledAt
        self.preview = preview
        self.actorName = actorName
        self.assigneeName = assigneeName
    }
}

/// The round symbol for each kind; each platform draws its own (SF Symbols here).
public enum ActivitySymbol: String, Codable, Sendable {
    case quote, payment, signature, report, done, person, calendar, text
}

/// What tapping a row opens.
public struct ActivityOpen: Codable, Equatable, Hashable, Sendable {
    public enum Screen: String, Codable, Sendable { case job, conversation }
    public var screen: Screen
    public var id: String
}

public struct ActivityRow: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var symbol: ActivitySymbol
    public var title: String
    public var detail: String?
    /// "9:42 AM" today, "Yesterday", "Oct 14".
    public var time: String
    public var open: ActivityOpen?

    enum CodingKeys: String, CodingKey { case id, symbol, title, detail, time, open }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(symbol, forKey: .symbol)
        try c.encode(title, forKey: .title)
        try c.encode(detail, forKey: .detail)
        try c.encode(time, forKey: .time)
        try c.encode(open, forKey: .open)
    }
}

public enum ActivityText {
    public static let title = "Activity"
    /// Events per page; more load on scroll.
    public static let pageSize = 50
    /// The latest events on the owner's Dashboard, then See All.
    public static let dashboardCount = 3
    public static let offline = "Activity shows when you’re online."
    public static let empty =
        "Nothing yet. Accepted quotes, payments, reports, finished jobs, and customer texts show here."
    /// What VoiceOver says for the blue dot: there are events since Activity was opened.
    public static let newActivity = "New activity"

    /// The Dashboard's Activity button, for VoiceOver: "Activity, new activity" with the dot.
    public static func buttonLabel(unread: Bool) -> String {
        unread ? "\(title), \(newActivity.lowercased())" : title
    }
    /// Under More, beside the Activity row.
    public static let detail = "Quotes, payments, reports, jobs, and texts"
}

/// "Tony Reyes" -> "Tony".
public func firstName(_ name: String?) -> String? {
    let trimmed = ECMA.trim(name ?? "")
    guard let first = trimmed.unicodeScalars.split(whereSeparator: ECMA.isWhitespace).first else { return nil }
    let word = String(String.UnicodeScalarView(first))
    return word.isEmpty ? nil : word
}

private let weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
private let monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/// A local date as days since 1970, for comparing days.
private func dayNumber(_ w: ECMA.WallClock) -> Int { ECMA.daysFromCivil(w.year, w.month, w.day) }

private func clockTime(_ w: ECMA.WallClock) -> String {
    // Node writes a plain space before AM and PM (V8 swaps out ICU's U+202F).
    "\((w.hour + 11) % 12 + 1):\(ECMA.pad(String(w.minute), 2)) \(w.hour < 12 ? "AM" : "PM")"
}

private func readings(_ iso: String, _ now: Date, _ timeZone: String) throws -> (ECMA.WallClock, ECMA.WallClock) {
    let zone = try ECMA.zone(timeZone)
    guard let ms = ECMA.parseDate(iso) else { throw DateRuleError.invalidTimeValue }
    return (ECMA.wallClock(ms, zone), ECMA.wallClock(ECMA.milliseconds(now), zone))
}

/// "9:42 AM" today, "Yesterday", "Oct 14" (or "Oct 14, 2025" in another year).
public func activityTime(_ iso: String, now: Date, timeZone: String) throws -> String {
    let (d, today) = try readings(iso, now, timeZone)
    if dayNumber(d) == dayNumber(today) { return clockTime(d) }
    if dayNumber(d) == dayNumber(today) - 1 { return "Yesterday" }
    let day = "\(monthShort[d.month - 1]) \(d.day)"
    return d.year == today.year ? day : "\(day), \(d.year)"
}

/// The day header: "Today", "Yesterday", then "Tue, Oct 14" (with the year when it differs).
public func activityDay(_ iso: String, now: Date, timeZone: String) throws -> String {
    let (d, today) = try readings(iso, now, timeZone)
    if dayNumber(d) == dayNumber(today) { return "Today" }
    if dayNumber(d) == dayNumber(today) - 1 { return "Yesterday" }
    let day = "\(weekdayShort[d.weekday]), \(monthShort[d.month - 1]) \(d.day)"
    return d.year == today.year ? day : "\(day), \(d.year)"
}

/// Where a job moved: "Tue 9:30 AM" in the coming week (today included), else "Oct 28, 9:30 AM".
public func movedTo(_ iso: String, now: Date, timeZone: String) throws -> String {
    let (d, today) = try readings(iso, now, timeZone)
    let ahead = dayNumber(d) - dayNumber(today)
    if ahead >= 0 && ahead < 7 { return "\(weekdayShort[d.weekday]) \(clockTime(d))" }
    let day = "\(monthShort[d.month - 1]) \(d.day)"
    return "\(d.year == today.year ? day : "\(day), \(d.year)"), \(clockTime(d))"
}

private func jobLabel(_ n: Int?) -> String { n.map { "Job #\($0)" } ?? "Job" }

/// One event as a row: its symbol, title, detail, time, and what it opens.
public func activityRow(_ e: ActivityEvent, now: Date, timeZone: String) throws -> ActivityRow {
    let trimmedCustomer = ECMA.trim(e.customerName ?? "")
    let customer = trimmedCustomer.isEmpty ? "A customer" : trimmedCustomer
    let money = e.amountCents.map { ", \(formatCents($0))" } ?? ""
    let kind = ActivityKind(rawValue: e.kind)
    var title: String
    var detail: String? = customer
    switch kind {
    case .quoteAccepted:
        title = "Quote accepted"
        detail = "\(customer)\(money)"
    case .paymentReceived:
        title = "Payment received"
        detail = "\(customer)\(money)"
    case .reportSigned:
        title = "Report signed"
    case .reportSent:
        title = "Report sent"
    case .jobCompleted:
        title = "Job completed"
        if let by = firstName(e.actorName) { detail = "\(customer), by \(by)" }
    case .jobAssigned:
        let to = firstName(e.assigneeName)
        title = to.map { "\(jobLabel(e.jobNumber)) assigned to \($0)" } ?? "\(jobLabel(e.jobNumber)) assigned"
    case .jobMoved:
        if let at = e.scheduledAt, !at.isEmpty {
            title = "\(jobLabel(e.jobNumber)) moved to \(try movedTo(at, now: now, timeZone: timeZone))"
        } else {
            title = "\(jobLabel(e.jobNumber)) moved"
        }
    case .textReceived:
        title = "Text from \(customer)"
        let preview = ECMA.trim(e.preview ?? "")
        detail = preview.isEmpty ? "Sent a picture" : preview
    case nil:
        title = "Update"
    }
    let open: ActivityOpen? =
        kind == .textReceived
        ? e.conversationId.flatMap { $0.isEmpty ? nil : ActivityOpen(screen: .conversation, id: $0) }
        : e.jobId.flatMap { $0.isEmpty ? nil : ActivityOpen(screen: .job, id: $0) }
    return ActivityRow(
        id: e.id, symbol: kind?.symbol ?? .report, title: title, detail: detail,
        time: try activityTime(e.createdAt, now: now, timeZone: timeZone), open: open)
}

public struct ActivityDay: Codable, Equatable, Identifiable, Sendable {
    /// The shop's local date, "2026-10-20".
    public var key: String
    /// "Today", "Yesterday", "Tue, Oct 14".
    public var title: String
    public var rows: [ActivityRow]

    public var id: String { key }
}

/// Events (newest first) under their day headers.
public func groupActivity(_ events: [ActivityEvent], now: Date, timeZone: String) throws -> [ActivityDay] {
    var days: [ActivityDay] = []
    for e in events {
        guard let ms = ECMA.parseDate(e.createdAt) else { throw DateRuleError.invalidTimeValue }
        let key = try localDate(Date(timeIntervalSince1970: ms / 1000), timeZone)
        if days.last?.key != key {
            days.append(
                ActivityDay(key: key, title: try activityDay(e.createdAt, now: now, timeZone: timeZone), rows: []))
        }
        days[days.count - 1].rows.append(try activityRow(e, now: now, timeZone: timeZone))
    }
    return days
}
