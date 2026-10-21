import Foundation

// Search across the shop (owner, 2026-10-20: "Ok add that search in"; docs/plans/
// search-and-activity.md, section 1). Port of packages/core/src/search.ts: the phones run it
// over their own database. Normalize the query, match, rank, group, cap.

// MARK: - Words

public enum SearchText {
    public static let placeholder = "Search customers, jobs, addresses"
    /// Characters typed before anything is searched.
    public static let minChars = 2
    /// Results update this long after the last keystroke.
    public static let debounceMs = 200
    /// Rows per group before See All.
    public static let groupLimit = 5
    /// The website couldn't reach the server.
    public static let offline = "Couldn’t search. Check your connection and try again."
    /// Records kept under Recent, per device.
    public static let recentLimit = 8

    public static let recent = "Recent"
    public static let clear = "Clear"
    public static let seeAll = "See All"
    public static let allResults = "All Results"
    public static let cancel = "Cancel"
    public static let search = "Search"
    public static let noRecent = "Customers, jobs, quotes, and invoices you open show here."
}

/// "No results for “ochoa”." with a hint in secondary text.
public struct NoResultsText: Codable, Equatable, Sendable {
    public var title: String
    public var hint: String
}

public func noResultsText(_ query: String) -> NoResultsText {
    NoResultsText(
        title: "No results for “\(ECMA.trim(query))”.", hint: "Check the spelling, or try a phone number or address.")
}

// MARK: - Normalizing

/// Lower case, accents removed: "José Núñez" -> "jose nunez".
public func foldText(_ value: String?) -> String {
    let decomposed = (value ?? "").decomposedStringWithCanonicalMapping.unicodeScalars.filter {
        !(0x300...0x36F).contains($0.value)
    }
    return ECMA.lowercase(String(String.UnicodeScalarView(decomposed)))
}

private func isWordScalar(_ s: Unicode.Scalar) -> Bool {
    ("a"..."z").contains(s) || ("0"..."9").contains(s)
}

private func isDigit(_ s: Unicode.Scalar) -> Bool { ("0"..."9").contains(s) }

/// The words of a text: letters and digits, folded ("O'Neil-Smith" -> o, neil, smith).
public func searchWords(_ value: String?) -> [String] {
    var words: [String] = []
    var current = String.UnicodeScalarView()
    for s in foldText(value).unicodeScalars {
        if isWordScalar(s) {
            current.append(s)
        } else if !current.isEmpty {
            words.append(String(current))
            current = String.UnicodeScalarView()
        }
    }
    if !current.isEmpty { words.append(String(current)) }
    return words
}

public enum SearchNumberKind: String, Codable, Sendable {
    case job, quote, invoice
}

private let kindWords: [String: SearchNumberKind] = [
    "job": .job, "jobs": .job, "quote": .quote, "quotes": .quote, "invoice": .invoice, "invoices": .invoice,
    "inv": .invoice,
]

public struct SearchQuery: Codable, Equatable, Sendable {
    /// What was typed, trimmed.
    public var text: String
    /// Enough typed to search (`SearchText.minChars`).
    public var ready: Bool
    /// Folded words, each to match the start of a word ("job" and the like taken out).
    public var words: [String]
    /// The query's digits when it reads as a phone number (4 or more), else nil.
    public var digits: String?
    /// "Job 1038", "quote ochoa": only that kind of record.
    public var only: SearchNumberKind?

    enum CodingKeys: String, CodingKey { case text, ready, words, digits, only }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(text, forKey: .text)
        try c.encode(ready, forKey: .ready)
        try c.encode(words, forKey: .words)
        try c.encode(digits, forKey: .digits)
        try c.encode(only, forKey: .only)
    }
}

/// The query as the rule reads it. "#1038" and "Job 1038" are the number 1038 (the second only
/// among jobs); "(602) 555-0142" is also the digits 6025550142.
public func normalizeSearch(_ query: String) -> SearchQuery {
    let text = ECMA.trim(query)
    let compact = String(String.UnicodeScalarView(text.unicodeScalars.filter { !ECMA.isWhitespace($0) }))
    let ready = compact.utf16.count >= SearchText.minChars
    var words = searchWords(text)
    var only: SearchNumberKind?
    if words.count > 1, let kind = kindWords[words[0]] {
        only = kind
        words.removeFirst()
    }
    let digitsOnly = String(String.UnicodeScalarView(text.unicodeScalars.filter(isDigit)))
    let phoneLike =
        !text.isEmpty
        && text.unicodeScalars.allSatisfy { s in
            isDigit(s) || ECMA.isWhitespace(s) || "().+-#".unicodeScalars.contains(s)
        }
    let digits = phoneLike && digitsOnly.count >= 4 ? digitsOnly : nil
    return SearchQuery(text: text, ready: ready, words: words, digits: digits, only: only)
}

