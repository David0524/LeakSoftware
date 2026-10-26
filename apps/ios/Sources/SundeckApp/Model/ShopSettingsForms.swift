import Foundation
import SundeckCore
import SundeckSync

// Settings pages built in the app (owner, 2026-10-20: "From the app, do not link to the website
// if you can help it"): Company and Branding, Scheduling and Routes, Report Templates, and the
// On My Way choice, written to the synced company and report_template rows through the sync
// layer, with the website's fields, wording and checks (app/actions/settings.ts, routes.ts).

/// The time zones offered (the website's US_ZONES), with the shop's own first when it isn't one.
public let usTimeZones = [
    "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles",
    "America/Anchorage", "Pacific/Honolulu",
]

public func timeZoneChoices(_ current: String) -> [String] {
    usTimeZones.contains(current) ? usTimeZones : [current] + usTimeZones
}

private func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }
private func optional(_ s: String) -> JSONValue { trimmed(s).isEmpty ? .null : .string(trimmed(s)) }

private func merged(_ settings: JSONValue?, _ changes: [String: JSONValue]) -> JSONValue {
    var o: [String: JSONValue] = [:]
    if case .object(let current)? = settings { o = current }
    for (k, v) in changes { o[k] = v }
    return .object(o)
}

// MARK: - Company profile

/// Settings › Company and Branding › Company profile (`saveCompany`).
public struct CompanyProfileForm: Equatable, Sendable {
    public var name = ""
    public var legalName = ""
    public var phone = ""
    public var email = ""
    public var street = ""
    public var unit = ""
    public var city = ""
    public var state = ""
    public var zip = ""
    public var timeZone = "America/Phoenix"
    public var reviewURL = ""

    public init() {}

    public init(_ row: Row?) {
        let s = { (k: String) in row?[k]?.string ?? "" }
        name = s("name")
        legalName = s("legal_name")
        phone = s("phone")
        email = s("email")
        street = s("address_line1")
        unit = s("address_line2")
        city = s("city")
        state = s("state")
        zip = s("postal_code")
        timeZone = row?["timezone"]?.string ?? "America/Phoenix"
        reviewURL = s("review_url")
    }

    /// Field errors, by the website's field names.
    public var errors: [String: String] {
        var e: [String: String] = [:]
        if trimmed(name).isEmpty { e["name"] = "Enter the company name." }
        if TimeZone(identifier: timeZone) == nil && timeZone != "UTC" { e["timezone"] = "Pick a time zone." }
        // It goes into customer emails as a link: web pages only (website `isWebUrl`).
        if !trimmed(reviewURL).isEmpty && !Limits.isWebURL(trimmed(reviewURL)) {
            e["review_url"] = Limits.reviewLinkText
        }
        return e
    }

    public var values: Row {
        [
            "name": .string(trimmed(name)), "legal_name": optional(legalName), "phone": optional(phone),
            "email": optional(email), "address_line1": optional(street), "address_line2": optional(unit),
            "city": optional(city), "state": optional(state.uppercased()), "postal_code": optional(zip),
            "review_url": optional(reviewURL), "timezone": .string(timeZone),
        ]
    }
}

// MARK: - Reminders and reviews

/// Settings › Company and Branding › Reminders and Reviews (`saveFollowups`).
public struct FollowupsForm: Equatable, Sendable {
    public var quoteDays: String
    public var invoiceDays: String
    public var reviewRequests: Bool

    public init(_ settings: JSONValue?) {
        let days = { (k: String, d: [Int]) -> String in
            guard case .array(let list)? = settings?["reminders"]?[k] else {
                return d.map(String.init).joined(separator: ", ")
            }
            return list.compactMap { $0.number.map { String(Int($0)) } }.joined(separator: ", ")
        }
        quoteDays = days("quote_days", [3, 7])
        invoiceDays = days("invoice_days", [7, 14, 30])
        reviewRequests = settings?["review_requests"]?.bool ?? true
    }

