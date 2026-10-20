import Foundation
import SundeckCore
import SundeckSync

// Search on Jobs (owner, 2026-10-20: "Ok add that search in"; docs/plans/search-and-activity.md,
// section 1): the shared rule (SundeckCore `searchShop`) over the phone's own database, so it
// works offline. The synced rows already follow the shop's visibility rules; a tech limited to
// their own jobs finds only those jobs and their quotes and invoices, as Jobs shows them.

/// The records on this phone that search reads: customers, pools, and the jobs (with their
/// quotes and invoices) this person sees on Jobs.
public func searchRecords(_ store: LocalStore, companyId: String, userId: String, seesAll: Bool) -> SearchRecords {
    func text(_ value: JSONValue?) -> String? { value?.string }
    func int(_ value: JSONValue?) -> Int? { value?.number.map { Int($0) } }
    let customerRows = (try? store.list("customer", companyId: companyId)) ?? []
    let names = Dictionary(
        customerRows.map { ($0.id, text($0["name"]) ?? "Customer") }, uniquingKeysWith: { a, _ in a })
    let propertyRows = (try? store.list("property", companyId: companyId)) ?? []
    let propertyCustomer = Dictionary(
        propertyRows.compactMap { p in text(p["customer_id"]).map { (p.id, $0) } }, uniquingKeysWith: { a, _ in a })

    let customers = customerRows.map { c in
        SearchCustomer(
            id: c.id, name: text(c["name"]) ?? "Customer", companyName: text(c["company_name"]),
            phone: text(c["phone"]), email: text(c["email"]), deletedAt: text(c["deleted_at"]))
    }
    let pools = propertyRows.map { p in
        SearchPool(
            id: p.id, customerId: text(p["customer_id"]), addressLine1: text(p["address_line1"]) ?? "",
            city: text(p["city"]), customerName: text(p["customer_id"]).flatMap { names[$0] },
            deletedAt: text(p["deleted_at"]))
    }

    var jobCustomer: [String: String] = [:]
    var jobs: [SearchJob] = []
    for j in (try? store.list("job", companyId: companyId)) ?? [] {
        if !seesAll, ![text(j["assigned_user_id"]), text(j["second_tech_id"])].contains(userId) { continue }
        let customerId = text(j["bill_to_customer_id"]) ?? text(j["property_id"]).flatMap { propertyCustomer[$0] }
        let customer = customerId.flatMap { names[$0] }
        if let customer { jobCustomer[j.id] = customer }
        jobs.append(
            SearchJob(
                id: j.id, number: int(j["number"]), type: text(j["type"]) ?? "detection", status: text(j["status"]),
                scheduledStart: text(j["scheduled_start"]), createdAt: text(j["created_at"]), customerName: customer,
                deletedAt: text(j["deleted_at"])))
    }
    let shown = Set(jobs.filter { $0.deletedAt == nil }.map(\.id))

    let quotes = ((try? store.list("quote", companyId: companyId)) ?? []).compactMap { q -> SearchQuote? in
        guard let jobId = text(q["job_id"]), shown.contains(jobId) else { return nil }
        return SearchQuote(
            id: q.id, jobId: jobId, number: int(q["number"]), status: text(q["status"]) ?? "draft",
            totalCents: int(q["total_cents"]) ?? 0, createdAt: text(q["created_at"]), customerName: jobCustomer[jobId],
            deletedAt: text(q["deleted_at"]))
    }
    let invoices = ((try? store.list("invoice", companyId: companyId)) ?? []).compactMap { i -> SearchInvoice? in
        guard let jobId = text(i["job_id"]), shown.contains(jobId) else { return nil }
        return SearchInvoice(
            id: i.id, jobId: jobId, number: int(i["number"]), status: text(i["status"]) ?? "draft",
            totalCents: int(i["total_cents"]) ?? 0, amountPaidCents: int(i["amount_paid_cents"]),
            createdAt: text(i["created_at"]), customerName: jobCustomer[jobId], deletedAt: text(i["deleted_at"]))
    }
    return SearchRecords(customers: customers, pools: pools, jobs: jobs, quotes: quotes, invoices: invoices)
}

/// Where a result or Recent entry goes in the app: a customer, or the job (its quotes and
/// invoice are in Wrap-Up).
public enum SearchDestination: Hashable, Sendable {
    case customer(String)
    case job(String)
    case jobSection(String, JobPageSection)

    public init(_ open: SearchOpen) {
        switch (open.screen, open.section) {
        case (.customer, _): self = .customer(open.id)
        case (.job, nil): self = .job(open.id)
        case (.job, .some): self = .jobSection(open.id, .wrapUp)
        }
    }
}

// MARK: - Recent

extension KVKey {
    /// Search's Recent: the last records opened on this phone (cleared on sign-out).
    public static let searchRecent = "search:recent"
}

/// Recent (spec 1, "Before typing"): the last 8 customers, jobs, quotes, and invoices opened on
/// this phone, newest first. Port of apps/web/src/lib/recent.ts and remember-recent.tsx.
public struct RecentSearches: Sendable {
    let kv: KeyValue

    public init(kv: KeyValue) { self.kv = kv }

    public func load() -> [RecentItem] {
        parseRecent(kv.getJSON(KVKey.searchRecent, as: JSONValue.self))
    }

    /// Puts the record first (a search result or Recent entry was tapped).
    @discardableResult
    public func remember(_ item: RecentItem) -> [RecentItem] {
        let next = rememberRecent(load(), item)
        kv.setJSON(KVKey.searchRecent, next)
        return next
    }

    /// A customer's or job's page was shown. A job opened from one of its quotes or invoices is
    /// already first as that quote or invoice, so it isn't added twice.
    public func opened(_ item: RecentItem) {
        if item.kind == .job, let first = load().first, first.open.screen == .job, first.open.id == item.id {
            return
        }
        remember(item)
    }

    public func clear() { kv.remove(KVKey.searchRecent) }
}

/// A job page as a Recent entry: "Job #1038 · Leak detection", the customer below.
public func recentItem(job: JobView) -> RecentItem {
    let type = job.job["type"]?.string.flatMap(JobType.init(rawValue:))?.label ?? "Job"
    return RecentItem(
        kind: .job, id: job.id, title: "\(job.number.map { "Job #\($0)" } ?? "New job") · \(type)",
        detail: job.customer?["name"]?.string, open: SearchOpen(screen: .job, id: job.id))
}

/// A customer's page as a Recent entry: the name, the phone or email below.
public func recentItem(customerId: String, name: String, phone: String?, email: String?) -> RecentItem {
    func nonBlank(_ s: String?) -> String? {
        let t = s?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return t.isEmpty ? nil : t
    }
    return RecentItem(
        kind: .customer, id: customerId, title: name, detail: nonBlank(phone) ?? nonBlank(email),
        open: SearchOpen(screen: .customer, id: customerId))
}