// MARK: - Records

public struct SearchCustomer: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var companyName: String?
    public var phone: String?
    public var email: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, phone, email
        case companyName = "company_name"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, name: String, companyName: String? = nil, phone: String? = nil, email: String? = nil,
        deletedAt: String? = nil
    ) {
        self.id = id
        self.name = name
        self.companyName = companyName
        self.phone = phone
        self.email = email
        self.deletedAt = deletedAt
    }
}

public struct SearchPool: Codable, Equatable, Sendable {
    public var id: String
    public var customerId: String?
    public var addressLine1: String
    public var city: String?
    public var customerName: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, city
        case customerId = "customer_id"
        case addressLine1 = "address_line1"
        case customerName = "customer_name"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, customerId: String? = nil, addressLine1: String, city: String? = nil,
        customerName: String? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.customerId = customerId
        self.addressLine1 = addressLine1
        self.city = city
        self.customerName = customerName
        self.deletedAt = deletedAt
    }
}

public struct SearchJob: Codable, Equatable, Sendable {
    public var id: String
    public var number: Int?
    public var type: String
    public var status: String?
    public var scheduledStart: String?
    public var createdAt: String?
    public var customerName: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, number, type, status
        case scheduledStart = "scheduled_start"
        case createdAt = "created_at"
        case customerName = "customer_name"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, number: Int?, type: String, status: String? = nil, scheduledStart: String? = nil,
        createdAt: String? = nil, customerName: String? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.number = number
        self.type = type
        self.status = status
        self.scheduledStart = scheduledStart
        self.createdAt = createdAt
        self.customerName = customerName
        self.deletedAt = deletedAt
    }
}

public struct SearchQuote: Codable, Equatable, Sendable {
    public var id: String
    public var jobId: String
    public var number: Int?
    public var status: String
    public var totalCents: Cents
    public var createdAt: String?
    public var customerName: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, number, status
        case jobId = "job_id"
        case totalCents = "total_cents"
        case createdAt = "created_at"
        case customerName = "customer_name"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, jobId: String, number: Int?, status: String, totalCents: Cents, createdAt: String? = nil,
        customerName: String? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.jobId = jobId
        self.number = number
        self.status = status
        self.totalCents = totalCents
        self.createdAt = createdAt
        self.customerName = customerName
        self.deletedAt = deletedAt
    }
}

public struct SearchInvoice: Codable, Equatable, Sendable {
    public var id: String
    public var jobId: String
    public var number: Int?
    public var status: String
    public var totalCents: Cents
    public var amountPaidCents: Cents?
    public var createdAt: String?
    public var customerName: String?
    public var deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, number, status
        case jobId = "job_id"
        case totalCents = "total_cents"
        case amountPaidCents = "amount_paid_cents"
        case createdAt = "created_at"
        case customerName = "customer_name"
        case deletedAt = "deleted_at"
    }

    public init(
        id: String, jobId: String, number: Int?, status: String, totalCents: Cents, amountPaidCents: Cents? = nil,
        createdAt: String? = nil, customerName: String? = nil, deletedAt: String? = nil
    ) {
        self.id = id
        self.jobId = jobId
        self.number = number
        self.status = status
        self.totalCents = totalCents
        self.amountPaidCents = amountPaidCents
        self.createdAt = createdAt
        self.customerName = customerName
        self.deletedAt = deletedAt
    }
}

/// What to search: the phones read these from their tables.
public struct SearchRecords: Codable, Equatable, Sendable {
    public var customers: [SearchCustomer]?
    public var pools: [SearchPool]?
    public var jobs: [SearchJob]?
    public var quotes: [SearchQuote]?
    public var invoices: [SearchInvoice]?

    public init(
        customers: [SearchCustomer]? = nil, pools: [SearchPool]? = nil, jobs: [SearchJob]? = nil,
        quotes: [SearchQuote]? = nil, invoices: [SearchInvoice]? = nil
    ) {
        self.customers = customers
        self.pools = pools
        self.jobs = jobs
        self.quotes = quotes
        self.invoices = invoices
    }
}

