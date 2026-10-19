import Foundation
import Observation
import SundeckCore
import SundeckSync

/// A booking question from the company settings (`intake_questions`). Port of IntakeQuestion in
/// packages/core/src/models.ts.
public struct BookingQuestion: Equatable, Sendable, Identifiable {
    public enum Kind: String, Sendable {
        case multi, single, text
    }

    public var key: String
    public var label: String
    public var kind: Kind
    public var options: [String]

    public var id: String { key }

    /// The questions in the settings, skipping any that are malformed.
    static func list(_ settings: JSONValue) -> [BookingQuestion] {
        (settings["intake_questions"]?.array ?? []).compactMap { q in
            guard let key = q["key"]?.string, let label = q["label"]?.string,
                let kind = q["type"]?.string.flatMap(Kind.init(rawValue:))
            else { return nil }
            return BookingQuestion(
                key: key, label: label, kind: kind, options: (q["options"]?.array ?? []).compactMap(\.string))
        }
    }
}

/// Why a new job wasn't saved.
public enum NewJobFormError: Error, Equatable, CustomStringConvertible {
    /// Owners stopped techs making jobs.
    case notAllowed
    /// Some fields need fixing; `errors` and `feeError` say which.
    case invalid

    public var description: String {
        switch self {
        case .notAllowed: NewJobForm.notAllowedMessage
        case .invalid: "Fix the highlighted fields."
        }
    }
}

/// The New Job screen's state and its save. Port of apps/mobile/src/app/(app)/jobs/new.tsx:
/// a customer (found or new), the pool address (one of theirs or new), when, and who. Saving
/// writes the customer, property, job, and the job's checklist in one transaction, offline.
@MainActor @Observable
public final class NewJobForm {
    public enum When: String, CaseIterable, Sendable {
        case now, scheduled, later

        public var label: String {
            switch self {
            case .now: "Start Now"
            case .scheduled: "Schedule"
            case .later: "Later"
            }
        }
    }

    public nonisolated static let notAllowedMessage =
        "Your office makes new jobs. Ask an owner or admin to add this one."

    // MARK: - Context

    public let company: CompanyContext
    public let userId: String
    @ObservationIgnored private let sync: SyncService
    @ObservationIgnored private let now: () -> Date
    /// YYYY-MM-DD in the shop's time zone, fixed when the form opens.
    public let today: String
    public let tomorrow: String

    // MARK: - Fields

    public var jobType: JobType
    public private(set) var customerId: String?
    public var search = ""
    /// One of the chosen customer's properties, or nil for a new address.
    public var propertyId: String?
    /// Name, phone, email, address, and schedule as typed.
    public var input = NewJobInput()
    public var otherEmails = ""
    /// Booking answers by question key: a string, or an array of strings for a multi question.
    public private(set) var answers: [String: JSONValue] = [:]
    /// The detection fee as typed; nil until edited (the price book's suggestion shows until then).
    public var fee: String?
    public var poolType: PoolType = .gunitePlaster
    public var hasSpa = false
    public var shape: DiagramShape?
    public var accessNotes = ""
    public var when: When = .now
    public var assignToMe = true
    /// A teammate's user id, or nil for none.
    public var secondTech: String?

    public private(set) var errors: [String: String] = [:]
    public private(set) var feeError: String?

    public convenience init(sync: SyncService, company: CompanyContext, userId: String) {
        self.init(sync: sync, company: company, userId: userId, now: { Date() })
    }

    /// `now` is fixed in tests.
    init(sync: SyncService, company: CompanyContext, userId: String, now: @escaping () -> Date) {
        self.sync = sync
        self.company = company
        self.userId = userId
        self.now = now
        let start = now()
        today = (try? localDate(start, company.timeZone)) ?? ""
        tomorrow = (try? localDate(start.addingTimeInterval(86_400), company.timeZone)) ?? ""
        // What the shop does decides the kind of job (company services setting, 2026-10-16).
        jobType = company.services == .pool ? .maintenance : .detection
    }

    // MARK: - What the screen shows

    /// Owners can stop techs making jobs (owner setting, 2026-10-18).
    public var canMakeJobs: Bool { SundeckCore.canMakeJobs(company.role, company.settings) }
    public var seesAll: Bool { seesAllJobs(company.role, company.settings) }
    public var jobTypes: [JobTypeOption] { newJobTypes(company.services) }
    public var isLeak: Bool { jobType == .detection }
    public var isMaintenance: Bool { jobType == .maintenance }
    public var questions: [BookingQuestion] { BookingQuestion.list(company.settings) }
    /// The booking section: leak detection with questions set up.
    public var showsBooking: Bool { isLeak && !questions.isEmpty }
    /// Teammates for Second tech (not this person).
    public var team: [TeamProfile] { sync.kv.team.filter { $0.id != userId } }
    /// Second tech shows when there's a teammate, except on pool service visits.
    public var showsSecondTech: Bool { !team.isEmpty && !isMaintenance }

