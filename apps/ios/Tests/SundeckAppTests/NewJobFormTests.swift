import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// The New Job form: validation, and the rows it saves in one transaction. Port of the behavior
/// of apps/mobile/src/app/(app)/jobs/new.tsx.
@MainActor @Suite struct NewJobFormTests {
    struct NoAuth: AuthBackend {
        func currentSession() async -> SignInResult? { nil }
        func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("offline") }
        func signUp(name: String, email: String, password: String) async throws -> Bool { false }
        func verifyCode(_ code: String) async throws {}
        func refresh() async throws {}
        func signOut() async {}
    }

    /// The form never syncs; any call fails the test.
    struct NeverTransport: SyncTransport {
        func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
            Issue.record("push called")
            throw SyncFailure("offline")
        }
        func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
            Issue.record("pull called")
            throw SyncFailure("offline")
        }
        func scope() async throws -> String? { nil }
    }

    static let company = "00000000-0000-4000-8000-0000000000c1"
    static let me = "00000000-0000-4000-8000-0000000000a1"
    static let teammate = "00000000-0000-4000-8000-0000000000a2"
    /// 2027-01-15T08:00:00Z, 1:00 AM in Phoenix.
    static let now = Date(timeIntervalSince1970: 1_800_000_000)

    static let questions: JSONValue = [
        [
            "key": "reason", "label": "Why they called", "type": "multi",
            "options": ["Pool water level dropping", "Other"],
        ],
        [
            "key": "pool_size", "label": "Size of the pool", "type": "single",
            "options": ["Normal", "Larger than normal"],
        ],
        ["key": "spa_size", "label": "Spa size or dimensions", "type": "text"],
    ]

    let sync: SyncService

    init() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("newjob-\(UUID()).db").path
        let database = try Database(path: path, key: String(repeating: "4d", count: 32))
        let store = try LocalStore.open(database)
        sync = SyncService(store: store, kv: try KeyValue(database), transport: NeverTransport(), auth: NoAuth())
        try seedServerRows()
    }

    /// Config rows as the server sends them (defaults from the company-setup migrations).
    func seedServerRows() throws {
        func componentType(
            _ n: Int, _ key: String, _ name: String, section: String, answer: String = "leak",
            jobType: JSONValue = .null,
            poolType: JSONValue = .null, multiple: Bool = false, appliesTo: String, sort: Int
        ) -> Row {
            [
                "id": .string("00000000-0000-4000-8000-00000000010\(n)"), "company_id": .string(Self.company),
                "deleted_at": nil, "key": .string(key), "name": .string(name), "section": .string(section),
                "answer": .string(answer), "job_type": jobType, "applies_to_pool_type": poolType,
                "on_schedule": false, "allows_multiple": .bool(multiple), "default_count": 1,
                "applies_to": .string(appliesTo), "methods": ["Visual"], "sort_order": .number(Double(sort)),
                "active": true, "created_at": "2026-10-12T00:00:00Z", "updated_at": "2026-10-12T00:00:00Z",
            ]
        }
        func price(_ n: Int, _ name: String, cents: Int, sort: Int) -> Row {
            [
                "id": .string("00000000-0000-4000-8000-00000000020\(n)"), "company_id": .string(Self.company),
                "deleted_at": nil, "name": .string(name), "category": "Detection", "component_type_key": nil,
                "unit": "each", "price_cents": .number(Double(cents)), "taxable": false, "warranty_months": nil,
                "sort_order": .number(Double(sort)), "active": true,
            ]
        }
        let types = [
            componentType(1, "equipment_area", "Equipment area", section: "visual", appliesTo: "both", sort: 10),
            componentType(
                2, "vinyl_stretched", "If vinyl, is vinyl stretched?", section: "visual", answer: "yes_no",
                poolType: "vinyl", appliesTo: "pool", sort: 40),
            componentType(3, "return", "Returns", section: "plumbing", multiple: true, appliesTo: "pool", sort: 100),
            componentType(4, "spa", "Spa jets", section: "plumbing", appliesTo: "spa", sort: 210),
            componentType(
                5, "svc_skim", "Skim surface", section: "service", answer: "done", jobType: "maintenance",
                appliesTo: "both", sort: 500),
        ]
        // Listed out of order: the form sorts by sort_order.
        let prices = [
            price(2, "Leak detection - pool and spa", cents: 45000, sort: 20),
            price(1, "Leak detection - pool", cents: 37500, sort: 10),
        ]
        let rows =
            types.map { PulledRow(table: "component_type", xid: "1", row: $0) }
            + prices.map { PulledRow(table: "price_book_item", xid: "1", row: $0) }
        try sync.store.applyPage(
            PullPage(rows: rows, done: true, cursor: [:], serverHLC: "1800000000000-0000-server"))
    }

    func seedCustomer(spa: Bool) throws -> (customer: String, property: String) {
        let customer = "00000000-0000-4000-8000-000000000301"
        let property = "00000000-0000-4000-8000-000000000401"
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "customer", xid: "2",
                        row: [
                            "id": .string(customer), "company_id": .string(Self.company), "kind": "homeowner",
                            "name": "Maria Lopez", "phone": "602-555-0101", "email": "maria@example.com",
                            "deleted_at": nil,
                        ]),
                    PulledRow(
                        table: "property", xid: "2",
                        row: [
                            "id": .string(property), "company_id": .string(Self.company),
                            "customer_id": .string(customer), "address_line1": "1423 Palm Ct", "city": "Phoenix",
                            "state": "AZ", "postal_code": "85016", "pool_type": nil, "has_pool": true,
                            "has_spa": .bool(spa), "deleted_at": nil,
                        ]),
                ], done: true, cursor: [:], serverHLC: "1800000000001-0000-server"))
        return (customer, property)
    }

    func form(role: String = "owner", settings: JSONValue = [:]) -> NewJobForm {
        NewJobForm(
            sync: sync,
            company: CompanyContext(
                id: Self.company, name: "Desert Leak", timeZone: "America/Phoenix", settings: settings, role: role),
            userId: Self.me, now: { Self.now })
    }

    func list(_ table: String) throws -> [Row] { try sync.store.list(table, companyId: Self.company) }

    /// A job's checklist items in checklist order (ids made in the same millisecond aren't ordered).
    func components(_ jobId: String) throws -> [Row] {
        try sync.store.list("job_component", jobId: jobId).sorted {
            ($0["sort_order"]?.number ?? 0) < ($1["sort_order"]?.number ?? 0)
        }
    }

    // MARK: - Validation

    @Test func showsTheSameMessagesAsTheExpoForm() throws {
        let f = form()
        #expect(f.feeText == "375.00")
        #expect(throws: NewJobFormError.invalid) { try f.save() }
        #expect(
            f.errors == ["customerName": "Enter the customer's name.", "addressLine1": "Enter the street address."])

        f.input.customerName = "Maria"
        f.input.customerEmail = "maria@"
        f.input.addressLine1 = "1 Main St"
        f.when = .scheduled
        f.input.scheduleTime = "25:00"
        f.fee = "abc"
        #expect(!f.validate())
        #expect(
            f.errors == [
                // "Pick a date for this time." gives way to the form's own "Pick a date.", as in Expo.
                "customerEmail": "Check the email address.", "scheduleDate": "Pick a date.",
                "scheduleTime": "Use 24-hour time, like 09:30 or 14:00.",
            ])
        #expect(f.feeError == "Enter a price like 649.")

        f.input.scheduleTime = ""
        f.input.scheduleDate = "2027-1-5"
        f.fee = "-5"
        #expect(!f.validate())
        #expect(f.errors["scheduleDate"] == "Use the format YYYY-MM-DD.")
        #expect(f.feeError == "Enter a price like 649.")

        // A schedule without a date.
        f.input.scheduleDate = ""
        #expect(!f.validate())
        #expect(f.errors["scheduleDate"] == "Pick a date.")

        // A schedule typed and then switched to Later is ignored; a blank fee is fine.
        f.input.scheduleDate = "bad"
        f.when = .later
        f.input.customerEmail = "maria@example.com"
        f.fee = ""
        #expect(f.validate())
        #expect(f.errors.isEmpty && f.feeError == nil)
        #expect(try list("job").isEmpty)
    }

    @Test func knowsWhenAnythingWasEntered() {
        let f = form()
        #expect(!f.isDirty)
        f.input.city = "  "
        #expect(!f.isDirty)
        f.setPicked("reason", "Other", true)
        #expect(f.isDirty)
    }

    // MARK: - Saving

    @Test func newCustomerAndAddressStartedNowSaveTogether() throws {
        let f = form()
        f.input.customerName = "  Maria Lopez "
        f.input.customerPhone = "602-555-0101"
        f.input.customerEmail = "maria@example.com"
        f.otherEmails = "a@x.com, nope b@y.com"
        f.input.addressLine1 = "1423 Palm Ct"
        f.input.city = "Phoenix"
        f.input.state = "az"
        f.input.postalCode = "85016"
        f.shape = .kidney
        f.accessNotes = "Gate code 1234"
        #expect(f.saveTitle == "Create and Start Job")
        let before = sync.revision

        let jobId = try f.save()

        // One batch: the sync service saw one change.
        #expect(sync.revision == before + 1)
        let customers = try list("customer")
        let properties = try list("property")
        #expect(customers.count == 1 && properties.count == 1)
        let customer = customers[0]
        #expect(customer["name"] == "Maria Lopez")
        #expect(customer["kind"] == "homeowner")
        #expect(customer["phone"] == "602-555-0101")
        #expect(customer["cc_emails"] == ["a@x.com", "b@y.com"])
        let property = properties[0]
        #expect(property["customer_id"] == .string(customer.id))
        #expect(property["state"] == "AZ")
        #expect(property["pool_type"] == "gunite_plaster")
        #expect(property["has_spa"] == false)
        #expect(property["diagram_shape"] == "kidney")
        #expect(property["access_notes"] == "Gate code 1234")

        let job = try #require(try sync.store.get("job", jobId))
        #expect(job["type"] == "detection")
        #expect(job["status"] == "in_progress")
        #expect(job["started_at"] == "2027-01-15T08:00:00.000Z")
        #expect(job["assigned_user_id"] == .string(Self.me))
        #expect(job["property_id"] == .string(property.id))
        #expect(job["bill_to_customer_id"] == .string(customer.id))
        #expect(job["fee_cents"] == 37500)
        #expect(job["second_tech_id"] == .null)
        #expect(job["intake"] == [:])

        // Gunite pool, no spa: equipment area and returns; no vinyl, spa, or service items.
        let components = try components(jobId)
        #expect(components.map { $0["label"] } == ["Equipment area", "Returns"])
        #expect(components.map { $0["sort_order"] } == [1001, 10001])
        #expect(components.allSatisfy { $0["instance_number"] == 1 })
        let results = try sync.store.list("checklist_item_result", jobId: jobId)
        #expect(results.count == 2)
        #expect(Set(results.compactMap { $0["job_component_id"]?.string }) == Set(components.map(\.id)))
        #expect(results.allSatisfy { $0["status"] == "pending" })
        // customer, property, job, 2 components, 2 results.
        #expect(sync.status.pending == 7)
    }

    @Test func reusesAnExistingCustomerAndTheirOnlyPool() throws {
        let (customer, property) = try seedCustomer(spa: true)
        let f = form()
        f.search = "maria"
        #expect(f.matches.map(\.id) == [customer])
        f.selectCustomer(customer)
        #expect(f.search.isEmpty)
        #expect(f.propertyId == property)
        #expect(f.isDirty)
        // A pool with a spa suggests the pool-and-spa price.
        #expect(f.feeText == "450.00")
        f.when = .scheduled
        f.input.scheduleDate = f.tomorrow
        f.input.scheduleTime = "09:30"
        #expect(f.saveTitle == "Create Job")

        let jobId = try f.save()

        #expect(try list("customer").count == 1)
        #expect(try list("property").count == 1)
        let job = try #require(try sync.store.get("job", jobId))
        #expect(job["property_id"] == .string(property))
        #expect(job["bill_to_customer_id"] == .string(customer))
        #expect(job["status"] == "scheduled")
        #expect(job["scheduled_start"] == "2027-01-16T16:30:00.000Z")
        #expect(job["fee_cents"] == 45000)
        // The pool's type is unknown, so the vinyl check stays; it has a spa.
        let labels = try components(jobId).compactMap { $0["label"]?.string }
        #expect(labels == ["Equipment area", "If vinyl, is vinyl stretched?", "Returns", "Spa jets"])
        // Only the new job and its checklist were written.
        #expect(sync.status.pending == 9)
    }

    @Test func leakDetectionSavesTheFeeAndBookingAnswers() throws {
        sync.kv.setTeam([
            TeamProfile(id: Self.me, fullName: "Me", email: nil),
            TeamProfile(id: Self.teammate, fullName: "Sam", email: nil),
        ])
        let f = form(settings: ["intake_questions": Self.questions])
        #expect(f.showsBooking)
        #expect(f.questions.map(\.kind) == [.multi, .single, .text])
        #expect(f.team.map(\.id) == [Self.teammate])
        #expect(f.showsSecondTech)
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        f.setPicked("reason", "Other", true)
        f.setPicked("reason", "Pool water level dropping", true)
        f.setPicked("reason", "Other", false)
        f.setAnswer("pool_size", "Normal")
        f.setAnswer("spa_size", "6x6")
        f.fee = "$649"
        f.secondTech = Self.teammate
        f.when = .later

        let job = try #require(try sync.store.get("job", f.save()))
        #expect(job["status"] == "unscheduled")
        #expect(job["fee_cents"] == 64900)
        #expect(job["second_tech_id"] == .string(Self.teammate))
        #expect(
            job["intake"] == ["reason": ["Pool water level dropping"], "pool_size": "Normal", "spa_size": "6x6"])
    }

    @Test func poolServiceLeavesFeeIntakeAndSecondTechOff() throws {
        sync.kv.setTeam([TeamProfile(id: Self.teammate, fullName: "Sam", email: nil)])
        let f = form(settings: ["services": "pool", "intake_questions": Self.questions])
        #expect(f.jobType == .maintenance)
        #expect(f.jobTypes.map(\.label) == ["Pool Service", "Repair"])
        #expect(!f.showsBooking)
        #expect(!f.showsSecondTech)
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        f.setAnswer("pool_size", "Normal")
        f.fee = "not a price"
        f.secondTech = Self.teammate

        let jobId = try f.save()
        let job = try #require(try sync.store.get("job", jobId))
        #expect(job["type"] == "maintenance")
        #expect(job["fee_cents"] == .null)
        #expect(job["intake"] == [:])
        #expect(job["second_tech_id"] == .null)
        let labels = try components(jobId).compactMap { $0["label"]?.string }
        #expect(labels == ["Skim surface"])
    }

    @Test func aTechWhoSeesOnlyTheirJobsIsAlwaysAssigned() throws {
        let f = form(role: "tech", settings: ["techs_see_all_jobs": false])
        #expect(!f.seesAll)
        f.assignToMe = false
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        let job = try #require(try sync.store.get("job", f.save()))
        #expect(job["assigned_user_id"] == .string(Self.me))

        let owner = form()
        owner.assignToMe = false
        owner.input.customerName = "Ana"
        owner.input.addressLine1 = "2 Main St"
        let unassigned = try #require(try sync.store.get("job", owner.save()))
        #expect(unassigned["assigned_user_id"] == .null)
    }

    @Test func aTechWhoCantMakeJobsIsRefused() throws {
        let f = form(role: "tech", settings: ["techs_make_jobs": false])
        #expect(!f.canMakeJobs)
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        #expect(throws: NewJobFormError.notAllowed) { try f.save() }
        #expect(try list("customer").isEmpty)
        #expect(try list("job").isEmpty)
        #expect(sync.status.pending == 0)
        // Owners and admins always can.
        #expect(form(role: "admin", settings: ["techs_make_jobs": false]).canMakeJobs)
    }
}