// MARK: - Results

public enum SearchKind: String, Codable, Sendable {
    case customer, pool, job, quote, invoice
}

public enum SearchGroupKey: String, Codable, CaseIterable, Sendable {
    case customers, pools, jobs, quotes, invoices

    /// "Customers", "Pools", "Jobs", "Quotes", "Invoices" (`SEARCH_GROUP_TITLES`).
    public var title: String {
        switch self {
        case .customers: "Customers"
        case .pools: "Pools"
        case .jobs: "Jobs"
        case .quotes: "Quotes"
        case .invoices: "Invoices"
        }
    }
}

/// The screen a result opens: a customer, or a job (at its quotes or its invoice).
public struct SearchOpen: Codable, Equatable, Hashable, Sendable {
    public enum Screen: String, Codable, Sendable { case customer, job }
    public enum Section: String, Codable, Sendable { case quotes, invoice }

    public var screen: Screen
    public var id: String
    public var section: Section?

    public init(screen: Screen, id: String, section: Section? = nil) {
        self.screen = screen
        self.id = id
        self.section = section
    }
}

public struct SearchHit: Codable, Equatable, Identifiable, Sendable {
    public var kind: SearchKind
    public var id: String
    /// "Sam Ochoa", "Job #1038 · Leak detection", "Quote #1012 · $975.00".
    public var title: String
    /// The second line: a phone or email, or the customer.
    public var detail: String?
    /// Trailing: a job's date, a quote's or invoice's status.
    public var meta: String?
    public var open: SearchOpen?

    public init(
        kind: SearchKind, id: String, title: String, detail: String?, meta: String?, open: SearchOpen?
    ) {
        self.kind = kind
        self.id = id
        self.title = title
        self.detail = detail
        self.meta = meta
        self.open = open
    }
}

public struct SearchGroup: Codable, Equatable, Identifiable, Sendable {
    public var key: SearchGroupKey
    public var title: String
    /// Every match in the group (See All shows them).
    public var total: Int
    public var hits: [SearchHit]
    /// More matches than shown: offer See All.
    public var more: Bool

    public var id: SearchGroupKey { key }
}

public struct SearchResults: Codable, Equatable, Sendable {
    public var query: SearchQuery
    public var groups: [SearchGroup]
    /// Searched and found nothing (show `noResultsText`).
    public var empty: Bool
}

/// Every query word starts one of the record's words (in any order).
private func wordsMatch(_ query: [String], _ record: [String]) -> Bool {
    !query.isEmpty && query.allSatisfy { q in record.contains { $0.hasPrefix(q) } }
}

private func time(_ iso: String?) -> Double {
    guard let iso, !iso.isEmpty else { return 0 }
    return ECMA.parseDate(iso) ?? 0
}

private let shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/// "Oct 14", or "Oct 14, 2025" in another year, in the shop's time zone.
public func shortDate(_ iso: String, now: Date, timeZone: String) throws -> String {
    let zone = try ECMA.zone(timeZone)
    guard let ms = ECMA.parseDate(iso) else { throw DateRuleError.invalidTimeValue }
    let wall = ECMA.wallClock(ms, zone)
    let today = ECMA.wallClock(ECMA.milliseconds(now), zone)
    let day = "\(shortMonthNames[wall.month - 1]) \(wall.day)"
    return wall.year == today.year ? day : "\(day), \(wall.year)"
}

private func numbered(_ label: String, _ n: Int?) -> String {
    n.map { "\(label) #\($0)" } ?? "New \(label.lowercased())"
}

/// JavaScript's `<` on strings: UTF-16 code units.
func jsCompare(_ a: String, _ b: String) -> Int {
    if a == b { return 0 }
    return a.utf16.lexicographicallyPrecedes(b.utf16) ? -1 : 1
}

private struct Ranked {
    var hit: SearchHit
    var tier: Int
    /// Larger first.
    var recency: Double
    /// Then alphabetical.
    var sort: String
}

private func nonBlank(_ s: String?) -> String? {
    guard let s else { return nil }
    let t = ECMA.trim(s)
    return t.isEmpty ? nil : t
}

