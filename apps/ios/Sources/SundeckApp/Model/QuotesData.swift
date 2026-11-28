import Foundation
import Observation
import SundeckCore
import SundeckSync

// Standalone quotes and the Quotes list (owner, 2026-11-24; docs/design/2026-11-24-standalone-quotes.md):
// the Quotes list's rows, the Quote screen, New Quote, Add Pool and Delete Quote. The words and
// rules are core's (SundeckCore/QuoteList.swift); this reads and writes the phone's rows. Kept out
// of SwiftUI so it's tested on Linux.

// MARK: - Quotes list

/// A row of More › Quotes: every quote in the shop, standalone and on jobs.
public struct QuoteListRow: Identifiable, Equatable, Sendable, QuoteListEntry {
    public var id: String
    public var jobId: String
    public var number: Int?
    public var status: QuoteStatus
    public var totalCents: Cents
    public var customer: String?
    /// The status of the quote's own job: "quote" for a standalone quote not yet a job.
    public var jobStatus: String
    public var jobNumber: Int?
    public var createdAt: String?

    public var quoteNumber: Int? { number }
    public var quoteStatus: QuoteStatus { status }
    public var quoteTotalCents: Cents { totalCents }
    public var quoteCustomer: String? { customer }
    public var quoteJobStatus: String { jobStatus }
    public var quoteJobNumber: Int? { jobNumber }

    /// "Quote #1043 · $1,250.00".
    public var detail: String { quoteRowDetail(number: number, totalCents: totalCents) }
    /// An accepted standalone quote whose customer has no pool yet: `quoteNeedsPool` under it.
    public var waitingForPool: Bool { quoteWaitingForPool(status: status, jobStatus: jobStatus) }
}

/// The Quotes list's title, search prompt and New Quote button.
public enum QuotesText {
    public static let title = "Quotes"
    public static let search = "Search Quotes"
    public static let newQuote = "New Quote"
    public static let createQuote = "Create Quote"
    public static let poolSection = "Pool (Optional)"
    public static let poolFooter = "Leave the address blank to quote without one."
    public static let addPool = "Add Pool"
    public static let deleteQuote = "Delete Quote"
    public static let deleteTitle = "Delete this quote?"
    public static let delete = "Delete"
    public static let notOnPhone = "This quote isn’t on this phone."
    public static let couldNotSave = "Couldn’t Save the Quote"
}

/// Every quote in the shop on this phone (not deleted, its job not deleted), newest first, with
/// its customer and its job's status and number.
public func quoteListRows(_ store: LocalStore, companyId: String) -> [QuoteListRow] {
    let jobs = Dictionary(
        ((try? jobViews(store, companyId: companyId, includeQuoteJobs: true)) ?? []).map { ($0.id, $0) },
        uniquingKeysWith: { a, _ in a })
    return ((try? store.list("quote", companyId: companyId)) ?? [])
        .compactMap { row -> QuoteListRow? in
            guard row["deleted_at"]?.string == nil, let quote = try? JSONValue.object(row).decode(Quote.self),
                let job = jobs[quote.jobId], job.job["deleted_at"]?.string == nil
            else { return nil }
            return QuoteListRow(
                id: quote.id, jobId: quote.jobId, number: quote.number, status: quote.status,
                totalCents: quote.totalCents, customer: job.customer?["name"]?.string,
                jobStatus: job.job["status"]?.string ?? JobStatus.unscheduled.rawValue, jobNumber: job.number,
                createdAt: row["created_at"]?.string)
        }
        .sorted { a, b in
            // A quote made on this phone has no created_at until it syncs: it's the newest.
            let ac = a.createdAt ?? "~"
            let bc = b.createdAt ?? "~"
            if ac != bc { return ac > bc }
            return a.id > b.id
        }
}

// MARK: - Quote screen

/// What the Quote screen shows above the quote builder: Customer, Pool (or Add Pool) and Job.
public struct QuoteScreenModel: Equatable, Sendable {
    public var quote: Quote
    /// The quote's job (a quote job for a standalone quote).
    public var job: JobView
    /// "Quote #1043", or "Quote" before the server numbers it.
    public var title: String
    public var customerId: String?
    public var customerName: String
    /// The pool's address; nil for a quote job with none yet.
    public var poolAddress: String?
    /// A standalone quote not yet a job, and still without a pool.
    public var isQuoteJob: Bool
    /// The Job row ("Job #1050"): a quote on an ordinary job, or one that became the repair job.
    public var jobLabel: String?
    /// Accepted, but the customer has no pool: `quoteNeedsPool`.
    public var waitingForPool: Bool
    /// A draft standalone quote: Delete Quote.
    public var canDelete: Bool
    /// The customer's pools, for Add Pool.
    public var customerPools: [PoolChoice]