    public var customers: [Row] { rows("customer") }
    public var properties: [Row] { rows("property") }

    public var selectedCustomer: Row? { customerId.flatMap { id in customers.first { $0.id == id } } }
    public var customerProperties: [Row] {
        guard let customerId else { return [] }
        return properties.filter { $0["customer_id"]?.string == customerId }
    }
    public var selectedProperty: Row? { propertyId.flatMap { id in properties.first { $0.id == id } } }

    /// Up to six customers whose name, phone, or email contains the search.
    public var matches: [Row] {
        let q = trim(search).lowercased()
        guard !q.isEmpty else { return [] }
        return Array(
            customers.filter { c in
                ["name", "phone", "email"].contains { c[$0]?.string?.lowercased().contains(q) == true }
            }
            .prefix(6))
    }

    /// The detection fee starts from the price book: the first Detection item for a pool, the
    /// second for a pool and spa.
    public var suggestedFeeCents: Cents? {
        let detection = rows("price_book_item")
            .filter { $0["active"]?.bool == true && $0["category"]?.string == "Detection" }
            .enumerated()
            .sorted { a, b in
                let (x, y) = (a.element["sort_order"]?.number ?? 0, b.element["sort_order"]?.number ?? 0)
                return x == y ? a.offset < b.offset : x < y
            }
            .map(\.element)
        let spaChosen = propertyId != nil ? (selectedProperty?["has_spa"]?.bool ?? false) : hasSpa
        let item = (spaChosen && detection.count > 1 ? detection[1] : detection.first)
        return item?["price_cents"]?.number.map { Int($0) }
    }

    /// What the fee field shows.
    public var feeText: String {
        if let fee { return fee }
        return suggestedFeeCents.map(dollarsText) ?? ""
    }

    /// Anything typed or picked yet? Then closing asks first, and a swipe down doesn't close it.
    public var isDirty: Bool {
        let typed = [
            input.customerName, input.customerPhone, input.customerEmail, input.addressLine1, input.city,
            input.state, input.postalCode, input.scheduleDate, input.scheduleTime, search, accessNotes,
            otherEmails,
        ]
        return customerId != nil || shape != nil || fee != nil || !answers.isEmpty
            || typed.contains { !trim($0).isEmpty }
    }

    /// The create button's title.
    public var saveTitle: String { when == .now ? "Create and Start Job" : "Create Job" }

    // MARK: - Changes

    /// Picks a found customer; their only pool is picked too.
    public func selectCustomer(_ id: String) {
        customerId = id
        search = ""
        let theirs = properties.filter { $0["customer_id"]?.string == id }
        propertyId = theirs.count == 1 ? theirs[0].id : nil
    }

    /// Back to finding or adding a customer.
    public func changeCustomer() {
        customerId = nil
        propertyId = nil
    }

    public func answer(_ key: String) -> String { answers[key]?.string ?? "" }

    public func setAnswer(_ key: String, _ value: String) { answers[key] = .string(value) }

    public func isPicked(_ key: String, _ option: String) -> Bool {
        (answers[key]?.array ?? []).contains(.string(option))
    }

    /// Ticks or unticks one option of a multi question (ticked ones keep their order).
    public func setPicked(_ key: String, _ option: String, _ on: Bool) {
        var list = (answers[key]?.array ?? []).filter { $0 != .string(option) }
        if on { list.append(.string(option)) }
        answers[key] = .array(list)
    }

    // MARK: - Saving

    /// Checks the fields and sets `errors` and `feeError`. True when the job can be saved.
    @discardableResult
    public func validate() -> Bool {
        let checked = checkedInput()
        var e = validateNewJob(checked)
        if when == .scheduled && checked.scheduleDate.isEmpty { e["scheduleDate"] = "Pick a date." }
        errors = e
        feeError = badFee ? "Enter a price like 649." : nil
        return e.isEmpty && !badFee
    }