    public var errors: [String: String] {
        var e: [String: String] = [:]
        if parseReminderDays(quoteDays) == nil { e["quote_days"] = "Enter days after sending, like 3, 7." }
        if parseReminderDays(invoiceDays) == nil { e["invoice_days"] = "Enter days after sending, like 7, 14, 30." }
        return e
    }

    public func settings(_ current: JSONValue?) -> JSONValue {
        let list = { (s: String) in JSONValue.array((parseReminderDays(s) ?? []).map { .number(Double($0)) }) }
        return merged(
            current,
            [
                "reminders": ["quote_days": list(quoteDays), "invoice_days": list(invoiceDays)],
                "review_requests": .bool(reviewRequests),
            ])
    }

    public static let note =
        "Emails sent once a day, in the morning. They stop when a quote is accepted or an invoice is paid, and customers can turn them off from any of them."
}

// MARK: - Branding

public struct BrandingForm: Equatable, Sendable {
    public var primary: String
    public var secondary: String

    public init(_ row: Row?) {
        primary = row?["brand_primary"]?.string ?? ""
        secondary = row?["brand_secondary"]?.string ?? ""
    }

    public var errors: [String: String] {
        var e: [String: String] = [:]
        if !isHexColor(trimmed(primary)) { e["brand_primary"] = "Use a color like #12263A." }
        if !trimmed(secondary).isEmpty && !isHexColor(trimmed(secondary)) {
            e["brand_secondary"] = "Use a color like #EE6A1F."
        }
        return e
    }

    public var values: Row {
        [
            "brand_primary": .string(trimmed(primary).uppercased()),
            "brand_secondary": trimmed(secondary).isEmpty ? .null : .string(trimmed(secondary).uppercased()),
        ]
    }
}

/// A logo file's checks (`saveBranding`): PNG, JPEG or SVG, under 2 MB. The extension, or why not.
public func logoFileProblem(contentType: String, bytes: Int) -> (ext: String?, error: String?) {
    let ext = ["image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg"][contentType]
    guard let ext else { return (nil, "Use a PNG, JPEG, or SVG file.") }
    if bytes > 2 * 1024 * 1024 { return (nil, "Use a file under 2 MB.") }
    return (ext, nil)
}

/// "Job numbers": the next number's checks (`saveNextJobNumber`).
public func nextJobNumberProblem(_ text: String) -> String? {
    guard let n = Int(trimmed(text)), n >= 1, n <= 2_000_000_000 else { return "Enter a whole number, like 10450." }
    return nil
}

/// The hint under Next job number.
public func nextJobNumberHint(lastNumber: Int) -> String {
    lastNumber > 0
        ? "The last job is #\(lastNumber). To continue from your old system, enter a higher number."
        : "To continue from your old system, enter your next number."
}

/// The highest job number on the phone.
public func lastJobNumber(_ store: LocalStore, companyId: String) -> Int {
    let rows = (try? store.list("job")) ?? []
    return rows.filter { $0["company_id"]?.string == companyId }.compactMap { $0["number"]?.number }.map { Int($0) }
        .max() ?? 0
}

public let reportDisclaimerHint =
    "Ends every report. Reports already sent keep their old text."

public func reportDisclaimerProblem(_ text: String) -> String? {
    trimmed(text).count > 20_000 ? "Keep it under 20,000 characters." : nil
}

// MARK: - Scheduling and Routes

/// Settings › Scheduling and Routes › Working day (`saveScheduling`).
public struct SchedulingForm: Equatable, Sendable {
    public var dayStart: String
    public var dayEnd: String
    public var windowMin: Int
    public var jobHours: String
    public var workDays: Set<Int>
    public var visitMinutes: String
    public var weeksAhead: String

    public static let dayLetters = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    public static let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    public static let windows: [(minutes: Int, label: String)] = [
        (0, "Exact"), (60, "1 Hour"), (120, "2 Hours"), (240, "4 Hours"),
    ]