/// Searches the records: each group's matches ranked (an exact number first, then name and
/// word-start matches, then the most recent: jobs by scheduled date, quotes and invoices by
/// created date), at most `limit` each, in the order Customers, Pools, Jobs, Quotes, Invoices.
/// Deleted records never show. Nothing is searched until `SearchText.minChars` are typed.
/// `group` is See All (pass `limit: .max` with it).
public func searchShop(
    _ input: String, _ records: SearchRecords, now: Date, timeZone: String, limit: Int = SearchText.groupLimit,
    group: SearchGroupKey? = nil
) throws -> SearchResults {
    let query = normalizeSearch(input)
    if !query.ready || (query.words.isEmpty && query.digits == nil) {
        return SearchResults(query: query, groups: [], empty: query.ready)
    }
    let words = query.words
    let digits = query.digits
    let exactNumber =
        words.count == 1 && !words[0].isEmpty && words[0].unicodeScalars.allSatisfy(isDigit) ? words[0] : nil
    func kept(_ deletedAt: String?) -> Bool { deletedAt?.isEmpty ?? true }
    let numberGroup: [SearchNumberKind: SearchGroupKey] = [.job: .jobs, .quote: .quotes, .invoice: .invoices]
    func allowed(_ key: SearchGroupKey) -> Bool {
        (group == nil || group == key) && (query.only == nil || numberGroup[query.only!] == key)
    }
    var ranked: [SearchGroupKey: [Ranked]] = [:]

    if allowed(.customers) {
        for c in records.customers ?? [] where kept(c.deletedAt) {
            let nameWords = searchWords("\(c.name) \(c.companyName ?? "")")
            let byName = wordsMatch(words, nameWords)
            let byEmail = !byName && wordsMatch(words, nameWords + searchWords(c.email))
            let phoneDigits = String(String.UnicodeScalarView((c.phone ?? "").unicodeScalars.filter(isDigit)))
            let byPhone = digits.map { !phoneDigits.isEmpty && phoneDigits.contains($0) } ?? false
            if !byName && !byEmail && !byPhone { continue }
            ranked[.customers, default: []].append(
                Ranked(
                    hit: SearchHit(
                        kind: .customer, id: c.id, title: c.name, detail: nonBlank(c.phone) ?? nonBlank(c.email),
                        meta: nil, open: SearchOpen(screen: .customer, id: c.id)),
                    tier: byName || byPhone ? 1 : 2, recency: 0, sort: foldText(c.name)))
        }
    }

    if allowed(.pools) {
        for p in records.pools ?? [] where kept(p.deletedAt) {
            if !wordsMatch(words, searchWords("\(p.addressLine1) \(p.city ?? "")")) { continue }
            let title = [p.addressLine1, p.city].compactMap { $0 }.filter { !ECMA.trim($0).isEmpty }
                .joined(separator: ", ")
            ranked[.pools, default: []].append(
                Ranked(
                    hit: SearchHit(
                        kind: .pool, id: p.id, title: title, detail: nonBlank(p.customerName), meta: nil,
                        open: p.customerId.flatMap { $0.isEmpty ? nil : SearchOpen(screen: .customer, id: $0) }),
                    tier: 1, recency: 0, sort: foldText(p.addressLine1)))
        }
    }

    func numberedRank(_ n: Int?, _ customer: String?) -> Int? {
        let own = searchWords(customer) + (n.map { [String($0)] } ?? [])
        if !wordsMatch(words, own) { return nil }
        if let exactNumber, let n, String(n) == exactNumber { return 0 }
        return 1
    }

    if allowed(.jobs) {
        for j in records.jobs ?? [] where kept(j.deletedAt) {
            guard let tier = numberedRank(j.number, j.customerName) else { continue }
            let type = JobType(rawValue: j.type)?.label ?? "Job"
            let start = j.scheduledStart.flatMap { $0.isEmpty ? nil : $0 }
            let recency = time(j.scheduledStart)
            ranked[.jobs, default: []].append(
                Ranked(
                    hit: SearchHit(
                        kind: .job, id: j.id, title: "\(numbered("Job", j.number)) · \(type)",
                        detail: nonBlank(j.customerName),
                        meta: try start.map { try shortDate($0, now: now, timeZone: timeZone) },
                        open: SearchOpen(screen: .job, id: j.id)),
                    tier: tier, recency: recency != 0 ? recency : time(j.createdAt), sort: ""))
        }
    }

    if allowed(.quotes) {
        for q in records.quotes ?? [] where kept(q.deletedAt) {
            guard let tier = numberedRank(q.number, q.customerName) else { continue }
            ranked[.quotes, default: []].append(
                Ranked(
                    hit: SearchHit(
                        kind: .quote, id: q.id, title: "\(numbered("Quote", q.number)) · \(formatCents(q.totalCents))",
                        detail: nonBlank(q.customerName), meta: QuoteStatus(rawValue: q.status)?.label,
                        open: SearchOpen(screen: .job, id: q.jobId, section: .quotes)),
                    tier: tier, recency: time(q.createdAt), sort: ""))
        }
    }

    if allowed(.invoices) {
        for i in records.invoices ?? [] where kept(i.deletedAt) {
            guard let tier = numberedRank(i.number, i.customerName) else { continue }
            let due = i.totalCents - (i.amountPaidCents ?? 0)
            let open = (i.status == "sent" || i.status == "partially_paid") && due > 0
            ranked[.invoices, default: []].append(
                Ranked(
                    hit: SearchHit(
                        kind: .invoice, id: i.id,
                        title:
                            "\(numbered("Invoice", i.number)) · \(formatCents(open ? due : i.totalCents))\(open ? " due" : "")",
                        detail: nonBlank(i.customerName), meta: InvoiceStatus(rawValue: i.status)?.label,
                        open: SearchOpen(screen: .job, id: i.jobId, section: .invoice)),
                    tier: tier, recency: time(i.createdAt), sort: ""))
        }
    }

    var groups: [SearchGroup] = []
    for key in SearchGroupKey.allCases {
        let rows = ECMA.sort(ranked[key] ?? []) { a, b in
            if a.tier != b.tier { return Double(a.tier - b.tier) }
            if a.recency != b.recency { return b.recency - a.recency }
            let bySort = jsCompare(a.sort, b.sort)
            if bySort != 0 { return Double(bySort) }
            return Double(jsCompare(a.hit.id, b.hit.id))
        }
        if rows.isEmpty { continue }
        groups.append(
            SearchGroup(
                key: key, title: key.title, total: rows.count, hits: rows.prefix(max(0, limit)).map(\.hit),
                more: rows.count > limit))
    }
    return SearchResults(query: query, groups: groups, empty: groups.isEmpty)
}

