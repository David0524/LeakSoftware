import Foundation
import SundeckCore
import SundeckSync

// The job page (docs/design/2026-10-19-native-apps-follow-web.md, section 5.4): its sections,
// its header, and what Details shows, worked out without SwiftUI so it's tested on Linux.
// Port of apps/web/src/app/(office)/jobs/[id]/page.tsx and components/customer-links.tsx.

// MARK: - Sections

/// The job page's parts, in the website's order.
public enum JobPageSection: String, CaseIterable, Hashable, Sendable {
    case details, checklist, findings, photos, wrapUp

    public var title: String {
        switch self {
        case .details: "Details"
        case .checklist: "Checklist"
        case .findings: "Findings"
        case .photos: "Photos"
        case .wrapUp: "Wrap-Up"
        }
    }

    /// Five parts; a maintenance visit has no tests or findings, so no Findings.
    public static func sections(for type: JobType) -> [JobPageSection] {
        type == .maintenance ? allCases.filter { $0 != .findings } : allCases
    }
}

/// The part shown on each job, remembered while the app runs (the website keeps it in the URL).
@MainActor
public enum JobSectionMemory {
    private static var chosen: [String: JobPageSection] = [:]

    /// The remembered part, if it's one this job has; else Details.
    public static func section(for jobId: String, type: JobType) -> JobPageSection {
        guard let section = chosen[jobId], JobPageSection.sections(for: type).contains(section) else {
            return .details
        }
        return section
    }

    public static func remember(_ section: JobPageSection, for jobId: String) { chosen[jobId] = section }
}

// MARK: - Header

/// "Leak detection", "Repair", "Maintenance"; a visit from a service plan reads "Maintenance plan".
public func jobTypeLabel(_ job: JobView) -> String {
    let label =
        switch job.type {
        case .detection: "Leak detection"
        case .repair: "Repair"
        case .maintenance: "Maintenance"
        }
    let plan = job.job["service_plan_id"]?.string != nil && job.customer != nil
    return plan ? "\(label) plan" : label
}

/// The time under the status: "Started 9:40 AM" while in progress, else the schedule.
public func jobHeaderTime(_ job: JobView, now: Date, timeZone: String) -> String {
    if job.status == .inProgress, let started = job.job["started_at"]?.string {
        return "Started " + ((try? formatSchedule(started, now, timeZone)) ?? "")
    }
    return (try? formatSchedule(job.job["scheduled_start"]?.string, now, timeZone)) ?? "Not scheduled"
}

/// The header's status buttons: every next step but Cancel, which sits at the end of Details.
public func jobHeaderActions(_ status: JobStatus, type: JobType) -> [JobStatus] {
    userTransitions(from: status, type: type.rawValue).filter { $0 != .canceled }
}

/// Whether Details ends with Cancel Job.
public func jobCanCancel(_ status: JobStatus, type: JobType) -> Bool {
    userTransitions(from: status, type: type.rawValue).contains(.canceled)
}

/// What a status change writes: the status, and the start time the first time it starts.
public func jobStatusValues(_ to: JobStatus, job: Row, now: Date = Date()) -> Row {
    var values: Row = ["status": .string(to.rawValue)]
    if to == .inProgress, job["started_at"]?.string == nil {
        values["started_at"] = .string(isoTimestamp(milliseconds: now.timeIntervalSince1970 * 1000))
    }
    return values
}

// MARK: - Details

/// One intake answer ("Why they called" / "Pool water level dropping").
public struct IntakeAnswer: Equatable, Sendable {
    public var question: String
    public var answer: String
}

/// What the Details section shows, in the website's order and words.
public struct JobDetails: Equatable, Sendable {
    public var customerId: String?
    public var customerName: String?
    public var phone: String?
    public var email: String?
    /// The Pool group, when the job has a property.
    public var address: String?
    /// "Gunite / plaster · Pool and spa · 20,000 gallons".
    public var poolDetail: String?
    public var accessNotes: String?
    /// "Tony Tech", or "Nobody yet".
    public var tech: String
    /// The second tech, if any.
    public var with: String?
    /// "$649.00", when the job has a fee.
    public var fee: String?
    /// "Detection fee" on leak detection, else "Price" (core `jobFeeLabel`).
    public var feeLabel: String
    /// Only leak detection marks a leak's location (owner, 2026-10-19: no leak checkbox on
    /// visits); it's also what makes the price a detection fee.
    public var marksLeakLocation: Bool
    /// The On Site footer: "The detection fee is shown on the report." or "Billed on the invoice."
    public var feeFooter: String
    public var intake: [IntakeAnswer]
    /// "When they called" on a repair, else "When they booked".
    public var intakeTitle: String

