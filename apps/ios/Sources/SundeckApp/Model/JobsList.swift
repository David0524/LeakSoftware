import Foundation
import SundeckCore
import SundeckSync

/// One job with its pool and customer, as the list and the job page show it. Port of
/// useJobViews in apps/mobile/src/data/jobs.ts.
public struct JobView: Identifiable, Equatable, Sendable {
    public var id: String
    public var job: Row
    public var property: Row?
    public var customer: Row?

    public var number: Int? { job["number"]?.number.map { Int($0) } }
    public var status: JobStatus { job["status"]?.string.flatMap(JobStatus.init(rawValue:)) ?? .unscheduled }
    public var type: JobType { job["type"]?.string.flatMap(JobType.init(rawValue:)) ?? .detection }
    public var customerName: String { customer?["name"]?.string ?? "Customer" }
    public var address: String {
        guard let decoded = decodedProperty else { return "Address" }
        let text = formatAddress(decoded)
        return text.isEmpty ? "Address" : text
    }

    /// The pool row as the core rules read it (flags a row leaves out count as false).
    public var decodedProperty: Property? {
        guard var row = property else { return nil }
        for flag in ["has_pool", "has_spa"] where row[flag]?.bool == nil { row[flag] = false }
        if row["address_line1"]?.string == nil { row["address_line1"] = "" }
        return try? JSONValue.object(row).decode(Property.self)
    }
    /// "#1042" once the server numbered it, "New" before.
    public var numberText: String { number.map { "#\($0)" } ?? "New" }
}