    /// One of the customer's pools.
    public struct PoolChoice: Identifiable, Equatable, Sendable {
        public var id: String
        public var address: String
    }

    /// The Add Pool row: a quote job with no pool, for people who can make jobs.
    public var canAddPool: Bool { isQuoteJob && poolAddress == nil }

    public init?(_ store: LocalStore, companyId: String, quoteId: String) {
        guard let row = try? store.getLive("quote", quoteId), let quote = try? JSONValue.object(row).decode(Quote.self),
            let job = try? jobView(store, companyId: companyId, jobId: quote.jobId)
        else { return nil }
        self.quote = quote
        self.job = job
        title = quoteTitle(quote.number)
        customerId = job.customer?.id
        customerName = job.customerName
        poolAddress = job.decodedProperty.map(formatAddress).flatMap { $0.isEmpty ? nil : $0 }
        let status = job.job["status"]?.string ?? ""
        isQuoteJob = SundeckCore.isQuoteJob(status: status)
        jobLabel = isQuoteJob ? nil : (job.number.map { "Job #" + String($0) } ?? "New job")
        waitingForPool = quoteWaitingForPool(status: quote.status, jobStatus: status)
        canDelete = isQuoteJob && quote.status == .draft
        let customer = job.customer?.id
        customerPools = ((try? store.list("property", companyId: companyId)) ?? [])
            .filter { customer != nil && $0["customer_id"]?.string == customer && $0["deleted_at"]?.string == nil }
            .map { PoolChoice(id: $0.id, address: addressText($0)) }
    }
}

/// The quote job behind a job route: a job whose status is `quote` opens its Quote screen instead
/// (an old link, Activity, search). Nil for any other job.
public func standaloneQuoteId(_ store: LocalStore, jobId: String) -> String? {
    guard let job = try? store.getLive("job", jobId), isQuoteJob(status: job["status"]?.string ?? "") else {
        return nil
    }
    return ((try? store.list("quote", jobId: jobId)) ?? [])
        .filter { $0["deleted_at"]?.string == nil && $0["job_id"]?.string == jobId }
        .max { $0.id < $1.id }?.id
}

/// The Quote screen's own writes: Add Pool and Delete Quote, through the sync layer.
@MainActor
public enum StandaloneQuoteWrites {
    /// Add Pool: one of the customer's pools, or a new address for them, on the quote job. The
    /// server's trigger turns an accepted quote's job into the unscheduled, numbered repair job.
    public static func addPool(
        _ sync: SyncService, companyId: String, jobId: String, propertyId: String?, customerId: String?,
        address: NewQuoteInput
    ) throws {
        try sync.batch {
            var pool = propertyId
            if pool == nil {
                guard let customerId,
                    var property = newQuoteRecords(
                        NewQuoteInput(
                            customerId: customerId, addressLine1: address.addressLine1, city: address.city,
                            state: address.state, postalCode: address.postalCode),
                        assignedUserId: nil
                    ).property
                else { throw NewJobFormError.invalid }
                property["customer_id"] = .string(customerId)
                pool = try sync.store.insert("property", companyId: companyId, property)
            }
            guard let pool else { return }
            try sync.store.write("job", id: jobId, companyId: companyId, ["property_id": .string(pool)])
        }
    }

    /// Delete Quote on a draft standalone quote: the quote and its quote job, together.
    public static func delete(_ sync: SyncService, companyId: String, quoteId: String, jobId: String) throws {
        try sync.batch {
            try sync.store.write("quote", id: quoteId, companyId: companyId, ["deleted_at": nowISO()])
            try sync.store.write("job", id: jobId, companyId: companyId, ["deleted_at": nowISO()])
        }
    }
}

/// Add Pool's new address: the street is needed (the rest is optional).
public func addPoolAddressError(_ street: String) -> String? {
    street.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Enter the street address." : nil
}

// MARK: - New Quote

/// New Quote (docs/design/2026-11-24-standalone-quotes.md): a customer (new, or picked with New
/// Job's picker) and an optional pool, nothing else. Saving writes core's `newQuoteRecords` in one
/// batch, offline: the customer and pool when new, the quote job, and the empty quote.
@MainActor @Observable
public final class NewQuoteForm {
    public typealias Mode = NewJobForm.Mode

    public let company: CompanyContext
    public let userId: String
    @ObservationIgnored private let sync: SyncService
    /// Opened from a customer page: that customer, already picked.
    @ObservationIgnored private let startCustomer: String?

    public var mode: Mode = .new
    public private(set) var customerId: String?
    /// One of the picked customer's pools, or nil for another address (blank: no pool yet).
    public var propertyId: String?
    public var input = NewQuoteInput()
    /// OK to Text for a new customer (OkToText, owner 2026-11-28).
    public var textOk = false
    public private(set) var errors: [String: String] = [:]

