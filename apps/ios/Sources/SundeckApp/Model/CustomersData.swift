import Foundation
import SundeckCore
import SundeckSync

// More › Customers and a customer's page (spec 5.9; website app/(office)/customers and
// listCustomers in lib/data.ts), read from the phone's synced rows. The website asks the server
// per search; here the list filters as you type (spec 9).

/// How the list is sorted, as the website's Sort menu.
public enum CustomerSort: String, CaseIterable, Sendable {
    case name
    case nameDesc = "name_desc"
    case newest, oldest
    case lastVisit = "last_visit"
    case city

    public var label: String {
        switch self {
        case .name: "Name A–Z"
        case .nameDesc: "Name Z–A"
        case .newest: "Newest"
        case .oldest: "Oldest"
        case .lastVisit: "Last Visit"
        case .city: "City"
        }
    }
}

/// A customer's kind, as their page names it.
public func customerKindLabel(_ kind: String?) -> String? {
    switch kind {
    case "homeowner": "Homeowner"
    case "pool_company": "Pool company"
    case "builder": "Builder"
    case "insurer": "Insurer"
    case "property_manager": "Property manager"
    case "other": "Other"
    default: nil
    }
}

/// The kinds, in the website's order, for the edit sheet.
public let customerKinds = ["homeowner", "pool_company", "builder", "insurer", "property_manager", "other"]

/// One choice in the Show menu: all, plan, no_plan, or a customer kind.
public typealias CustomerShow = CustomerShowOption

/// The Show menu: All Customers, On a Plan and No Plan (pool shops), then the kinds; with
/// counts, "On a Plan (65)" (owner, 2026-10-22: "have a number showing the total next to each
/// thing").
public func customerShows(_ services: Services, counts: CustomerCounts? = nil) -> [CustomerShow] {
    customerShowOptions(offersPool: services != .leak, counts: counts)
}

/// The customers on a current plan (customer-counts.ts: not deleted, not ended before the
/// shop's today; paused counts).
func customersOnPlan(_ store: LocalStore, companyId: String, now: Date, timeZone: String) -> Set<String> {
    let plans = ((try? store.list("service_plan", companyId: companyId)) ?? []).compactMap { p -> PlanForCount? in
        guard let customer = p["customer_id"]?.string else { return nil }
        return PlanForCount(customerId: customer, endsOn: p["ends_on"]?.string, deletedAt: p["deleted_at"]?.string)
    }
    let today = (try? localDate(now, timeZone)) ?? ""
    return Set(customersOnPlan(plans, today: today))
}

/// Whether a customer matches the list's search (name, phone or email containing it).
private func customerMatches(_ term: String, name: String, email: String?, phone: String?) -> Bool {
    term.isEmpty || [name, email ?? "", phone ?? ""].contains { $0.lowercased().contains(term) }
}

/// Counts for the Show menu and the Dashboard's trackers, from the phone's rows: the whole
/// shop, or what the search finds.
public func customerCounts(
    _ store: LocalStore, companyId: String, search: String = "", now: Date = Date(), timeZone: String
) -> CustomerCounts {
    let term = search.trimmingCharacters(in: .whitespaces).lowercased()
    let customers = ((try? store.list("customer", companyId: companyId)) ?? [])
        .filter {
            customerMatches(
                term, name: $0["name"]?.string ?? "Customer", email: trimmed($0["email"]), phone: trimmed($0["phone"]))
        }
        .map {
            CustomerForCount(
                id: $0.id, kind: $0["kind"]?.string, createdAt: $0["created_at"]?.string,
                deletedAt: $0["deleted_at"]?.string)
        }
    return countCustomers(
        customers, onPlan: Array(customersOnPlan(store, companyId: companyId, now: now, timeZone: timeZone)),
        addedSince: customersAddedSince(now))
}

/// A row in the customers list.
public struct CustomerListItem: Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var companyName: String?
    public var kind: String?
    public var phone: String?
    public var email: String?
    /// Each pool's address.
    public var addresses: [String]
    public var city: String?
    public var hasPlan: Bool
    /// The last visit's time (finished, else scheduled), not in the future.
    public var lastVisit: String?
    public var createdAt: String?
    /// The first pool with an address, for the row's Directions.
    public var place: MapPlace? = nil

    /// The phone, else the email, else "No contact details" (phones show one line).
    public var contactLine: String { phone ?? email ?? "No contact details" }
}

private func trimmed(_ value: JSONValue?) -> String? {
    guard let text = value?.string?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
    return text
}

