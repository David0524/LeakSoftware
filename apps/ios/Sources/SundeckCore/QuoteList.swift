import Foundation

// Standalone quotes and the Quotes list (owner, 2026-11-24: "It's more about having the
// ability to send quotes more often. Also instead of creating a full job, we should be able to
// just create a quote for a new/existing customer"; docs/design/2026-11-24-standalone-quotes.md).
// Port of quote-list.ts: every platform uses these words and rules.

/// The Quotes list's segmented control, in order (`QUOTE_SEGMENTS`). It opens on Sent, the ones
/// to follow up.
public enum QuoteSegment: String, CaseIterable, Codable, Sendable {
    case draft, sent, accepted, declined

    public var label: String {
        switch self {
        case .draft: "Draft"
        case .sent: "Sent"
        case .accepted: "Accepted"
        case .declined: "Declined"
        }
    }

    /// The empty list, per segment (`QUOTES_EMPTY`).
    public var emptyText: String {
        switch self {
        case .draft: "No draft quotes."
        case .sent: "No quotes waiting on a customer."
        case .accepted: "No accepted quotes yet."
        case .declined: "No declined or expired quotes."
        }
    }

    /// `DEFAULT_QUOTE_SEGMENT`.
    public static let `default`: QuoteSegment = .sent
}

/// Which segment a quote is under. An expired quote can't be accepted, so it is closed too.
public func quoteSegment(_ status: QuoteStatus) -> QuoteSegment {
    switch status {
    case .draft: .draft
    case .sent: .sent
    case .accepted: .accepted
    case .declined, .expired: .declined
    }
}

/// What the Quotes list needs of a quote (`QuoteListItem`).
public protocol QuoteListEntry {
    var quoteNumber: Int? { get }
    var quoteStatus: QuoteStatus { get }
    var quoteTotalCents: Cents { get }
    var quoteCustomer: String? { get }
    /// The status of the quote's own job: "quote" for a standalone quote not yet a job.
    var quoteJobStatus: String { get }
    var quoteJobNumber: Int? { get }
}

/// A plain Quotes list row, as the TypeScript passes it.
public struct QuoteListItem: QuoteListEntry, Codable, Equatable, Sendable {
    public var number: Int?
    public var status: QuoteStatus
    public var totalCents: Cents
    public var customer: String?
    public var jobStatus: String
    public var jobNumber: Int?

    public init(
        number: Int?, status: QuoteStatus, totalCents: Cents, customer: String?, jobStatus: String,
        jobNumber: Int? = nil
    ) {
        self.number = number
        self.status = status
        self.totalCents = totalCents
        self.customer = customer
        self.jobStatus = jobStatus
        self.jobNumber = jobNumber
    }

    enum CodingKeys: String, CodingKey {
        case number, status, customer, jobStatus, jobNumber
        case totalCents = "total_cents"
    }

    public var quoteNumber: Int? { number }
    public var quoteStatus: QuoteStatus { status }
    public var quoteTotalCents: Cents { totalCents }
    public var quoteCustomer: String? { customer }
    public var quoteJobStatus: String { jobStatus }
    public var quoteJobNumber: Int? { jobNumber }
}

/// An accepted standalone quote whose customer has no pool yet: the office adds one.
public func quoteWaitingForPool(status: QuoteStatus, jobStatus: String) -> Bool {
    status == .accepted && isQuoteJob(status: jobStatus)
}

public let quoteNeedsPool = "Accepted. Add a pool to schedule the repair."

public let quotesEmptySearch = "No quotes match your search."

/// The quotes a segment and search show, in the order given (newest first). An unknown segment
/// reads as the default one.
public func filterQuotes<T: QuoteListEntry>(_ quotes: [T], segment: String?, q: String?) -> [T] {
    let segment = QuoteSegment(rawValue: segment ?? "") ?? .default
    var query = ECMA.trim(q ?? "").lowercased()
    if query.hasPrefix("#") { query.removeFirst() }
    return quotes.filter { x in
        guard quoteSegment(x.quoteStatus) == segment else { return false }
        if query.isEmpty { return true }
        return (x.quoteCustomer ?? "").lowercased().contains(query)
            || x.quoteNumber.map { String($0) == query } == true
            || x.quoteJobNumber.map { String($0) == query } == true
    }
}

/// How many quotes each segment holds, for the segment labels' counts.
public func quoteSegmentCounts(_ statuses: [QuoteStatus]) -> [QuoteSegment: Int] {
    var counts = Dictionary(uniqueKeysWithValues: QuoteSegment.allCases.map { ($0, 0) })
    for s in statuses { counts[quoteSegment(s), default: 0] += 1 }
    return counts
}

/// "Quote #1043", or "Quote" before the server numbers it (a phone offline).
public func quoteTitle(_ number: Int?) -> String {
    number.map { "Quote #\($0)" } ?? "Quote"
}