    public init(job: JobView, team: [TeamProfile], settings: JSONValue) {
        customerId = job.customer?.id
        customerName = job.customer?["name"]?.string
        phone = job.customer?["phone"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        email = job.customer?["email"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        if let property = job.decodedProperty {
            address = job.address
            poolDetail = [
                property.poolType?.label, property.hasSpa ? "Pool and spa" : "Pool",
                poolGallonsLabel(job.property?["approx_gallons"]),
            ]
            .compactMap { $0 }.joined(separator: " · ")
            accessNotes = job.property?["access_notes"]?.string.flatMap { $0.isEmpty ? nil : $0 }
        }
        let assigned = job.job["assigned_user_id"]?.string
        tech = assigned.map { id in team.first { $0.id == id }?.displayName ?? "Teammate" } ?? "Nobody yet"
        with = job.job["second_tech_id"]?.string.map { id in team.first { $0.id == id }?.displayName ?? "Teammate" }
        fee = job.job["fee_cents"]?.number.map { formatCents(Int($0)) }
        feeLabel = jobFeeLabel(job.type)
        marksLeakLocation = job.type == .detection
        feeFooter = marksLeakLocation ? "The detection fee is shown on the report." : "Billed on the invoice."
        intake = intakeAnswers(settings: settings, intake: job.job["intake"])
        // When They Call on a repair (owner, 2026-10-19): what the customer needs, first.
        if let need = job.job["intake"]?[repairItemKey]?.string, !need.isEmpty {
            intake.insert(IntakeAnswer(question: repairItemLabel, answer: need), at: 0)
        }
        intakeTitle = job.type == .repair ? "When they called" : "When they booked"
    }

    /// The contact row's first line: the phone, else the email.
    public var contactLine: String? { phone ?? email }
    /// The email under the phone, when there are both.
    public var contactDetail: String? { phone != nil ? email : nil }
}

/// The shop's intake questions the customer answered, in the shop's order.
public func intakeAnswers(settings: JSONValue, intake: JSONValue?) -> [IntakeAnswer] {
    guard case .array(let questions)? = settings["intake_questions"] else { return [] }
    return questions.compactMap { q in
        guard let key = q["key"]?.string, let label = q["label"]?.string else { return nil }
        switch intake?[key] {
        case .string(let s) where !s.isEmpty: return IntakeAnswer(question: label, answer: s)
        case .array(let list) where !list.isEmpty:
            return IntakeAnswer(question: label, answer: list.compactMap(\.string).joined(separator: ", "))
        case .number(let n): return IntakeAnswer(question: label, answer: testValueText(.number(n)) ?? "")
        case .bool(true): return IntakeAnswer(question: label, answer: "Yes")
        default: return nil
        }
    }
}

// MARK: - Customer links

/// One customer link that still works: what it opens, whether it was opened, and until when.
public struct CustomerLinkRow: Identifiable, Equatable, Sendable {
    public var id: String
    /// "Report", "Quote", "Invoice" or "Link".
    public var what: String
    /// "Opened 2 times, last Oct 15 · Works until Apr 13".
    public var detail: String
}

/// The job's links that still work, newest first (synced `share_link` rows): not turned off,
/// not deleted, and not past their date.
public func customerLinks(_ store: LocalStore, jobId: String, now: Date, timeZone: String) -> [CustomerLinkRow] {
    let rows = ((try? store.list("share_link", jobId: jobId)) ?? [])
    return customerLinkRows(rows, now: now, timeZone: timeZone)
}

public func customerLinkRows(_ rows: [Row], now: Date, timeZone: String) -> [CustomerLinkRow] {
    let live = rows.filter { row in
        guard row["revoked_at"]?.string == nil, row["deleted_at"]?.string == nil else { return false }
        guard let expires = row["expires_at"]?.string else { return true }
        return parseServerDate(expires).map { $0 > now } ?? true
    }
    .sorted { ($0["created_at"]?.string ?? "") > ($1["created_at"]?.string ?? "") }
    let day = DateFormatter()
    day.locale = Locale(identifier: "en_US_POSIX")
    day.dateFormat = "MMM d"
    day.timeZone = TimeZone(identifier: timeZone) ?? .current
    func format(_ iso: String?) -> String? { iso.flatMap(parseServerDate).map(day.string(from:)) }
    return live.map { row in
        let what =
            row["report_id"]?.string != nil
            ? "Report"
            : row["quote_id"]?.string != nil ? "Quote" : row["invoice_id"]?.string != nil ? "Invoice" : "Link"
        let views = Int(row["view_count"]?.number ?? 0)
        var seen = views == 0 ? "Not opened yet" : views == 1 ? "Opened once" : "Opened \(views) times"
        if views > 0, let last = format(row["last_viewed_at"]?.string) { seen += ", last \(last)" }
        if let until = format(row["expires_at"]?.string) { seen += " · Works until \(until)" }
        return CustomerLinkRow(id: row.id, what: what, detail: seen)
    }
}

/// A timestamp from the server or the phone: ISO 8601, or as Postgres writes it
/// ("2026-10-15 10:39:00.123+00").
func parseServerDate(_ text: String) -> Date? {
    if let date = parseISODate(text) { return date }
    let pg = DateFormatter()
    pg.locale = Locale(identifier: "en_US_POSIX")
    for format in ["yyyy-MM-dd HH:mm:ss.SSSSSSXXXXX", "yyyy-MM-dd HH:mm:ss.SSSXXXXX", "yyyy-MM-dd HH:mm:ssXXXXX"] {
        pg.dateFormat = format
        if let date = pg.date(from: text) { return date }
    }
    return nil
}