/// A pool row as the core rules read it (flags left out count as false).
func decodeProperty(_ row: Row) -> Property? {
    var row = row
    for flag in ["has_pool", "has_spa"] where row[flag]?.bool == nil { row[flag] = false }
    if row["address_line1"]?.string == nil { row["address_line1"] = "" }
    return try? JSONValue.object(row).decode(Property.self)
}

/// The customers, searched (name, phone or email), shown and sorted as chosen.
public func customerList(
    _ store: LocalStore, companyId: String, search: String = "", sort: CustomerSort = .name, show: String = "all",
    now: Date = Date(), timeZone: String = "UTC"
) -> [CustomerListItem] {
    let properties = (try? store.list("property", companyId: companyId)) ?? []
    let plans = customersOnPlan(store, companyId: companyId, now: now, timeZone: timeZone)
    let nowISO = isoTimestamp(milliseconds: now.timeIntervalSince1970 * 1000)
    var lastVisit: [String: String] = [:]
    for job in (try? store.list("job", companyId: companyId)) ?? [] {
        guard job["status"]?.string != "canceled", let customer = job["bill_to_customer_id"]?.string,
            let start = job["scheduled_start"]?.string, start <= nowISO
        else { continue }
        let at = job["completed_at"]?.string ?? start
        if at > (lastVisit[customer] ?? "") { lastVisit[customer] = at }
    }
    let term = search.trimmingCharacters(in: .whitespaces).lowercased()
    var rows = ((try? store.list("customer", companyId: companyId)) ?? []).map { c -> CustomerListItem in
        let pools = properties.filter { $0["customer_id"]?.string == c.id }
        return CustomerListItem(
            id: c.id, name: c["name"]?.string ?? "Customer", companyName: trimmed(c["company_name"]),
            kind: c["kind"]?.string, phone: trimmed(c["phone"]), email: trimmed(c["email"]),
            addresses: pools.compactMap(decodeProperty).map(formatAddress).filter { !$0.isEmpty },
            city: pools.compactMap { trimmed($0["city"]) }.first, hasPlan: plans.contains(c.id),
            lastVisit: lastVisit[c.id], createdAt: c["created_at"]?.string,
            place: pools.lazy.compactMap { p -> MapPlace? in
                guard let decoded = decodeProperty(p) else { return nil }
                let address = formatAddress(decoded)
                return address.isEmpty ? nil : MapPlace(address: address, location: propertyLocation(decoded))
            }.first)
    }
    if !term.isEmpty {
        rows = rows.filter { customerMatches(term, name: $0.name, email: $0.email, phone: $0.phone) }
    }
    switch show {
    case "all": break
    case "plan": rows = rows.filter(\.hasPlan)
    case "no_plan": rows = rows.filter { !$0.hasPlan }
    default: rows = rows.filter { $0.kind == show }
    }
    let byName = { (a: CustomerListItem, b: CustomerListItem) in
        a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
    }
    switch sort {
    case .name: rows.sort(by: byName)
    case .nameDesc: rows.sort { byName($1, $0) }
    case .newest:
        rows.sort {
            ($0.createdAt ?? "") != ($1.createdAt ?? "") ? ($0.createdAt ?? "") > ($1.createdAt ?? "") : byName($0, $1)
        }
    case .oldest:
        rows.sort {
            ($0.createdAt ?? "") != ($1.createdAt ?? "") ? ($0.createdAt ?? "") < ($1.createdAt ?? "") : byName($0, $1)
        }
    case .lastVisit:
        rows.sort {
            ($0.lastVisit ?? "") != ($1.lastVisit ?? "") ? ($0.lastVisit ?? "") > ($1.lastVisit ?? "") : byName($0, $1)
        }
    case .city:
        rows.sort { a, b in
            switch (a.city, b.city) {
            case (let x?, let y?):
                let order = x.localizedCaseInsensitiveCompare(y)
                return order == .orderedSame ? byName(a, b) : order == .orderedAscending
            case (.some, nil): return true
            case (nil, .some): return false
            case (nil, nil): return byName(a, b)
            }
        }
    }
    return rows
}

/// "Oct 17", with the year only when it isn't this year.
func shortDay(_ iso: String, now: Date, timeZone: String) -> String {
    guard let date = parseISODate(iso) ?? parseISODate("\(iso)T12:00:00Z") else { return "" }
    let clock = ShopClock(timeZone)
    return clock.format(date, clock.format(date, "yyyy") == clock.format(now, "yyyy") ? "MMM d" : "MMM d, yyyy")
}

