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

    /// Five parts; a maintenance visit has no tests or findings, so no Findings, and ends with
    /// Complete Job, billed monthly, so no Wrap-Up (core `jobHasWrapUp`, owner 2026-10-19). A
    /// repair job has no Checklist (core `jobHasChecklist`, owner 2026-10-22).
    public static func sections(for type: JobType) -> [JobPageSection] {
        allCases.filter {
            !(type == .maintenance && $0 == .findings) && ($0 != .wrapUp || jobHasWrapUp(type.rawValue))
                && ($0 != .checklist || jobHasChecklist(type.rawValue))
        }
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

    /// A screen opened from the job asks the job page to show a part when it's back in front
    /// (the signing screen's Go to Checklist).
    private static var requested: [String: JobPageSection] = [:]
    public static func request(_ section: JobPageSection, for jobId: String) {
        requested[jobId] = section
        chosen[jobId] = section
    }
    /// The part asked for, once.
    public static func takeRequest(for jobId: String) -> JobPageSection? { requested.removeValue(forKey: jobId) }
}

// MARK: - Header

/// "Leak detection", "Repair", "Maintenance", "Pool inspection"; a visit from a service plan reads
/// "Maintenance plan".
public func jobTypeLabel(_ job: JobView) -> String {
    let label = job.type.label
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

/// The header's status buttons on a phone (owner, 2026-10-20): Start Job moves to the Next Step
/// bar, so the header keeps the rest (Unschedule, Reopen Visit, Complete Job).
public func jobHeaderPhoneActions(_ status: JobStatus, type: JobType) -> [JobStatus] {
    jobHeaderActions(status, type: type).filter { !($0 == .inProgress && jobCanStart(status, type: type)) }
}

/// The job can be started (Scheduled or Unscheduled): the Next Step bar's Start Job.
public func jobCanStart(_ status: JobStatus, type: JobType) -> Bool {
    (status == .scheduled || status == .unscheduled) && jobHeaderActions(status, type: type).contains(.inProgress)
}

// MARK: - Next Step bar

/// A button on the job page's Next Step bar (spec 1): the same action as the inline button it
/// replaces.
public enum NextStepAction: String, Equatable, Sendable {
    case startJob, completeJob, addTest, addFinding, addPhoto, addVideo, writeDraft, reviewWithCustomer
    /// Wrap-Up's next step (owner, 2026-10-22): its words come from core `wrapUp`'s next action.
    case wrapUp
    /// A done maintenance visit's View Report or Send Visit Report (core `visitReportBar`).
    case visitReport

    public var title: String {
        switch self {
        case .startJob: "Start Job"
        case .completeJob: CompleteJobText.title
        case .addTest: "Add Test"
        case .addFinding: "Add Finding"
        case .addPhoto: "Add Photo"
        case .addVideo: "Add Video"
        case .writeDraft: "Write Draft"
        case .reviewWithCustomer: ReportTabModel.reviewWithCustomer
        case .wrapUp: "Next Step"
        case .visitReport: "Visit Report"
        }
    }
}

/// The Next Step bar's buttons, primary first; empty hides the bar. First match wins: Start Job
/// while the job can be started; a done maintenance visit's report on every section (owner,
/// 2026-10-22: "the visit report is really buried"); Complete Job on a visit's Checklist; Add
/// Test and Add Finding on Findings; Add Photo and Add Video on Photos; Wrap-Up's next step
/// (core `wrapUp`) until every step is done. Port of nextStepButtons in
/// apps/web/src/lib/next-step.ts.
public func nextStepActions(
    _ job: JobView, section: JobPageSection, hasTestTypes: Bool, wrapUp: WrapUpNext? = nil,
    visitAction: VisitReportBarAction? = nil
) -> [NextStepAction] {
    if jobCanStart(job.status, type: job.type) { return [.startJob] }
    if job.type == .maintenance, job.status == .done, visitAction != nil { return [.visitReport] }
    switch section {
    case .checklist:
        return checklistShowsCompleteJob(job) ? [.completeJob] : []
    case .findings:
        return hasTestTypes ? [.addTest, .addFinding] : [.addFinding]
    case .photos:
        return [.addPhoto, .addVideo]
    case .wrapUp:
        return wrapUp == nil ? [] : [.wrapUp]
    case .details:
        return []
    }
}

/// Complete Job at the end of a visit's Checklist: maintenance, scheduled or in progress.
public func checklistShowsCompleteJob(_ job: JobView) -> Bool {
    job.type == .maintenance && (job.status == .scheduled || job.status == .inProgress)
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
    /// The price row and field: not on a repair job, whose price is its Repairs' total (owner,
    /// 2026-10-22: "add additional repair").
    public var showsFee: Bool
    /// A repair job lists its repairs (Repairs, between Assigned to and From the Customer).
    public var showsRepairs: Bool
    /// Only leak detection marks a leak's location (owner, 2026-10-19: no leak checkbox on
    /// visits); it's also what makes the price a detection fee.
    public var marksLeakLocation: Bool
    /// The On Site footer: "The detection fee is shown on the report." or "Billed on the invoice."
    public var feeFooter: String
    public var intake: [IntakeAnswer]
    /// "From the Customer" (owner, 2026-10-19), on every job.
    public var intakeTitle: String
    /// The job's pool, whose gallons On Site edits (owner, 2026-10-19), and them as "20,000".
    public var poolId: String?
    public var poolGallons: String

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
        showsRepairs = job.type == .repair
        showsFee = !showsRepairs
        marksLeakLocation = job.type == .detection
        feeFooter = marksLeakLocation ? "The detection fee is shown on the report." : "Billed on the invoice."
        intake = intakeAnswers(settings: settings, intake: job.job["intake"], jobType: job.type)
        // From the Customer on a repair (owner, 2026-10-19): what the customer needs, first. A
        // repair job lists them under Repairs instead (owner, 2026-10-22).
        if !showsRepairs, let need = job.job["intake"]?[repairItemKey]?.string, !need.isEmpty {
            intake.insert(IntakeAnswer(question: repairItemLabel, answer: need), at: 0)
        }
        intakeTitle = "From the Customer"
        poolId = job.property?.id
        poolGallons = job.property?["approx_gallons"]?.number.map { gallonsInput(String(Int($0))) } ?? ""
    }

    /// The contact row's first line: the phone, else the email.
    public var contactLine: String? { phone ?? email }
    /// The email under the phone, when there are both.
    public var contactDetail: String? { phone != nil ? email : nil }
}

