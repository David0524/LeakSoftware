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