/// The value at the right of a row, by sort: "Oct 17" / "No visits", or "Added Oct 17".
public func customerRowValue(_ c: CustomerListItem, sort: CustomerSort, now: Date = Date(), timeZone: String)
    -> String?
{
    switch sort {
    case .lastVisit: c.lastVisit.map { shortDay($0, now: now, timeZone: timeZone) } ?? "No visits"
    case .newest, .oldest: c.createdAt.map { "Added \(shortDay($0, now: now, timeZone: timeZone))" }
    default: nil
    }
}

/// What the list says when it's empty.
public func customersEmptyText(search: String, show: String) -> String {
    let term = search.trimmingCharacters(in: .whitespaces)
    if !term.isEmpty { return "No customers match “\(term)”." }
    if show != "all" { return "No customers here." }
    return "No customers yet. They’re added when a job is created on the phone."
}

// MARK: - A customer's page

/// A job on a customer's page: "Job #1040 · Leak detection", "{when} · {tech}", its status.
public struct CustomerJob: Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var typeLabel: String
    public var detail: String
    public var status: JobStatus
}

/// One of the customer's pools.
public struct CustomerPool: Identifiable, Equatable, Sendable {
    public var id: String
    public var row: Row
    public var address: String
    /// "Gunite / plaster · Pool and spa · 20,000 gallons".
    public var detail: String
    public var accessNotes: String?
    /// The Chemical row's line: "Last: FC 3 · pH 7.6 · Mon, Oct 19, 8:15 AM", or nil before any
    /// reading is submitted.
    public var chemicalLine: String?
    /// Leak detection and repair jobs (maintenance visits are summed up by their plan).
    public var jobs: [CustomerJob]
    /// Its maintenance plans (pool shops show them).
    public var plans: [CustomerPlan]
    public var place: MapPlace
}

public struct CustomerDetail: Equatable, Sendable {
    public var id: String
    public var row: Row
    public var name: String
    public var kind: String
    public var companyName: String?
    public var phone: String?
    public var email: String?
    public var otherEmails: [String]
    public var notes: String?
    public var remindersOn: Bool
    public var pools: [CustomerPool]

    /// "Homeowner · Blue Wave Pools".
    public var subtitle: String { [customerKindLabel(kind), companyName].compactMap { $0 }.joined(separator: " · ") }
}

/// The job type's name on a customer's page.
public func customerJobTypeLabel(_ type: JobType) -> String { type.label }

public func customerDetail(
    _ store: LocalStore, companyId: String, customerId: String, names: [String: String] = [:], now: Date = Date(),
    timeZone: String
) -> CustomerDetail? {
    guard let c = try? store.get("customer", customerId), c["deleted_at"]?.string == nil else { return nil }
    let jobs = ((try? store.list("job", companyId: companyId)) ?? [])
    let plans = (try? store.list("service_plan", companyId: companyId)) ?? []
    let cleanings = planCleanings(store, companyId: companyId, planIds: Set(plans.map(\.id)))
    let today = (try? localDate(now, timeZone)) ?? ""
    let pools = ((try? store.list("property", companyId: companyId)) ?? [])
        .filter { $0["customer_id"]?.string == customerId }
        .sorted { ($0["created_at"]?.string ?? $0.id) < ($1["created_at"]?.string ?? $1.id) }
        .map { p -> CustomerPool in
            let decoded = decodeProperty(p)
            let address = decoded.map(formatAddress) ?? ""
            let poolJobs =
                jobs
                .filter { $0["property_id"]?.string == p.id && $0["type"]?.string != "maintenance" }
                .sorted {
                    ($0["scheduled_start"]?.string ?? $0["started_at"]?.string ?? "")
                        > ($1["scheduled_start"]?.string ?? $1["started_at"]?.string ?? "")
                }
                .map { j -> CustomerJob in
                    let start = j["scheduled_start"]?.string ?? j["started_at"]?.string
                    let when = (try? formatSchedule(start, now, timeZone)) ?? "Not scheduled"
                    let tech = j["assigned_user_id"]?.string.flatMap { names[$0] }
                    return CustomerJob(
                        id: j.id,
                        title: j["number"]?.number.map { "Job #\(Int($0))" } ?? "New job",
                        typeLabel: customerJobTypeLabel(
                            j["type"]?.string.flatMap(JobType.init(rawValue:)) ?? .detection),
                        detail: [when, tech].compactMap { $0 }.joined(separator: " · "),
                        status: j["status"]?.string.flatMap(JobStatus.init(rawValue:)) ?? .unscheduled)
                }
            return CustomerPool(
                id: p.id, row: p, address: address,
                detail: [
                    decoded?.poolType?.label, p["has_spa"]?.bool == true ? "Pool and spa" : "Pool",
                    poolGallonsLabel(p["approx_gallons"]),
                ]
                .compactMap { $0 }.joined(separator: " · "),
                accessNotes: trimmed(p["access_notes"]),
                chemicalLine: latestChemicalLine(
                    store, companyId: companyId, propertyId: p.id, now: now, timeZone: timeZone),
                jobs: poolJobs,
                plans: customerPlans(
                    plans, propertyId: p.id, jobs: jobs, names: names, today: today, cleanings: cleanings),
                place: MapPlace(address: address, location: propertyLocation(decoded)))
        }
    return CustomerDetail(
        id: c.id, row: c, name: c["name"]?.string ?? "Customer", kind: c["kind"]?.string ?? "homeowner",
        companyName: trimmed(c["company_name"]), phone: trimmed(c["phone"]), email: trimmed(c["email"]),
        otherEmails: c["cc_emails"]?.array?.compactMap(\.string) ?? [], notes: trimmed(c["notes"]),
        remindersOn: c["marketing_opt_out"]?.bool != true, pools: pools)
}

