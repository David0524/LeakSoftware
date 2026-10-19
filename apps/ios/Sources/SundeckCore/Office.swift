import Foundation

// Schedule dates. Port of the schedule half of office.ts: days are "YYYY-MM-DD", worked out
// in UTC as the TypeScript does, so a day never shifts with the device's zone.

public enum ScheduleView: String, Codable, CaseIterable, Hashable, Sendable {
    case day, week, month

    public var title: String {
        switch self {
        case .day: "Day"
        case .week: "Week"
        case .month: "Month"
        }
    }
}

/// `Date.UTC(y, m - 1, d)` from "YYYY-MM-DD" (`split("-").map(Number)`); NaN when it isn't one.
private func parseDay(_ date: String) -> Double {
    let p = date.split(separator: "-", omittingEmptySubsequences: false).map { ECMA.number(String($0)) }
    let part = { (i: Int) in i < p.count ? p[i] : .nan }
    return ECMA.dateUTC(part(0), part(1) - 1, part(2), 0, 0)
}

/// `new Date(ms).toISOString().slice(0, 10)`.
private func formatDay(ms: Double) throws -> String { String(try ECMA.isoString(ms).prefix(10)) }

public func isDateString(_ v: String) -> Bool {
    v.wholeMatch(of: /[0-9]{4}-[0-9]{2}-[0-9]{2}/) != nil && !parseDay(v).isNaN
}

public func addDays(_ date: String, _ days: Int) throws -> String {
    try formatDay(ms: parseDay(date) + Double(days) * ECMA.dayMs)
}

/// Monday of the week containing `date`.
public func weekStart(_ date: String) throws -> String {
    let ms = parseDay(date)
    guard !ms.isNaN else { throw DateRuleError.invalidTimeValue }
    let dow = ECMA.utcClock(ms).weekday
    return try addDays(date, -((dow + 6) % 7))
}

/// The same day of the month, `months` later (clamped: Jan 31 + 1 month = Feb 28).
public func addMonths(_ date: String, _ months: Int) throws -> String {
    let p = date.split(separator: "-", omittingEmptySubsequences: false).map { ECMA.number(String($0)) }
    let part = { (i: Int) in i < p.count ? p[i] : .nan }
    let first = ECMA.dateUTC(part(0), part(1) - 1 + Double(months), 1, 0, 0)
    guard !first.isNaN else { throw DateRuleError.invalidTimeValue }
    let f = ECMA.utcClock(first)
    let last = ECMA.utcClock(ECMA.dateUTC(Double(f.year), Double(f.month), 0, 0, 0)).day
    return try formatDay(ms: ECMA.dateUTC(Double(f.year), Double(f.month - 1), min(part(2), Double(last)), 0, 0))
}

/// The month's calendar: whole weeks, Monday first, from the week of the 1st to the last.
public func monthGrid(_ date: String) throws -> [String] {
    let first = "\(String(utf16Prefix: date, 8))01"
    let last = try addDays(addMonths(first, 1), -1)
    var days: [String] = []
    var d = try weekStart(first)
    while d <= last || days.count % 7 != 0 {
        days.append(d)
        d = try addDays(d, 1)
    }
    return days
}

/// The dates a schedule view covers.
public func scheduleDays(_ view: ScheduleView, _ date: String) throws -> [String] {
    switch view {
    case .day: return [date]
    case .month: return try monthGrid(date)
    case .week:
        let start = try weekStart(date)
        return try (0..<7).map { try addDays(start, $0) }
    }
}

private let weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
private let monthNames = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November",
    "December",
]

public enum DayStyle: String, Codable, Sendable {
    case short, long
}

/// "Sun, Oct 18" or, long, "Sunday, October 18".
public func formatDay(_ date: String, style: DayStyle) throws -> String {
    let ms = parseDay(date)
    guard !ms.isNaN else { throw DateRuleError.invalidTimeValue }
    let wall = ECMA.utcClock(ms)
    let weekday = weekdayNames[wall.weekday]
    let month = monthNames[wall.month - 1]
    return style == .long
        ? "\(weekday), \(month) \(wall.day)" : "\(weekday.prefix(3)), \(month.prefix(3)) \(wall.day)"
}

/// "9:00 AM" in the shop's time zone.
public func formatTime(_ iso: String, _ timeZone: String) throws -> String {
    let zone = try ECMA.zone(timeZone)
    guard let ms = ECMA.parseDate(iso) else { throw DateRuleError.invalidTimeValue }
    let wall = ECMA.wallClock(ms, zone)
    // Node writes a plain space before AM and PM (V8 swaps out ICU's U+202F).
    return "\((wall.hour + 11) % 12 + 1):\(ECMA.pad(String(wall.minute), 2)) \(wall.hour < 12 ? "AM" : "PM")"
}

// MARK: - Timeline (from audit_log)

public struct AuditEntry: Codable, Equatable, Sendable {
    public var userId: String?
    public var tableName: String
    public var rowId: String
    public var field: String?
    public var oldValue: JSONValue?
    public var newValue: JSONValue?
    public var createdAt: String

    public init(
        userId: String?, tableName: String, rowId: String, field: String?, oldValue: JSONValue?,
        newValue: JSONValue?, createdAt: String
    ) {
        self.userId = userId
        self.tableName = tableName
        self.rowId = rowId
        self.field = field
        self.oldValue = oldValue
        self.newValue = newValue
        self.createdAt = createdAt
    }

    enum CodingKeys: String, CodingKey {
        case field
        case userId = "user_id"
        case tableName = "table_name"
        case rowId = "row_id"
        case oldValue = "old_value"
        case newValue = "new_value"
        case createdAt = "created_at"
    }
}