    /// Saves the customer (if new), property (if new), job, and its checklist together, or
    /// nothing. Returns the new job's id.
    public func save() throws -> String {
        guard canMakeJobs else { throw NewJobFormError.notAllowed }
        guard validate() else { throw NewJobFormError.invalid }
        let checked = checkedInput()
        let leak = isLeak
        let timing: JobTiming =
            switch when {
            case .now: .now(at: now())
            case .scheduled:
                .scheduled(date: checked.scheduleDate, time: checked.scheduleTime, timeZone: company.timeZone)
            case .later: .later
            }
        let records = try newJobRecords(
            checked,
            NewJobDetails(
                poolType: poolType, hasSpa: hasSpa, accessNotes: accessNotes, timing: timing,
                assignedUserId: assignToMe || !seesAll ? userId : nil, jobType: jobType))
        let feeCents = feeCentsValue
        let componentTypes = rows("component_type").compactMap { try? JSONValue.object($0).decode(ComponentType.self) }
        let existingProperty = selectedProperty
        let store = sync.store
        let companyId = company.id
        let (customerId, propertyId, jobType) = (self.customerId, self.propertyId, self.jobType)
        let (shape, hasSpa, poolType, answers) = (self.shape, self.hasSpa, self.poolType, self.answers)
        let secondTech = isMaintenance ? nil : self.secondTech
        let ccEmails = splitEmails(otherEmails)

        // Customer, property, job, and its checklist are saved together or not at all.
        return try sync.batch {
            let customer =
                try customerId
                ?? store.insert("customer", companyId: companyId, customerRow(records.customer, ccEmails))
            let property =
                try propertyId
                ?? store.insert(
                    "property", companyId: companyId, propertyRow(records.property, customer: customer, shape))
            var job = jobRow(records.job)
            job["property_id"] = .string(property)
            job["bill_to_customer_id"] = .string(customer)
            // Only leak detection has a detection fee and booking questions; a repair is priced on
            // its invoice. Pool service visits have no second tech.
            job["fee_cents"] = leak ? feeCents.map { .number(Double($0)) } ?? .null : .null
            job["second_tech_id"] = secondTech.map { .string($0) } ?? .null
            job["intake"] = leak ? .object(answers) : .object([:])
            let jobId = try store.insert("job", companyId: companyId, job)

            // The checklist is ready the moment the job opens, even offline.
            let spa = existingProperty.map { $0["has_spa"]?.bool ?? false } ?? hasSpa
            let type: JSONValue =
                existingProperty.map { $0["pool_type"] ?? .null } ?? .string(poolType.rawValue)
            let planned = try JSONValue.object([
                "address_line1": "", "has_pool": true, "has_spa": .bool(spa), "pool_type": type,
            ])
            .decode(Property.self)
            for item in planComponents(componentTypes, planned, jobType) {
                let componentId = try store.insert(
                    "job_component", companyId: companyId,
                    [
                        "job_id": .string(jobId), "component_type_id": .string(item.componentTypeId),
                        "instance_number": .number(Double(item.instanceNumber)), "label": .string(item.label),
                        "sort_order": .number(Double(item.sortOrder)),
                    ])
                try store.insert(
                    "checklist_item_result", companyId: companyId,
                    ["job_id": .string(jobId), "job_component_id": .string(componentId), "status": "pending"])
            }
            return jobId
        }
    }

    // MARK: - Helpers

    /// The input as saved: the picked customer and pool, and a schedule only when scheduling.
    private func checkedInput() -> NewJobInput {
        var checked = input
        checked.customerId = customerId
        checked.propertyId = propertyId
        if when != .scheduled {
            checked.scheduleDate = ""
            checked.scheduleTime = ""
        }
        return checked
    }

    private var feeCentsValue: Cents? { trim(feeText).isEmpty ? nil : parseDollars(feeText) }

    private var badFee: Bool {
        guard isLeak, !trim(feeText).isEmpty else { return false }
        guard let cents = feeCentsValue else { return true }
        return cents < 0
    }

    /// The company's rows of a table. Reads `sync.revision`, so the screen updates after a sync.
    private func rows(_ table: String) -> [Row] {
        _ = sync.revision
        return (try? sync.store.list(table, companyId: company.id)) ?? []
    }
}

/// `s.trim()`.
private func trim(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

/// `(cents / 100).toFixed(2)`: "375.00".
private func dollarsText(_ cents: Cents) -> String {
    let magnitude = cents.magnitude
    let fraction = magnitude % 100
    return "\(cents < 0 ? "-" : "")\(magnitude / 100).\(fraction < 10 ? "0" : "")\(fraction)"
}

private func optional(_ s: String?) -> JSONValue { s.map { .string($0) } ?? .null }

private func customerRow(_ c: NewCustomerValues?, _ ccEmails: [String]) -> Row {
    guard let c else { return [:] }
    return [
        "kind": .string(c.kind), "name": .string(c.name), "phone": optional(c.phone), "email": optional(c.email),
        "cc_emails": .array(ccEmails.map { .string($0) }),
    ]
}

private func propertyRow(_ p: NewPropertyValues?, customer: String, _ shape: DiagramShape?) -> Row {
    guard let p else { return [:] }
    return [
        "address_line1": .string(p.addressLine1), "city": optional(p.city), "state": optional(p.state),
        "postal_code": optional(p.postalCode), "pool_type": optional(p.poolType?.rawValue),
        "has_pool": .bool(p.hasPool), "has_spa": .bool(p.hasSpa), "access_notes": optional(p.accessNotes),
        "customer_id": .string(customer), "diagram_shape": optional(shape?.rawValue),
    ]
}

private func jobRow(_ j: NewJobValues) -> Row {
    var row: Row = [
        "type": .string(j.type.rawValue), "assigned_user_id": optional(j.assignedUserId),
        "status": .string(j.status.rawValue),
    ]
    if let startedAt = j.startedAt { row["started_at"] = .string(startedAt) }
    if let scheduledStart = j.scheduledStart { row["scheduled_start"] = .string(scheduledStart) }
    return row
}
