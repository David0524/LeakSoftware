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
    /// Some fields need fixing; `errors`, `planErrors` and `feeError` say which.
    case invalid
    /// Starting a plan needs a connection: the server makes its visits.
    case offline
    /// The server refused to start the plan.
    case server(String)

    public var description: String {
        switch self {
        case .notAllowed: NewJobForm.notAllowedMessage
        case .invalid: "Fix the highlighted fields."
        case .offline: NewJobForm.offlinePlanMessage
        case .server(let message): message
        }
    }
}

/// The New Job screen's state and its save, as the website's form (apps/web/src/components/
/// new-job-form.tsx): a customer (new, or an existing one and one of their pools or another
/// address), the pool, the visit (job type, when, tech, price), and the intake answers. Saving
/// writes the customer, property, job, and the job's checklist in one transaction, offline.
@MainActor @Observable
public final class NewJobForm {
    /// Who is it for?
    public enum Mode: String, CaseIterable, Sendable {
        case new, existing

        public var label: String { self == .new ? "New" : "Existing" }
    }

    public enum When: String, CaseIterable, Sendable {
        case scheduled, notYet

        public var label: String { self == .scheduled ? "Scheduled" : "Not Yet" }
    }

    /// A price book item for the Detection price select.
    public struct FeeItem: Identifiable, Hashable, Sendable {
        public var id: String
        public var name: String
        public var cents: Cents

        /// "Leak detection - pool ($375.00)"
        public var label: String { "\(name) ($\(dollarsText(cents)))" }
    }

    public nonisolated static let notAllowedMessage =
        "Your office makes new jobs. Ask an owner or admin to add this one."
    /// The Expo app's wording (the website is always online).
    public nonisolated static let offlinePlanMessage =
        "You’re offline. Starting a plan needs a connection; try again once you’re back online."
    /// Shown while offline, before Start Plan is tapped.
    public nonisolated static let offlinePlanNotice =
        "You’re offline. Starting a plan needs a connection, since the visits are made on the server."

    // MARK: - Context

    public let company: CompanyContext
    public let userId: String
    @ObservationIgnored private let sync: SyncService
    @ObservationIgnored private let now: () -> Date
    /// YYYY-MM-DD in the shop's time zone, fixed when the form opens.
    public let today: String
    public let tomorrow: String

    // MARK: - Fields

    /// Leak detection, a pool service visit, or a repair. Changing it resets Hours (`jobTypeChanged`).
    public var jobType: JobType
    public var mode: Mode = .new
    public private(set) var customerId: String?
    /// One of the chosen customer's properties, or nil for another address.
    public var propertyId: String?
    /// Name, phone, email, address, and schedule as typed. The date starts on today and the
    /// time on 9:00 AM, as the website's Start field does.
    public var input = NewJobInput()
    public var otherEmails = ""
    /// Intake answers by question key: a string, or an array of strings for a multi question.
    public private(set) var answers: [String: JSONValue] = [:]
    /// The price as typed.
    public var fee = ""
    /// Nil: "Not sure".
    public var poolType: PoolType?
    public var hasSpa = false
    public var shape: DiagramShape?
    public var accessNotes = ""
    public var when: When = .scheduled
    /// How long the visit takes, as typed (2 for a job, the shop's visit length for maintenance).
    public var hours: String
    /// The tech's user id, or nil for "Nobody yet".
    public var techId: String?
    /// A teammate's user id, or nil for none.
    public var secondTech: String?
    /// Notes for the tech ("What they said" on a repair).
    public var notes = ""
    /// From the Customer on a repair: the price book item they need, or nil for none picked.
    public private(set) var repairItemId: String?
    /// "Tue, Oct 20 at 9:00 AM with Tony Tech." after a suggestion fills the visit fields.
    public private(set) var picked: String?
    /// Maintenance for owners and admins: nil is Just once (a single visit), else a plan that
    /// repeats (the website's PlanRepeat menu).
    public var repeatChoice: PlanRepeat?
    /// The plan's days (Several Days), first visit, time, length and last visit. Its tech,
    /// price and notes are the form's own Tech, price and notes.
    public var plan: PlanDraft