    public init(sync: SyncService, company: CompanyContext, userId: String, customerId: String? = nil) {
        self.sync = sync
        self.company = company
        self.userId = userId
        startCustomer = customerId
        if let customerId {
            mode = .existing
            selectCustomer(customerId)
        }
    }

    public var canMakeJobs: Bool { SundeckCore.canMakeJobs(company.role, company.settings) }

    public var customers: [Row] {
        rows("customer").sorted {
            ($0["name"]?.string ?? "").localizedCaseInsensitiveCompare($1["name"]?.string ?? "") == .orderedAscending
        }
    }
    public var properties: [Row] { rows("property") }
    public var selectedCustomer: Row? { customerId.flatMap { id in customers.first { $0.id == id } } }
    public var customerProperties: [Row] {
        guard let customerId else { return [] }
        return properties.filter { $0["customer_id"]?.string == customerId }
    }
    /// The address fields show for a new customer or another address.
    public var newPool: Bool { mode == .new || propertyId == nil }

    /// "Maria Lopez (602-555-0101 · maria@example.com)", as New Job's picker.
    public func customerLabel(_ c: Row) -> String { customerPickerLabel(c) }

    /// Picking a customer picks their pool when they have just one.
    public func selectCustomer(_ id: String?) {
        customerId = id
        let theirs = properties.filter { $0["customer_id"]?.string == id }
        propertyId = theirs.count == 1 ? theirs[0].id : nil
    }

    /// Anything typed or picked yet (beyond the customer it opened with)? Then leaving asks first.
    public var isDirty: Bool {
        let typed = [
            input.customerName, input.customerPhone, input.customerEmail, input.addressLine1, input.city,
            input.state, input.postalCode,
        ]
        return (customerId != nil && customerId != startCustomer)
            || typed.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    /// What's checked and saved: a new customer's fields, or the picked one; a pool or an address.
    public var checkedInput: NewQuoteInput {
        var checked = input
        if mode == .existing {
            checked.customerId = customerId
            checked.customerName = ""
            checked.customerPhone = ""
            checked.customerEmail = ""
            checked.propertyId = propertyId
        } else {
            checked.customerId = nil
            checked.propertyId = nil
        }
        if checked.propertyId != nil {
            checked.addressLine1 = ""
            checked.city = ""
            checked.state = ""
            checked.postalCode = ""
        }
        return checked
    }

    @discardableResult
    public func validate() -> Bool {
        var e = validateNewQuote(checkedInput)
        if mode == .existing && customerId == nil { e["customer"] = "Pick a customer." }
        errors = e
        return e.isEmpty
    }

    /// Saves the customer (if new), pool (if new), the quote job and its quote together, or
    /// nothing. Returns the new quote's id.
    public func save() throws -> String {
        guard canMakeJobs else { throw NewJobFormError.notAllowed }
        guard validate() else { throw NewJobFormError.invalid }
        let checked = checkedInput
        // A tech's own quote, so a tech limited to their own jobs still sees it.
        let records = newQuoteRecords(checked, assignedUserId: company.role == "tech" ? userId : nil)
        let store = sync.store
        let companyId = company.id
        var customerValues = records.customer ?? [:]
        customerValues.merge(OkToTextWrites.fields(textOk, userId: userId)) { _, new in new }
        return try sync.batch {
            let customer: String
            if let id = checked.customerId {
                customer = id
            } else {
                customer = try store.insert("customer", companyId: companyId, customerValues)
            }
            var property = checked.propertyId
            if property == nil, var values = records.property {
                values["customer_id"] = .string(customer)
                property = try store.insert("property", companyId: companyId, values)
            }
            var job = records.job
            job["bill_to_customer_id"] = .string(customer)
            if let property { job["property_id"] = .string(property) }
            let jobId = try store.insert("job", companyId: companyId, job)
            var quote = records.quote
            quote["job_id"] = .string(jobId)
            return try store.insert("quote", companyId: companyId, quote)
        }
    }

    private func rows(_ table: String) -> [Row] {
        _ = sync.revision
        return ((try? sync.store.list(table, companyId: company.id)) ?? []).filter { $0["deleted_at"]?.string == nil }
    }
}

/// A customer in New Job's and New Quote's picker: "Maria Lopez (602-555-0101 · maria@example.com)".
public func customerPickerLabel(_ c: Row) -> String {
    let detail = [c["phone"]?.string, c["email"]?.string].compactMap { $0 }.filter { !$0.isEmpty }
        .joined(separator: " · ")
    let name = c["name"]?.string ?? "Customer"
    return detail.isEmpty ? name : "\(name) (\(detail))"
}