/// Every job of the company on this phone, with its property and customer (the bill-to customer,
/// else the property's).
public func jobViews(_ store: LocalStore, companyId: String) throws -> [JobView] {
    let properties = Dictionary(
        try store.list("property", companyId: companyId).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let customers = Dictionary(
        try store.list("customer", companyId: companyId).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    return try store.list("job", companyId: companyId).map { job in
        let property = job["property_id"]?.string.flatMap { properties[$0] }
        let customerId = job["bill_to_customer_id"]?.string ?? property?["customer_id"]?.string
        return JobView(id: job.id, job: job, property: property, customer: customerId.flatMap { customers[$0] })
    }
}

/// One job with its pool and customer, read by id (the job page): three row reads, not every job
/// on the phone (gestures spec section 6). Nil when it isn't on the phone or is another shop's.
public func jobView(_ store: LocalStore, companyId: String, jobId: String) throws -> JobView? {
    guard let job = try store.getLive("job", jobId), job["company_id"]?.string.map({ $0 == companyId }) ?? true
    else { return nil }
    let property = try job["property_id"]?.string.flatMap { try store.getLive("property", $0) }
    let customerId = job["bill_to_customer_id"]?.string ?? property?["customer_id"]?.string
    let customer = try customerId.flatMap { try store.getLive("customer", $0) }
    return JobView(id: job.id, job: job, property: property, customer: customer)
}

/// A section of the jobs list, in the Expo app's order: Today, Upcoming, Not scheduled, Recent.
public struct JobSection: Identifiable, Equatable, Sendable {
    public var id: String { title }
    public var title: String
    public var jobs: [JobView]
}

/// The list's sections, empty ones left out.
public func jobSections(_ views: [JobView], now: Date, timeZone: String) -> [JobSection] {
    let byId = Dictionary(views.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let jobs = views.compactMap { try? JSONValue.object($0.job).decode(Job.self) }
    guard let groups = try? groupJobs(jobs, now, timeZone) else { return [] }
    return [
        ("Today", groups.today), ("Upcoming", groups.upcoming), ("Not scheduled", groups.unscheduled),
        ("Recent", groups.recent),
    ]
    .map { JobSection(title: $0.0, jobs: $0.1.compactMap { byId[$0.id] }) }
    .filter { !$0.jobs.isEmpty }
}

/// The time on the right of a row: "In progress", or the schedule ("9:00 AM", "Tue Oct 14, 9:00 AM").
public func jobWhen(_ view: JobView, now: Date, timeZone: String) -> String {
    if view.status == .inProgress { return "In progress" }
    return (try? formatSchedule(view.job["scheduled_start"]?.string, now, timeZone)) ?? "Not scheduled"
}

// MARK: - Jobs (spec 5.2)

/// The status filter pills on Jobs, in the website's order.
public enum JobFilter: String, CaseIterable, Hashable, Sendable {
    case open, unscheduled, scheduled, inProgress, followUp, paid, done, canceled, all

    public var title: String {
        switch self {
        case .open: "Open"
        case .unscheduled: "Unscheduled"
        case .scheduled: "Scheduled"
        case .inProgress: "In Progress"
        case .followUp: "Waiting on Customer"
        case .paid: "Paid"
        case .done: "Done"
        case .canceled: "Canceled"
        case .all: "All"
        }
    }

    /// The statuses it shows; nil for every job.
    public var statuses: Set<JobStatus>? {
        switch self {
        case .open: [.unscheduled, .scheduled, .inProgress, .reportSent, .quoteSent, .quoteAccepted, .invoiced]
        case .unscheduled: [.unscheduled]
        case .scheduled: [.scheduled]
        case .inProgress: [.inProgress]
        case .followUp: [.reportSent, .quoteSent, .quoteAccepted, .invoiced]
        case .paid: [.paid]
        case .done: [.done]
        case .canceled: [.canceled]
        case .all: nil
        }
    }
}

/// "Leak detection", "Repair", "Maintenance", "Pool inspection" (JOB_TYPE_LABELS).
public func jobTypeLabel(_ type: JobType) -> String { type.label }

/// One row of the Jobs list, as the website's phone list draws it.
public struct JobListRow: Identifiable, Equatable, Sendable {
    public var id: String
    public var customer: String
    /// "#1040 · Leak detection" (or "New job · …").
    public var kind: String
    public var address: String?
    /// "Sun, Oct 11, 9:00 AM · Tony Tech", "Started · Tony Tech", "Not scheduled · Unassigned".
    public var when: String
    public var status: JobStatus
    /// For the row's Call and Text swipe actions.
    public var customerId: String? = nil
    public var phone: String? = nil
    /// For the row's swipes and menu (gestures spec section 12): the job number, the pool for
    /// Directions, whether its page offers Complete Job, and whether it can be moved (Move…).
    public var number: Int? = nil
    public var place: MapPlace? = nil
    public var completable = false
    public var movable = false
    /// The shop's sample job (owner, 2026-10-22): a Sample pill by the name.
    public var sample = false
}

/// The Jobs list for a filter, type, search and sort: deleted jobs left out, a limited tech's own jobs
/// only, in the sort's order (Scheduled Date: soonest first, jobs without a time last, then the
/// newest number). The search matches the customer's name or the job number ("1040", "#1040").
public func jobList(
    _ views: [JobView], filter: JobFilter, search: String, now: Date, timeZone: String, userId: String,
    seesAll: Bool, names: [String: String], sort: JobSort = .scheduled, type: JobTypeFilter = .all
) -> [JobListRow] {
    let q = search.trimmingCharacters(in: .whitespaces)
    let number = q.wholeMatch(of: /#?(\d+)/).flatMap { Int($0.1) }
    let picked = views.filter { v in
        guard v.job["deleted_at"]?.string == nil else { return false }
        if let statuses = filter.statuses, !statuses.contains(v.status) { return false }
        // The Type menu (owner, 2026-10-22; core `matchesJobType`).
        if !matchesJobType(v.type.rawValue, type) { return false }
        if !seesAll {
            let mine = [v.job["assigned_user_id"]?.string, v.job["second_tech_id"]?.string].contains(userId)
            if !mine { return false }
        }
        guard !q.isEmpty else { return true }
        if let number, v.number == number { return true }
        return v.customerName.localizedCaseInsensitiveContains(q)
    }
    // The sort the page chose (owner, 2026-10-20: "Add sorting on the jobs page just like
    // invoices"; core `sortJobs`): Scheduled Date by default, soonest first, no date last.
    let sorted = sortJobs(picked, sort: sort) { v in
        JobSortItem(
            number: v.number, scheduledStart: v.job["scheduled_start"]?.string,
            createdAt: v.job["created_at"]?.string, customer: v.customerName)
    }
    return sorted.map { v in
        let tech = v.job["assigned_user_id"]?.string.map { names[$0] ?? "Teammate" } ?? "Unassigned"
        let when =
            v.status == .inProgress && v.job["started_at"]?.string != nil
            ? "Started"
            : (try? formatSchedule(v.job["scheduled_start"]?.string, now, timeZone)) ?? "Not scheduled"
        let address = v.property.map { addressText($0) }.flatMap { $0.isEmpty ? nil : $0 }
        let sample = v.job["sample"]?.bool == true
        let number = v.number.map { "#\($0)" } ?? (sample ? "Sample job" : "New job")
        var row = JobListRow(
            id: v.id, customer: v.customerName,
            kind: "\(number) · \(jobTypeLabel(v.type))", address: address,
            when: "\(when) · \(tech)", status: v.status, customerId: v.customer?.id,
            phone: v.customer?["phone"]?.string.flatMap { $0.isEmpty ? nil : $0 }, number: v.number,
            place: address.map { a in
                MapPlace(
                    address: a,
                    location: v.property.flatMap { p in
                        guard let lat = p["latitude"]?.number, let lng = p["longitude"]?.number else { return nil }
                        return LatLng(lat: lat, lng: lng)
                    })
            },
            completable: jobHeaderPhoneActions(v.status, type: v.type).contains(.done) || checklistShowsCompleteJob(v),
            movable: canMoveJob(v.status) && jobReschedulable(type: v.type.rawValue, status: v.status.rawValue))
        row.sample = sample
        return row
    }
}

// MARK: - Reports (spec 5.3)

public enum ReportFilter: String, CaseIterable, Hashable, Sendable {
    case all, sent, draft

    public var title: String {
        switch self {
        case .all: "All"
        case .sent: "Sent"
        case .draft: "Drafts"
        }
    }

    public var empty: String {
        switch self {
        case .all: "No reports yet. A job’s report is drafted from its Wrap-Up."
        case .sent: "No reports sent yet."
        case .draft: "No drafts."
        }
    }
}

public struct ReportListRow: Identifiable, Equatable, Sendable {
    public var id: String
    public var jobId: String
    public var customer: String
    /// "Job #1040" or "New job".
    public var job: String
    /// "Homeowner report · version 2 · 1423 Palm Ct"
    public var detail: String
    /// "Sent Oct 15, 2026" or "Draft".
    public var value: String
    /// A sent version (Resend), and its customer link (Copy Customer Link).
    public var sent = false
    public var link: URL? = nil
}

/// Every job's current report, newest first (superseded versions left out).
public func reportList(
    _ store: LocalStore, companyId: String, filter: ReportFilter, timeZone: String, webURL: URL? = AppConfig.webURL
)
    -> [ReportListRow]
{
    let views = Dictionary(
        ((try? jobViews(store, companyId: companyId)) ?? []).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    // The insurance report is gone (owner, 2026-10-20: "Remove the insurance stuff").
    let templates = [
        "homeowner": "Homeowner report", "partner": "Pool company report", "maintenance": "Visit report",
        "maintenance_month": "Monthly service report",
    ]
    let reports = ((try? store.list("report", companyId: companyId)) ?? []).filter { r in
        let status = r["status"]?.string ?? "draft"
        guard r["deleted_at"]?.string == nil, status != "superseded" else { return false }
        return filter == .all || status == filter.rawValue
    }
    // Each report's customer link that still works (as the Wrap-Up's View version reads it).
    var tokens: [String: String] = [:]
    for link in (try? store.list("share_link", companyId: companyId)) ?? [] {
        guard let id = link["report_id"]?.string, let token = link["token"]?.string,
            link["revoked_at"]?.string == nil, link["deleted_at"]?.string == nil
        else { continue }
        tokens[id] = token
    }
    return
        reports
        .sorted { ($0["updated_at"]?.string ?? "") > ($1["updated_at"]?.string ?? "") }
        .map { r in
            let jobId = r["job_id"]?.string ?? ""
            let view = views[jobId]
            let version = r["version"]?.number.map { Int($0) } ?? 1
            let detail = [
                templates[r["template_key"]?.string ?? ""], version > 1 ? "version \(version)" : nil,
                view?.property?["address_line1"]?.string,
            ].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            let sent = r["status"]?.string == "sent" ? r["sent_at"]?.string : nil
            return ReportListRow(
                id: r.id, jobId: jobId, customer: view?.customerName ?? "Customer",
                job: view?.number.map { "Job #\($0)" } ?? "New job", detail: detail,
                value: sent.map { "Sent \(formatShortDate($0, timeZone: timeZone))" } ?? "Draft",
                sent: r["status"]?.string == "sent",
                link: tokens[r.id].flatMap { token in webURL.map { reportURL($0, token) } })
        }
}