    public private(set) var errors: [String: String] = [:]
    /// The plan's fields to fix: weekdays, startsOn, time, minutes, endsOn.
    public private(set) var planErrors: [String: String] = [:]
    public private(set) var feeError: String?
    /// "Enter the gallons as a number, like 20,000."
    public private(set) var gallonsError: String?
    /// Gallons as typed, per pool picked (the website keys the field by the pool, so picking
    /// another pool starts from that pool's gallons).
    private var gallonsTyped: [String: String] = [:]

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
        let type: JobType = company.services == .pool ? .maintenance : .detection
        jobType = type
        hours = NewJobForm.hours(for: type, settings: company.settings)
        plan = PlanDraft.new(today: today, settings: company.settings)
        input.scheduleDate = today
        input.scheduleTime = "09:00"
        // A tech who sees only their own jobs books them for themselves.
        techId = seesAllJobs(company.role, company.settings) ? nil : userId
    }

    // MARK: - What the screen shows

    /// Owners can stop techs making jobs (owner setting, 2026-10-18).
    public var canMakeJobs: Bool { SundeckCore.canMakeJobs(company.role, company.settings) }
    public var seesAll: Bool { seesAllJobs(company.role, company.settings) }
    public var jobTypes: [JobTypeOption] { newJobTypes(company.services) }
    public var isLeak: Bool { jobType == .detection }
    public var isMaintenance: Bool { jobType == .maintenance }
    /// Owners and admins can start a maintenance plan here (the server checks again).
    public var canPlan: Bool { isManagerRole(company.role) }
    /// The Repeats menu shows for maintenance when this person can start plans.
    public var showsRepeat: Bool { isMaintenance && canPlan }
    /// A plan that repeats rather than one visit: Start Plan, which needs a connection.
    public var isPlan: Bool { showsRepeat && repeatChoice != nil }
    public var questions: [BookingQuestion] { BookingQuestion.list(company.settings) }
    /// From the Customer on leak detection: Gallons and the booking questions (else a Notes card).
    public var showsBooking: Bool { isLeak }

    /// The title over what the customer said: a repair's and leak detection's (owner, 2026-10-19).
    public static let fromCustomerTitle = "From the Customer"

    // Gallons (owner, 2026-10-19: replaces "Size of the pool"), saved on the pool.

    /// Leak detection asks in From the Customer; other jobs in a new pool's card.
    public var gallonsInBooking: Bool { isLeak }
    public var gallonsInPool: Bool { !isLeak && newPool }
    public static let gallonsLabel = "Gallons (optional)"
    public static let gallonsHint = "Saved on the pool for the Chemical calculator."

    private var gallonsKey: String { newPool ? "new" : propertyId ?? "new" }
    /// The picked pool's gallons, on leak detection (a new pool has none yet).
    private var knownGallons: Int? {
        guard isLeak, !newPool else { return nil }
        return selectedProperty?["approx_gallons"]?.number.map { Int($0) }
    }

    /// "20,000": digits only, grouped as typed.
    public var gallons: String {
        get { gallonsTyped[gallonsKey] ?? knownGallons.map { gallonsInput(String($0)) } ?? "" }
        set { gallonsTyped[gallonsKey] = gallonsInput(newValue) }
    }

    /// The gallons to save on the pool, when the field shows and has one.
    private var gallonsValue: Int? {
        guard gallonsInBooking || gallonsInPool else { return nil }
        let text = trim(gallons)
        return text.isEmpty ? nil : parseGallons(text)
    }

    private var badGallons: Bool {
        (gallonsInBooking || gallonsInPool) && !trim(gallons).isEmpty && parseGallons(trim(gallons)) == nil
    }
    /// The subtitle under the large title.
    public var subtitle: String {
        company.services == .pool
            ? "A pool service visit, a plan that repeats, or a repair. Accepted quotes make their own repair jobs."
            : "Accepted quotes make their own repair jobs."
    }

    /// The shop's active people (for Tech and Second tech), the signed-in person first.
    public var team: [TeamMember] {
        _ = sync.revision
        return teamMembers(sync.store, kv: sync.kv, companyId: company.id, userId: userId).filter(\.active)
    }
    /// The Tech choices: just this person for a limited tech, else "Nobody yet" (nil) and everyone.
    public var techChoices: [String?] { seesAll ? [nil] + team.map(\.id) : [userId] }
    /// Second tech shows except on pool service visits.
    public var showsSecondTech: Bool { !isMaintenance }

    public func name(_ id: String?) -> String {
        guard let id else { return "Nobody yet" }
        return team.first { $0.id == id }?.name ?? sync.kv.team.first { $0.id == id }?.displayName ?? "Teammate"
    }

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
    public var selectedProperty: Row? { propertyId.flatMap { id in properties.first { $0.id == id } } }
    /// The Pool card shows for a new customer or another address.
    public var newPool: Bool { mode == .new || propertyId == nil }

    /// "Maria Lopez (602-555-0101 · maria@example.com)"
    public func customerLabel(_ c: Row) -> String {
        let detail = [c["phone"]?.string, c["email"]?.string].compactMap { $0 }.filter { !$0.isEmpty }
            .joined(separator: " · ")
        let name = c["name"]?.string ?? "Customer"
        return detail.isEmpty ? name : "\(name) (\(detail))"
    }

    /// The price book's active Detection items, in order.
    public var feeItems: [FeeItem] {
        rows("price_book_item")
            .filter { $0["active"]?.bool == true && $0["category"]?.string == "Detection" }
            .enumerated()
            .sorted { a, b in
                let (x, y) = (a.element["sort_order"]?.number ?? 0, b.element["sort_order"]?.number ?? 0)
                return x == y ? a.offset < b.offset : x < y
            }
            .compactMap { e in
                e.element["price_cents"]?.number.map {
                    FeeItem(id: e.element.id, name: e.element["name"]?.string ?? "Detection", cents: Int($0))
                }
            }
    }

    /// From the Customer (owner, 2026-10-19): the price book items the owner picked for booking a
    /// repair (Show when booking a repair), or every active item when none are picked yet.
    public var repairItems: [FeeItem] {
        let live = rows("price_book_item")
            .filter { $0["active"]?.bool == true && ($0["deleted_at"]?.string ?? "").isEmpty }
            .enumerated()
            .sorted { a, b in
                let (x, y) = (a.element["sort_order"]?.number ?? 0, b.element["sort_order"]?.number ?? 0)
                return x == y ? a.offset < b.offset : x < y
            }
            .map(\.element)
        let picked = live.filter { $0["on_repair_call"]?.bool == true }
        return (picked.isEmpty ? live : picked).compactMap { row in
            row["price_cents"]?.number.map {
                FeeItem(id: row.id, name: row["name"]?.string ?? "Item", cents: Int($0))
            }
        }
    }

    /// From the Customer shows the repair menu on a repair.
    public var showsRepairCall: Bool { jobType == .repair }
    public var repairItem: FeeItem? { repairItemId.flatMap { id in repairItems.first { $0.id == id } } }

    /// Picking what they need fills in the Price; "Pick from the price book…" keeps it.
    public func pickRepairItem(_ item: FeeItem?) {
        repairItemId = item?.id
        if let item { fee = dollarsText(item.cents) }
    }

    /// The price field's label and hint.
    public var feeLabel: String { isPlan ? "Price per month ($)" : isLeak ? "Detection fee ($)" : "Price ($)" }
    public var feeHint: String {
        isMaintenance
            ? "Billed monthly with the customer's other visits."
            : isLeak
                ? "Shown on the report and billed on the invoice."
                : "Billed on the invoice. Add parts there before sending."
    }

    /// Anything typed or picked yet? Then leaving asks first.
    public var isDirty: Bool {
        let typed = [
            input.customerName, input.customerPhone, input.customerEmail, input.addressLine1, input.city,
            input.state, input.postalCode, accessNotes, otherEmails, fee, notes,
        ]
        return customerId != nil || shape != nil || !answers.isEmpty || repairItemId != nil
            || typed.contains { !trim($0).isEmpty } || gallonsTyped.values.contains { !$0.isEmpty }
            || input.scheduleDate != today || input.scheduleTime != "09:00" || repeatChoice != nil
    }

    public var saveTitle: String { isPlan ? "Start Plan" : "Create Job" }

    /// The First visit field's hint for the repeat chosen.
    public var firstVisitHintText: String { firstVisitHint(repeatChoice ?? .weekly, long: false) }

    // MARK: - Changes

    /// Picks an existing customer; their only pool is picked too.
    public func selectCustomer(_ id: String?) {
        customerId = id
        let theirs = properties.filter { $0["customer_id"]?.string == id }
        propertyId = theirs.count == 1 ? theirs[0].id : nil
    }

    /// Back to no customer picked.
    public func changeCustomer() {
        customerId = nil
        propertyId = nil
    }

    /// After the job type changes: Hours goes back to that type's default, as on the website.
    public func jobTypeChanged() { hours = defaultHours }

    /// Detection price: fills the fee from the price book.
    public func pickFee(_ item: FeeItem) { fee = dollarsText(item.cents) }

    /// Suggest Times: fills the date, start and tech from a suggestion.
    public func use(_ s: Suggestion) {
        when = .scheduled
        input.scheduleDate = s.slot.date
        input.scheduleTime = minutesToClock(s.slot.startMin)
        techId = s.slot.techId
        picked = "\(s.dayLabel) at \(s.timeLabel) with \(s.slot.techName)."
    }

    public func answer(_ key: String) -> String { answers[key]?.string ?? "" }

    public func setAnswer(_ key: String, _ value: String) {
        if value.isEmpty { answers[key] = nil } else { answers[key] = .string(value) }
    }

    public func isPicked(_ key: String, _ option: String) -> Bool {
        (answers[key]?.array ?? []).contains(.string(option))
    }

    /// Ticks or unticks one option of a multi question (ticked ones keep their order).
    public func setPicked(_ key: String, _ option: String, _ on: Bool) {
        var list = (answers[key]?.array ?? []).filter { $0 != .string(option) }
        if on { list.append(.string(option)) }
        answers[key] = list.isEmpty ? nil : .array(list)
    }

    // MARK: - Saving

    /// Checks the fields and sets `errors` and `feeError`. True when the job can be saved.
    @discardableResult
    public func validate() -> Bool {
        let checked = checkedInput()
        var e = validateNewJob(checked)
        if mode == .existing && customerId == nil { e["customer"] = "Pick a customer." }
        planErrors = [:]
        if isPlan, case .failure(let problems) = planDraft.check(endsMessage: "End on or after the first visit.") {
            // The price is the form's own, checked below with New Job's wording.
            planErrors = problems.fields.filter { $0.key != "price" }
        }
        if when == .scheduled && !isPlan {
            if checked.scheduleDate.isEmpty { e["scheduleDate"] = "Pick a date." }
            if hoursValue == nil { e["hours"] = "Enter 0.5 to 24 hours." }
        }
        if !seesAll && techId != userId { e["tech"] = "Book the job for yourself." }
        if let secondTech, showsSecondTech, secondTech == techId {
            e["secondTech"] = "Pick someone other than the main tech."
        }
        errors = e
        feeError = badFee ? "Enter a price like 649." : nil
        gallonsError = badGallons ? "Enter the gallons as a number, like 20,000." : nil
        return e.isEmpty && planErrors.isEmpty && !badFee && !badGallons
    }

    /// Starts a maintenance plan, with a new customer and pool if needed, in one step on the
    /// server (create_service_plan, as the website's New Job): the server makes its visits, so
    /// this needs a connection. Returns the customer's id; sync next to bring the rows here.
    public func startPlan(_ rpc: any RPCClient) async throws -> String {
        guard canMakeJobs, canPlan else { throw NewJobFormError.notAllowed }
        guard validate() else { throw NewJobFormError.invalid }
        let checked = checkedInput()
        let records = try newJobRecords(
            checked,
            NewJobDetails(
                poolType: poolType, hasSpa: hasSpa, accessNotes: accessNotes, timing: .later,
                assignedUserId: nil, jobType: .maintenance))
        guard case .success(let values) = planDraft.check(endsMessage: "End on or after the first visit.") else {
            throw NewJobFormError.invalid
        }
        let newCustomer: JSONValue =
            records.customer.map { c in
                [
                    "name": .string(c.name), "phone": optional(c.phone), "email": optional(c.email),
                    "cc_emails": .array(splitEmails(otherEmails).map { .string($0) }),
                ]
            } ?? .null
        let newProperty: JSONValue =
            records.property.map { p in
                [
                    "address_line1": .string(p.addressLine1), "city": optional(p.city),
                    "state": optional(p.state?.uppercased()), "postal_code": optional(p.postalCode),
                    "pool_type": optional(p.poolType?.rawValue), "has_spa": .bool(p.hasSpa),
                    "access_notes": optional(p.accessNotes),
                ]
            } ?? .null
        let arguments: JSONValue = [
            "target_company": .string(company.id), "new_customer": newCustomer,
            "existing_customer": optional(checked.customerId), "new_property": newProperty,
            "existing_property": optional(checked.propertyId), "plan": .object(values),
        ]
        let reply: JSONValue
        do {
            reply = try await rpc.call("create_service_plan", arguments)
        } catch {
            let message = String(describing: error)
            if error is URLError || isNetworkFailure(message) {
                throw NewJobFormError.offline
            }
            throw NewJobFormError.server(message)
        }
        guard let customer = reply["customer"]?.string ?? checked.customerId else {
            throw NewJobFormError.server("The plan started, but the customer couldn’t be opened. Pull to refresh.")
        }
        // The pool's gallons (create_service_plan doesn't take them) go on once the sync after
        // this brings the pool down: `savePlanGallons()`.
        planGallons = gallonsValue.map {
            PlanGallons(
                property: reply["property"]?.string ?? checked.propertyId, customer: customer,
                address: trim(checked.addressLine1), gallons: $0)
        }
        return customer
    }

    /// Gallons waiting for a started plan's pool to reach this phone.
    struct PlanGallons {
        var property: String?
        var customer: String
        var address: String
        var gallons: Int
    }
    private var planGallons: PlanGallons?

    /// After the sync that follows Start Plan: writes the gallons on the plan's pool through the
    /// sync layer, once that pool's row is on this phone (never a partial row), as the Expo app
    /// does. Returns whether they were saved.
    @discardableResult
    public func savePlanGallons() -> Bool {
        guard let pending = planGallons else { return false }
        let pools = properties
        let pool =
            pending.property.flatMap { id in pools.first { $0.id == id } }
            ?? pools.first {
                $0["customer_id"]?.string == pending.customer && $0["address_line1"]?.string == pending.address
            }
        guard let pool else { return false }
        planGallons = nil
        do {
            try sync.write(
                "property", id: pool.id, companyId: company.id, ["approx_gallons": .number(Double(pending.gallons))])
            return true
        } catch {
            return false
        }
    }

    /// The plan's fields with the form's own tech, price and notes.
    private var planDraft: PlanDraft {
        var draft = plan
        draft.repeats = repeatChoice ?? .weekly
        draft.tech = seesAll ? techId : userId
        draft.price = fee
        draft.notes = notes
        return draft
    }

    /// Saves the customer (if new), property (if new), job, and its checklist together, or
    /// nothing. Returns the new job's id.
    public func save() throws -> String {
        guard canMakeJobs else { throw NewJobFormError.notAllowed }
        guard validate() else { throw NewJobFormError.invalid }
        let checked = checkedInput()
        let timing: JobTiming =
            when == .scheduled
            ? .scheduled(date: checked.scheduleDate, time: checked.scheduleTime, timeZone: company.timeZone) : .later
        let records = try newJobRecords(
            checked,
            NewJobDetails(
                poolType: poolType, hasSpa: hasSpa, accessNotes: accessNotes, timing: timing,
                assignedUserId: seesAll ? techId : userId, jobType: jobType))
        let feeCents = trim(fee).isEmpty ? nil : parseDollars(fee)
        let componentTypes = rows("component_type").compactMap { try? JSONValue.object($0).decode(ComponentType.self) }
        let existingProperty = mode == .existing ? selectedProperty : nil
        let store = sync.store
        let companyId = company.id
        let customerId = mode == .existing ? self.customerId : nil
        let propertyId = existingProperty?.id
        let jobType = self.jobType
        let (shape, hasSpa, poolType, answers) = (self.shape, self.hasSpa, self.poolType, self.answers)
        let secondTech = showsSecondTech ? self.secondTech : nil
        let ccEmails = splitEmails(otherEmails)
        let notes = trim(self.notes)
        let leak = isLeak
        // From the Customer: the item's name, kept with the job (website `intake.repair_item`).
        let gallons = gallonsValue
        let repairName = jobType == .repair ? repairItem?.name : nil
        let end: String? = records.job.scheduledStart.flatMap(parseInstant).flatMap { start in
            hoursValue.map { isoString(start.addingTimeInterval($0 * 3600)) }
        }

        // Customer, property, job, and its checklist are saved together or not at all.
        return try sync.batch {
            let customer =
                try customerId
                ?? store.insert("customer", companyId: companyId, customerRow(records.customer, ccEmails))
            var newProperty = propertyRow(records.property, customer: customer, shape)
            if let gallons { newProperty["approx_gallons"] = .number(Double(gallons)) }
            let property = try propertyId ?? store.insert("property", companyId: companyId, newProperty)
            // Gallons typed for an existing pool are saved on it; blank keeps what it has.
            if let propertyId, let gallons, existingProperty?["approx_gallons"]?.number != Double(gallons) {
                try store.write(
                    "property", id: propertyId, companyId: companyId, ["approx_gallons": .number(Double(gallons))])
            }
            var job = jobRow(records.job)
            job["property_id"] = .string(property)
            job["bill_to_customer_id"] = .string(customer)
            if let end { job["scheduled_end"] = .string(end) }
            job["fee_cents"] = feeCents.map { .number(Double($0)) } ?? .null
            job["second_tech_id"] = secondTech.map { .string($0) } ?? .null
            // Intake answers belong to leak detection.
            if let repairName {
                job["intake"] = .object([repairItemKey: .string(repairName)])
            } else {
                job["intake"] = leak && !answers.isEmpty ? .object(answers) : .null
            }
            job["summary_notes"] = notes.isEmpty ? .null : .string(notes)
            let jobId = try store.insert("job", companyId: companyId, job)

            // The checklist is ready the moment the job opens, even offline.
            let spa = existingProperty.map { $0["has_spa"]?.bool ?? false } ?? hasSpa
            let type: JSONValue =
                existingProperty.map { $0["pool_type"] ?? .null } ?? (poolType.map { .string($0.rawValue) } ?? .null)
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

    private static func hours(for type: JobType, settings: JSONValue) -> String {
        guard type == .maintenance else { return "2" }
        let minutes = settings["maintenance"]?["visit_minutes"]?.number ?? 30
        let h = minutes / 60
        return h == h.rounded() ? String(Int(h)) : String(h)
    }

    private var defaultHours: String { NewJobForm.hours(for: jobType, settings: company.settings) }

    /// The hours as a number, when it's one between 0 and 24.
    private var hoursValue: Double? {
        guard let h = Double(trim(hours).replacingOccurrences(of: ",", with: ".")), h > 0, h <= 24 else { return nil }
        return h
    }

    /// The input as saved: the picked customer and pool, and a schedule only when scheduling.
    private func checkedInput() -> NewJobInput {
        var checked = input
        checked.customerId = mode == .existing ? customerId : nil
        checked.propertyId = mode == .existing ? propertyId : nil
        // A plan has no When: its visits come from the plan's dates.
        if when != .scheduled || isPlan {
            checked.scheduleDate = ""
            checked.scheduleTime = ""
        }
        return checked
    }

    private var badFee: Bool {
        guard !trim(fee).isEmpty else { return false }
        guard let cents = parseDollars(fee) else { return true }
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

/// A network failure, as opposed to the server saying no.
private func isNetworkFailure(_ message: String) -> Bool {
    message.firstMatch(
        of:
            /(?i)network|offline|timed? ?out|could not connect|internet connection|NSURLErrorDomain|URLError|no connection/
    ) != nil
}

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

/// Gallons as they're typed: digits only (7 at most), grouped like "20,000" (website GallonsField).
public func gallonsInput(_ typed: String) -> String {
    let digits = String(typed.filter(\.isASCII).filter(\.isNumber).prefix(7))
    guard let n = Int(digits) else { return "" }
    let f = NumberFormatter()
    f.locale = Locale(identifier: "en_US")
    f.numberStyle = .decimal
    return f.string(from: NSNumber(value: n)) ?? digits
}