    public init(_ settings: JSONValue?) {
        let r = routingSettings(settings)
        let m = maintenanceSettings(settings)
        dayStart = r.dayStart
        dayEnd = r.dayEnd
        windowMin = r.windowMin
        let hours = Double(r.jobMinutes) / 60
        jobHours = hours == hours.rounded() ? String(Int(hours)) : String(hours)
        workDays = Set(r.workDays)
        visitMinutes = String(m.visitMinutes)
        weeksAhead = String(m.weeksAhead)
    }

    /// The On My Way line under the arrival choice.
    public var windowNote: String {
        switch windowMin {
        case 0: "On My Way texts say “about 10:15 AM”."
        default:
            "On My Way texts give a \(windowMin / 60)-hour window, like “between 10:00 AM and \(windowMin == 60 ? "11:00 AM" : windowMin == 120 ? "12:00 PM" : "2:00 PM")”."
        }
    }

    public var errors: [String: String] {
        let clock = { (s: String) in s.wholeMatch(of: /([01][0-9]|2[0-3]):[0-5][0-9]/) != nil }
        var e: [String: String] = [:]
        if !clock(dayStart) { e["day_start"] = "Pick a time." }
        if !clock(dayEnd) {
            e["day_end"] = "Pick a time."
        } else if clock(dayStart) && dayEnd <= dayStart {
            e["day_end"] = "End after the start."
        }
        if ![0, 60, 120, 240].contains(windowMin) { e["arrival_window_minutes"] = "Pick a window." }
        let hours = Double(trimmed(jobHours)) ?? .nan
        if !(hours >= 0.25 && hours <= 12) { e["job_hours"] = "Enter 0.25 to 12 hours." }
        if workDays.isEmpty { e["work_days"] = "Pick at least one day." }
        if !((Int(trimmed(visitMinutes)) ?? 0) >= 10 && (Int(trimmed(visitMinutes)) ?? 0) <= 240) {
            e["visit_minutes"] = "Enter 10 to 240 minutes."
        }
        if !((Int(trimmed(weeksAhead)) ?? 0) >= 1 && (Int(trimmed(weeksAhead)) ?? 0) <= 12) {
            e["weeks_ahead"] = "Enter 1 to 12 weeks."
        }
        return e
    }

    public func settings(_ current: JSONValue?) -> JSONValue {
        var maintenance: [String: JSONValue] = [:]
        if case .object(let m)? = current?["maintenance"] { maintenance = m }
        maintenance["visit_minutes"] = .number(Double(Int(trimmed(visitMinutes)) ?? 30))
        maintenance["weeks_ahead"] = .number(Double(Int(trimmed(weeksAhead)) ?? 4))
        return merged(
            current,
            [
                "routing": [
                    "day_start": .string(dayStart), "day_end": .string(dayEnd),
                    "arrival_window_minutes": .number(Double(windowMin)),
                    "job_minutes": .number(((Double(trimmed(jobHours)) ?? 2.5) * 60).rounded()),
                    "work_days": .array(workDays.sorted().map { .number(Double($0)) }),
                ],
                "maintenance": .object(maintenance),
            ])
    }
}

/// The shop location's line (Scheduling and Routes › Shop location).
public func shopLocationText(_ row: Row?) -> (address: String, status: String) {
    let address = addressText(row)
    let located = row?["latitude"]?.number != nil && row?["longitude"]?.number != nil
    let status =
        located
        ? (row?["geocoded_address"]?.string == address
            ? "On the map." : "On the map, from an earlier address or the shop’s GPS.")
        : "Not on the map yet, so routes can’t count the drive from the shop."
    return (address.isEmpty ? "No address yet." : address, status)
}