public struct TimelineEvent: Codable, Equatable, Sendable {
    public var at: String
    public var userId: String?
    public var text: String
}

private let nouns = [
    "job": "job", "job_component": "component", "checklist_item_result": "checklist item", "test_result": "test",
    "finding": "finding", "media": "capture", "customer": "customer", "property": "property",
]

private let kindNouns = ["photo": "photo", "video": "video", "audio": "voice note"]

/// Fields that are bookkeeping, not something a person did.
private let quiet: Set<String> = ["company_id", "id", "job_id", "sort_order", "instance_number"]

/// `v === null || v === undefined ? "" : String(v)`.
private func str(_ v: JSONValue?) -> String {
    guard let v, v != .null else { return "" }
    return ECMA.joinString(v)
}

/// `String(v)` as an object key (null is "null", undefined "undefined").
private func key(_ v: JSONValue?) -> String {
    guard let v else { return "undefined" }
    return v == .null ? "null" : ECMA.joinString(v)
}

/// Turns field-level audit rows into one readable line per change. Rows written in the same
/// statement (same time, person, and record) are one event. `labelFor` names a record (e.g. a
/// component's label) when the change itself does not carry a name.
public func timeline(_ entries: [AuditEntry], labelFor: (_ table: String, _ rowId: String) -> String?)
    -> [TimelineEvent]
{
    var order: [String] = []
    var groups: [String: [AuditEntry]] = [:]
    for e in entries {
        let k = "\(e.createdAt)|\(e.userId ?? "null")|\(e.tableName)|\(e.rowId)"
        if groups[k] == nil { order.append(k) }
        groups[k, default: []].append(e)
    }
    var events: [TimelineEvent] = []
    for k in order {
        let rows = groups[k]!
        let first = rows[0]
        var fieldOrder: [String] = []
        var fields: [String: AuditEntry] = [:]
        for r in rows {
            guard let f = r.field, !f.isEmpty else { continue }
            if fields[f] == nil { fieldOrder.append(f) }
            fields[f] = r
        }
        let created = rows.allSatisfy { $0.oldValue == nil || $0.oldValue == .null }
        let label = labelFor(first.tableName, first.rowId)
        if let text = describe(first.tableName, fieldOrder, fields, created, label) {
            events.append(TimelineEvent(at: first.createdAt, userId: first.userId, text: text))
        }
    }
    return ECMA.sort(events) { a, b in Double(ECMA.localeCompare(b.at, a.at)) }
}

private func describe(
    _ table: String, _ fieldOrder: [String], _ fields: [String: AuditEntry], _ created: Bool, _ label: String?
) -> String? {
    let v = { (f: String) in fields[f]?.newValue }
    let has = { (f: String) in fields[f] != nil }
    let named = (label ?? "").isEmpty ? "" : " “\(label!)”"
    let noun = nouns[table] ?? table.replacingOccurrences(of: "_", with: " ")

    if has("deleted_at") && ECMA.truthy(v("deleted_at")) { return "Removed \(noun)\(named)" }

    if table == "job" {
        if has("status") {
            let to = JobStatus(rawValue: key(v("status")))?.label ?? str(v("status"))
            if created { return "Job created (\(to))" }
            let from = JobStatus(rawValue: key(fields["status"]?.oldValue))?.label
            return from.map { "Status: \($0) → \(to)" } ?? "Status: \(to)"
        }
        if has("assigned_user_id") { return "Reassigned" }
        if has("scheduled_start") { return "Rescheduled" }
        if has("summary_notes") { return "Job notes updated" }
    }

    if table == "checklist_item_result" && has("status") {
        let status = str(v("status"))
        if status == "pending" && created { return nil }  // created with the component
        let what = label ?? "Checklist item"
        if status == "inspected" {
            let method = str(v("method"))
            return "\(what) inspected\(method.isEmpty ? "" : " (\(method))")"
        }
        if status == "excluded" {
            let reason = str(v("exclusion_reason"))
            return "\(what) excluded\(reason.isEmpty ? "" : ": \(reason)")"
        }
        return "\(what) set back to to-do"
    }

    if table == "job_component" && created { return "Added \(label ?? str(v("label")))" }

    if table == "test_result" {
        let outcome = str(v("outcome"))
        if created { return "\(label ?? "Test") recorded\(outcome.isEmpty ? "" : ": \(outcome)")" }
        if has("outcome") { return "\(label ?? "Test") outcome changed to \(outcome)" }
        return "\(label ?? "Test") edited"
    }

    if table == "finding" {
        let title = [str(v("title")), label ?? ""].first { !$0.isEmpty } ?? "finding"
        if created { return "Finding added: \(title)" }
        if has("status") { return "Finding “\(label ?? title)” marked \(str(v("status")))" }
        return "Finding “\(label ?? title)” edited"
    }

    if table == "media" {
        let kind = kindNouns[str(v("kind"))] ?? label ?? "capture"
        if created { return "Added a \(kind)" }
        if has("upload_state") && v("upload_state") == .string("uploaded") { return nil }
        if has("markup") { return "Marked up a \(label ?? "photo")" }
        if has("transcript") { return "Voice note transcribed" }
        if has("caption") { return "Captioned a \(label ?? "capture")" }
    }

    let changed = fieldOrder.filter { !quiet.contains($0) }
    if changed.isEmpty { return nil }
    if created { return "Added \(noun)\(named)" }
    return
        "Updated \(noun)\(named): \(changed.map { $0.replacingOccurrences(of: "_", with: " ") }.joined(separator: ", "))"
}