// MARK: - Recent: the last records this person opened, on this device

public enum RecentKind: String, Codable, Sendable {
    case customer, job, quote, invoice
}

public struct RecentItem: Codable, Equatable, Hashable, Identifiable, Sendable {
    public var kind: RecentKind
    public var id: String
    public var title: String
    public var detail: String?
    public var open: SearchOpen

    public init(kind: RecentKind, id: String, title: String, detail: String?, open: SearchOpen) {
        self.kind = kind
        self.id = id
        self.title = title
        self.detail = detail
        self.open = open
    }
}

/// The list with this record first (moved up if it was there), at most `SearchText.recentLimit`.
public func rememberRecent(_ list: [RecentItem], _ item: RecentItem) -> [RecentItem] {
    Array(([item] + list.filter { !($0.kind == item.kind && $0.id == item.id) }).prefix(SearchText.recentLimit))
}

/// What a device stored, checked: anything malformed is left out.
public func parseRecent(_ stored: JSONValue?) -> [RecentItem] {
    guard case .array(let rows)? = stored else { return [] }
    var out: [RecentItem] = []
    for r in rows {
        guard case .object(let x) = r,
            case .string(let kindText)? = x["kind"], let kind = RecentKind(rawValue: kindText),
            case .string(let id)? = x["id"],
            case .string(let title)? = x["title"],
            case .object(let open)? = x["open"],
            case .string(let screenText)? = open["screen"], let screen = SearchOpen.Screen(rawValue: screenText),
            case .string(let openId)? = open["id"]
        else { continue }
        var detail: String?
        if case .string(let d)? = x["detail"] { detail = d }
        var section: SearchOpen.Section?
        if case .string(let s)? = open["section"] { section = SearchOpen.Section(rawValue: s) }
        out.append(
            RecentItem(
                kind: kind, id: id, title: title, detail: detail,
                open: SearchOpen(screen: screen, id: openId, section: section)))
        if out.count == SearchText.recentLimit { break }
    }
    return out
}

/// A search result as a Recent entry (pools open their customer, so they're remembered as it).
public func recentFromHit(_ hit: SearchHit) -> RecentItem? {
    guard let open = hit.open, hit.kind != .pool, let kind = RecentKind(rawValue: hit.kind.rawValue) else {
        return nil
    }
    return RecentItem(kind: kind, id: hit.id, title: hit.title, detail: hit.detail, open: open)
}