/// "3 pools have no map location yet." / "Every pool is on the map."
public func unlocatedPoolsText(_ store: LocalStore, companyId: String) -> String {
    let n = ((try? store.list("property")) ?? []).filter {
        $0["company_id"]?.string == companyId && $0["deleted_at"]?.string == nil && $0["latitude"]?.number == nil
    }.count
    return n == 0
        ? "Every pool is on the map." : "\(n) \(n == 1 ? "pool has" : "pools have") no map location yet."
}

// MARK: - On My Way

public enum OnMyWayChoice: String, CaseIterable, Hashable, Sendable {
    case messages, phone

    /// `ON_MY_WAY_LABELS`
    public var label: String { self == .messages ? "Sundeck Pro Messages" : "Tech’s Phone" }

    public var note: String {
        self == .messages
            ? "Sent from the company number, so the whole team sees the reply."
            : "Opens the tech’s own Messages app."
    }

    public init(_ settings: JSONValue?) { self = onMyWayFromPhone(settings) ? .phone : .messages }
}

// MARK: - Report templates

/// Settings › Report Templates: the homeowner report (name, on or off). The partner report is
/// gone (owner, 2026-10-18), and so is the insurance one (owner, 2026-10-20).
public struct ReportTemplateItem: Identifiable, Equatable, Sendable {
    public var id: String
    public var key: String
    public var name: String
    public var enabled: Bool

    public var detail: String {
        "For the pool owner: plain words, what was found, what it means, and what to do next."
    }

    public var value: String { enabled ? "On" : "Off" }
    public var editable: Bool { true }
}

public func reportTemplateItems(_ store: LocalStore, companyId: String) -> [ReportTemplateItem] {
    ((try? store.list("report_template")) ?? [])
        .filter { $0["company_id"]?.string == companyId && $0["deleted_at"]?.string == nil }
        .compactMap { r -> ReportTemplateItem? in
            guard let id = r["id"]?.string, let key = r["key"]?.string, key == "homeowner" else { return nil }
            return ReportTemplateItem(
                id: id, key: key, name: r["name"]?.string ?? key, enabled: r["enabled"]?.bool ?? false)
        }
}

// MARK: - Writes

@MainActor
public enum ShopSettingsWrites {
    /// The company profile; a new address clears the shop's pin and queues finding it again.
    public static func saveProfile(
        _ sync: SyncService, companyId: String, _ form: CompanyProfileForm, locate: LocateQueue?
    ) throws {
        let before = try? sync.store.get("company", companyId)
        let (values, moved) = clearingLocation(form.values, before: before, shop: true)
        try sync.write("company", id: companyId, companyId: companyId, values)
        if moved { locate?.add(LocateRequest(companyId: companyId, propertyId: nil)) }
    }

    public static func saveSettings(_ sync: SyncService, companyId: String, _ settings: JSONValue) throws {
        try sync.write("company", id: companyId, companyId: companyId, ["settings": settings])
    }

    public static func saveOnMyWay(
        _ sync: SyncService, companyId: String, settings: JSONValue?, _ choice: OnMyWayChoice
    ) throws {
        try saveSettings(sync, companyId: companyId, merged(settings, ["on_my_way": .string(choice.rawValue)]))
    }

    public static func saveDisclaimer(_ sync: SyncService, companyId: String, _ text: String) throws {
        try sync.write("company", id: companyId, companyId: companyId, ["report_disclaimer": optional(text)])
    }

    public static func saveBranding(
        _ sync: SyncService, companyId: String, _ form: BrandingForm, logoPath: String?
    ) throws {
        var values = form.values
        if let logoPath { values["logo_path"] = .string(logoPath) }
        try sync.write("company", id: companyId, companyId: companyId, values)
    }

    public static func saveReportTemplate(
        _ sync: SyncService, companyId: String, id: String, name: String, enabled: Bool
    ) throws {
        try sync.write(
            "report_template", id: id, companyId: companyId,
            ["name": .string(trimmed(name)), "enabled": .bool(enabled)])
    }
}
