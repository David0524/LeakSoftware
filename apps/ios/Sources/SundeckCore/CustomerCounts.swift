import Foundation

// Customer counts (customer-counts.ts; owner, 2026-10-22): the number beside each choice of the
// Customers list's Show menu ("On a Plan (65)"), and the Dashboard's Customers and On a plan
// trackers, with one definition so the Dashboard's numbers match the filter they open.

/// Customer kinds, plural for the Show menu, in menu order.
public let customerKindPlurals: [(value: String, label: String)] = [
    ("homeowner", "Homeowners"), ("pool_company", "Pool Companies"), ("builder", "Builders"),
    ("insurer", "Insurers"), ("property_manager", "Property Managers"), ("other", "Other"),
]

/// The Dashboard's "+4 in 30 days" looks back this many days.
public let customersAddedDays = 30

/// The Dashboard trackers' labels (sentence case, as the other stat cards).
public enum CustomerTrackerLabels {
    public static let customers = "Customers"
    public static let onPlan = "On a plan"
}

/// A plan as the counts read it.
public struct PlanForCount: Codable, Equatable, Sendable {
    public var customerId: String
    public var endsOn: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case customerId = "customer_id"
        case endsOn = "ends_on"
        case deletedAt = "deleted_at"
    }

    public init(customerId: String, endsOn: String? = nil, deletedAt: String? = nil) {
        self.customerId = customerId
        self.endsOn = endsOn
        self.deletedAt = deletedAt
    }
}

/// Whether a maintenance plan puts its customer "On a Plan" today: not deleted, and not ended
/// before `today` (YYYY-MM-DD, the shop's day). A paused plan still counts.
public func planIsCurrent(_ plan: PlanForCount, today: String) -> Bool {
    plan.deletedAt == nil && (plan.endsOn.map { $0.isEmpty || $0 >= today } ?? true)
}

/// The customers with a current plan, sorted, each once.
public func customersOnPlan(_ plans: [PlanForCount], today: String) -> [String] {
    Array(Set(plans.filter { planIsCurrent($0, today: today) }.map(\.customerId))).sorted()
}

/// A customer as the counts read it.
public struct CustomerForCount: Codable, Equatable, Sendable {
    public var id: String
    public var kind: String?
    public var createdAt: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, kind
        case createdAt = "created_at"
        case deletedAt = "deleted_at"
    }

    public init(id: String, kind: String? = nil, createdAt: String? = nil, deletedAt: String? = nil) {
        self.id = id
        self.kind = kind
        self.createdAt = createdAt
        self.deletedAt = deletedAt
    }
}

/// Counts for the Show menu and the Dashboard (`CustomerCounts`).
public struct CustomerCounts: Codable, Equatable, Sendable {
    public var all: Int
    public var plan: Int
    public var noPlan: Int
    /// Each kind's count (kinds with none are left out).
    public var kinds: [String: Int]
    /// Added since the cutoff (the Dashboard's "+4 in 30 days").
    public var added: Int

    enum CodingKeys: String, CodingKey {
        case all, plan, kinds, added
        case noPlan = "no_plan"
    }

    public init(all: Int = 0, plan: Int = 0, noPlan: Int = 0, kinds: [String: Int] = [:], added: Int = 0) {
        self.all = all
        self.plan = plan
        self.noPlan = noPlan
        self.kinds = kinds
        self.added = added
    }
}

/// The cutoff for "added", `customersAddedDays` before `now`, as an ISO time in UTC
/// ("2026-09-22T17:00:00.000Z").
public func customersAddedSince(_ now: Date) -> String {
    (try? ECMA.isoString(ECMA.milliseconds(now) - Double(customersAddedDays) * 86_400_000)) ?? ""
}

/// "2026-10-12 10:00:00+00" or "2026-10-12T10:00:00.123Z" to "2026-10-12T10:00:00" (UTC).
private func utcSeconds(_ iso: String) -> String {
    String(iso.replacingOccurrences(of: " ", with: "T").prefix(19))
}

/// Counts from the customers (already searched, when the list is) and the customers on a plan
/// (`customersOnPlan`). Deleted customers don't count; times are compared in UTC to the second.
public func countCustomers(_ customers: [CustomerForCount], onPlan: [String], addedSince: String) -> CustomerCounts {
    let planned = Set(onPlan)
    let since = utcSeconds(addedSince)
    var counts = CustomerCounts()
    for c in customers where c.deletedAt == nil {
        counts.all += 1
        if planned.contains(c.id) { counts.plan += 1 } else { counts.noPlan += 1 }
        counts.kinds[c.kind ?? "homeowner", default: 0] += 1
        if let created = c.createdAt, !created.isEmpty, utcSeconds(created) >= since { counts.added += 1 }
    }
    return counts
}

/// A Show choice's count: all, plan, no_plan, or a kind (0 when it has none).
public func customerShowCount(_ counts: CustomerCounts, _ show: String) -> Int {
    switch show {
    case "all": counts.all
    case "plan": counts.plan
    case "no_plan": counts.noPlan
    default: counts.kinds[show] ?? 0
    }
}

/// "1,204", as the menus print counts.
public func formatCount(_ n: Int) -> String {
    let digits = String(abs(n))
    var out = ""
    for (i, ch) in digits.enumerated() {
        if i > 0 && (digits.count - i) % 3 == 0 { out.append(",") }
        out.append(ch)
    }
    return n < 0 ? "-\(out)" : out
}

/// One choice in the Show menu: all, plan, no_plan, or a customer kind.
public struct CustomerShowOption: Codable, Hashable, Sendable {
    public var value: String
    public var label: String

    public init(value: String, label: String) {
        self.value = value
        self.label = label
    }
}

/// The Show menu: All Customers, On a Plan and No Plan (shops that offer pool service), then the
/// kinds. With counts, each label ends with its count: "On a Plan (65)", "Builders (0)".
public func customerShowOptions(offersPool: Bool, counts: CustomerCounts? = nil) -> [CustomerShowOption] {
    var options = [CustomerShowOption(value: "all", label: "All Customers")]
    if offersPool {
        options += [
            CustomerShowOption(value: "plan", label: "On a Plan"),
            CustomerShowOption(value: "no_plan", label: "No Plan"),
        ]
    }
    options += customerKindPlurals.map { CustomerShowOption(value: $0.value, label: $0.label) }
    guard let counts else { return options }
    return options.map {
        CustomerShowOption(value: $0.value, label: "\($0.label) (\(formatCount(customerShowCount(counts, $0.value))))")
    }
}

/// The Customers tracker's note: "+4 in 30 days", or "None new in 30 days".
public func customersAddedNote(_ added: Int) -> String {
    added > 0 ? "+\(formatCount(added)) in \(customersAddedDays) days" : "None new in \(customersAddedDays) days"
}

/// The On a plan tracker's note: "52% of customers", or "No customers yet".
public func onPlanShareNote(_ plan: Int, _ all: Int) -> String {
    all > 0 ? "\(Int(ECMA.round(Double(plan) / Double(all) * 100)))% of customers" : "No customers yet"
}