/// Edits to a customer and their pools, through the sync layer (row + outbox).
@MainActor
public enum CustomerWrites {
    /// Contact details. Other emails are edited on the website (they aren't a phone-writable
    /// column).
    public static func saveContact(
        _ sync: SyncService, companyId: String, customerId: String, name: String, kind: String, companyName: String,
        phone: String, email: String, notes: String, noReminders: Bool
    ) throws {
        let clean = { (s: String) -> JSONValue in
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? .null : .string(t)
        }
        try sync.write(
            "customer", id: customerId, companyId: companyId,
            [
                "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)), "kind": .string(kind),
                "company_name": clean(companyName), "phone": clean(phone), "email": clean(email),
                "notes": clean(notes), "marketing_opt_out": .bool(noReminders),
            ])
    }

    public static func savePool(_ sync: SyncService, companyId: String, propertyId: String, _ values: Row) throws {
        try sync.write("property", id: propertyId, companyId: companyId, values)
    }
}

// MARK: - Gallons (owner, 2026-10-19)

/// "20,000 gallons" for a pool row's detail line (a plain number, no size remarks), or nil when
/// the pool's gallons aren't set.
public func poolGallonsLabel(_ value: JSONValue?) -> String? {
    guard let n = value?.number, n > 0 else { return nil }
    return "\(gallonsWithCommas(String(Int(n.rounded())))) gallons"
}

/// The Gallons field's starting text: "20,000", or blank.
public func poolGallonsField(_ value: JSONValue?) -> String {
    guard let n = value?.number, n > 0 else { return "" }
    return gallonsWithCommas(String(Int(n.rounded())))
}

/// What Pool Details saves for Gallons, as the website reads it: commas and spaces ignored,
/// rounded to a whole number, blank clears it (null). Throws the field's message otherwise.
public func parsePoolGallons(_ text: String) throws(PoolGallonsError) -> JSONValue {
    let t = text.filter { $0 != "," && !$0.isWhitespace }
    if t.isEmpty { return .null }
    guard let n = Double(t), n.isFinite else { throw PoolGallonsError() }
    let rounded = n.rounded(.toNearestOrAwayFromZero)
    guard rounded > 0, rounded < 10_000_000 else { throw PoolGallonsError() }
    return .number(rounded)
}

public struct PoolGallonsError: Error, Equatable, Sendable {
    public let message = "Enter the gallons as a number, like 20,000."
}

/// Why a customer's contact form can't be saved, or nil.
public func validateCustomerContact(name: String, phone: String, email: String) -> String? {
    if name.trimmingCharacters(in: .whitespaces).isEmpty { return "Enter a name." }
    let p = phone.trimmingCharacters(in: .whitespaces)
    if !p.isEmpty && toE164(p) == nil { return "Enter a 10-digit phone number." }
    let e = email.trimmingCharacters(in: .whitespaces)
    if !e.isEmpty && (!e.contains("@") || !e.contains(".")) { return "Enter a valid email." }
    return nil
}