/// The shop's intake questions for this kind of job (`intakeQuestionsFor`) the customer
/// answered, in the shop's order.
public func intakeAnswers(settings: JSONValue, intake: JSONValue?, jobType: JobType = .detection) -> [IntakeAnswer] {
    guard case .array(let questions)? = settings["intake_questions"] else { return [] }
    return intakeQuestionsFor(questions, jobType).compactMap { q in
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

/// What On Site's Pool gallons writes on the pool: the number, or null when blank; nil when it
/// isn't a number ("Enter the gallons as a number, like 20,000.").
public func poolGallonsValue(_ typed: String) -> JSONValue? {
    let text = typed.trimmingCharacters(in: .whitespaces)
    if text.isEmpty { return .null }
    return parseGallons(text).map { .number(Double($0)) }
}

/// The job page's large title (owner, 2026-10-20): the customer's name, else "Job #1042" (a
/// plain String: a localized number would print "1,042"), else "New Job".
public func jobPageTitle(_ job: JobView) -> String {
    if let name = job.customer?["name"]?.string, !name.isEmpty { return name }
    return job.number.map { "Job #" + String($0) } ?? "New Job"
}

/// "Job #1042" in smaller print under the customer's name; nil when the number is the title.
public func jobNumberLine(_ job: JobView) -> String? {
    guard let name = job.customer?["name"]?.string, !name.isEmpty, let n = job.number else { return nil }
    return "Job #" + String(n)
}