/// A row's second line: "Quote #1043 · $1,250.00".
public func quoteRowDetail(number: Int?, totalCents: Cents) -> String {
    "\(quoteTitle(number)) · \(formatCents(totalCents))"
}

// MARK: - New Quote: a customer (new or existing), an optional pool, and nothing else.

/// What New Quote collects (`NewQuoteInput`).
public struct NewQuoteInput: Codable, Equatable, Sendable {
    public var customerId: String?
    public var customerName: String
    public var customerPhone: String
    public var customerEmail: String
    /// An existing pool, or a new address (optional; all blank means no pool yet).
    public var propertyId: String?
    public var addressLine1: String
    public var city: String
    public var state: String
    public var postalCode: String

    public init(
        customerId: String? = nil, customerName: String = "", customerPhone: String = "", customerEmail: String = "",
        propertyId: String? = nil, addressLine1: String = "", city: String = "", state: String = "",
        postalCode: String = ""
    ) {
        self.customerId = customerId
        self.customerName = customerName
        self.customerPhone = customerPhone
        self.customerEmail = customerEmail
        self.propertyId = propertyId
        self.addressLine1 = addressLine1
        self.city = city
        self.state = state
        self.postalCode = postalCode
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func text(_ key: CodingKeys) throws -> String { try c.decodeIfPresent(String.self, forKey: key) ?? "" }
        customerId = try c.decodeIfPresent(String.self, forKey: .customerId)
        customerName = try text(.customerName)
        customerPhone = try text(.customerPhone)
        customerEmail = try text(.customerEmail)
        propertyId = try c.decodeIfPresent(String.self, forKey: .propertyId)
        addressLine1 = try text(.addressLine1)
        city = try text(.city)
        state = try text(.state)
        postalCode = try text(.postalCode)
    }

    var hasCustomer: Bool { !(customerId ?? "").isEmpty }
    var hasProperty: Bool { !(propertyId ?? "").isEmpty }
}

/// Errors by field name (the `NewQuoteInput` property) for the New Quote form.
public func validateNewQuote(_ input: NewQuoteInput) -> [String: String] {
    var errors: [String: String] = [:]
    if !input.hasCustomer && ECMA.trim(input.customerName).isEmpty {
        errors["customerName"] = "Enter the customer's name."
    }
    let email = ECMA.trim(input.customerEmail)
    if !input.hasCustomer && !email.isEmpty && !looksLikeEmail(email) {
        errors["customerEmail"] = "Check the email address."
    }
    let partOfAddress = [input.city, input.state, input.postalCode].contains { !ECMA.trim($0).isEmpty }
    if !input.hasProperty && partOfAddress && ECMA.trim(input.addressLine1).isEmpty {
        errors["addressLine1"] = "Enter the street address, or leave the address blank."
    }
    return errors
}

/// The rows New Quote writes, in one batch (`newQuoteRecords`).
public struct NewQuoteRecords: Equatable, Sendable {
    public var customer: [String: JSONValue]?
    public var property: [String: JSONValue]?
    public var job: [String: JSONValue]
    public var quote: [String: JSONValue]
}

/// The customer and pool when new (none for an existing one, or no pool at all), the quote job,
/// and the empty quote. The caller adds ids, company_id, the job's property_id and
/// bill_to_customer_id, and the quote's job_id. `assignedUserId` is the person making it when
/// they're a tech, so a tech limited to their own jobs still sees their quote.
public func newQuoteRecords(_ input: NewQuoteInput, assignedUserId: String?) -> NewQuoteRecords {
    func blankToNull(_ s: String) -> JSONValue {
        let t = ECMA.trim(s)
        return t.isEmpty ? .null : .string(t)
    }
    let customer: [String: JSONValue]? =
        input.hasCustomer
        ? nil
        : [
            "kind": .string("homeowner"),
            "name": .string(ECMA.trim(input.customerName)),
            "phone": blankToNull(input.customerPhone),
            "email": blankToNull(input.customerEmail),
        ]
    let state = ECMA.trim(input.state)
    let property: [String: JSONValue]? =
        input.hasProperty || ECMA.trim(input.addressLine1).isEmpty
        ? nil
        : [
            "address_line1": .string(ECMA.trim(input.addressLine1)),
            "city": blankToNull(input.city),
            "state": state.isEmpty ? .null : .string(state.uppercased()),
            "postal_code": blankToNull(input.postalCode),
            "has_pool": .bool(true),
        ]
    return NewQuoteRecords(
        customer: customer, property: property,
        job: [
            "type": .string("repair"), "status": .string(JobStatus.quote.rawValue),
            "assigned_user_id": assignedUserId.map(JSONValue.string) ?? .null,
        ],
        quote: ["discount_cents": .number(0)])
}
