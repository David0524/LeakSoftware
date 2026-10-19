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

    @Test func showsTheWebsitesMessages() throws {
        let f = form()
        // The website's form: no price until one is picked, scheduled today at 9:00 AM for 2 hours.
        #expect(f.fee.isEmpty)
        #expect(f.when == .scheduled && f.input.scheduleDate == f.today && f.input.scheduleTime == "09:00")
        #expect(f.hours == "2")
        #expect(f.techId == nil)
        #expect(!f.isDirty)
        #expect(throws: NewJobFormError.invalid) { try f.save() }
        #expect(
            f.errors == ["customerName": "Enter the customer's name.", "addressLine1": "Enter the street address."])

        f.input.customerName = "Maria"
        f.input.customerEmail = "maria@"
        f.input.addressLine1 = "1 Main St"
        f.input.scheduleTime = "25:00"
        f.hours = "0"
        f.fee = "abc"
        #expect(!f.validate())
        #expect(
            f.errors == [
                "customerEmail": "Check the email address.", "scheduleTime": "Use 24-hour time, like 09:30 or 14:00.",
                "hours": "Enter 0.5 to 24 hours.",
            ])
        #expect(f.feeError == "Enter a price like 649.")

        f.input.scheduleTime = "09:00"
        f.hours = "2"
        f.input.scheduleDate = ""
        f.fee = "-5"
        #expect(!f.validate())
        #expect(f.errors["scheduleDate"] == "Pick a date.")
        #expect(f.feeError == "Enter a price like 649.")

        // Not Yet ignores the schedule; a blank fee is fine.
        f.when = .notYet
        f.input.customerEmail = "maria@example.com"
        f.fee = ""
        #expect(f.validate())
        #expect(f.errors.isEmpty && f.feeError == nil)

        // Existing needs a customer picked.
        f.mode = .existing
        #expect(!f.validate())
        #expect(f.errors["customer"] == "Pick a customer.")
        #expect(try list("job").isEmpty)
    }

    @Test func knowsWhenAnythingWasEntered() {
        let f = form()
        #expect(!f.isDirty)
        f.input.city = "  "
        #expect(!f.isDirty)
        f.setPicked("reason", "Other", true)
        #expect(f.isDirty)
        f.setPicked("reason", "Other", false)
        #expect(!f.isDirty)
        f.input.scheduleTime = "10:00"
        #expect(f.isDirty)
    }

    // MARK: - Saving

    @Test func newCustomerAndPoolScheduledSaveTogether() throws {
        let f = form()
        f.input.customerName = "  Maria Lopez "
        f.input.customerPhone = "602-555-0101"
        f.input.customerEmail = "maria@example.com"
        f.otherEmails = "a@x.com, nope b@y.com"
        f.input.addressLine1 = "1423 Palm Ct"
        f.input.city = "Phoenix"
        f.input.state = "az"
        f.input.postalCode = "85016"
        f.poolType = .gunitePlaster
        f.shape = .kidney
        f.accessNotes = "Gate code 1234"
        f.input.scheduleDate = f.tomorrow
        f.hours = "1.5"
        f.notes = "Call first"
        let item = try #require(f.feeItems.first)
        #expect(
            f.feeItems.map(\.label) == ["Leak detection - pool ($375.00)", "Leak detection - pool and spa ($450.00)"])
        f.pickFee(item)
        #expect(f.fee == "375.00")
        #expect(f.saveTitle == "Create Job")
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
        #expect(job["status"] == "scheduled")
        // 9:00 AM in Phoenix tomorrow, for an hour and a half.
        #expect(job["scheduled_start"] == "2027-01-16T16:00:00.000Z")
        #expect(job["scheduled_end"] == "2027-01-16T17:30:00.000Z")
        #expect(job["assigned_user_id"] == .null)
        #expect(job["property_id"] == .string(property.id))
        #expect(job["bill_to_customer_id"] == .string(customer.id))
        #expect(job["fee_cents"] == 37500)
        #expect(job["second_tech_id"] == .null)
        #expect(job["intake"] == .null)
        #expect(job["summary_notes"] == "Call first")

        // Gunite pool, no spa: equipment area and returns; no vinyl, spa, or service items.
        let components = try components(jobId)
        #expect(components.map { $0["label"] } == ["Equipment area", "Returns"])
        let results = try sync.store.list("checklist_item_result", jobId: jobId)
        #expect(results.count == 2)
        #expect(results.allSatisfy { $0["status"] == "pending" })
        // customer, property, job, 2 components, 2 results.
        #expect(sync.status.pending == 7)
    }

    @Test func reusesAnExistingCustomerAndTheirOnlyPool() throws {
        let (customer, property) = try seedCustomer(spa: true)
        let f = form()
        f.mode = .existing
        #expect(f.customerLabel(try #require(f.customers.first)) == "Maria Lopez (602-555-0101 · maria@example.com)")
        f.selectCustomer(customer)
        #expect(f.propertyId == property)
        #expect(!f.newPool)
        #expect(f.isDirty)
        f.input.scheduleDate = f.tomorrow
        f.input.scheduleTime = "09:30"

        let jobId = try f.save()

        #expect(try list("customer").count == 1)
        #expect(try list("property").count == 1)
        let job = try #require(try sync.store.get("job", jobId))
        #expect(job["property_id"] == .string(property))
        #expect(job["bill_to_customer_id"] == .string(customer))
        #expect(job["status"] == "scheduled")
        #expect(job["scheduled_start"] == "2027-01-16T16:30:00.000Z")
        // The pool's type is unknown, so the vinyl check stays; it has a spa.
        let labels = try components(jobId).compactMap { $0["label"]?.string }
        #expect(labels == ["Equipment area", "If vinyl, is vinyl stretched?", "Returns", "Spa jets"])
        // Only the new job and its checklist were written.
        #expect(sync.status.pending == 9)

        // Another address makes a new pool for the same customer.
        let g = form()
        g.mode = .existing
        g.selectCustomer(customer)
        g.propertyId = nil
        #expect(g.newPool)
        g.input.addressLine1 = "9 Other St"
        g.when = .notYet
        let other = try #require(try sync.store.get("job", g.save()))
        #expect(try list("customer").count == 1)
        #expect(try list("property").count == 2)
        #expect(other["bill_to_customer_id"] == .string(customer))
        #expect(other["status"] == "unscheduled")
    }

    @Test func leakDetectionSavesTheFeeAndIntakeAnswers() throws {
        try seedTeam()
        let f = form(settings: ["intake_questions": Self.questions])
        #expect(f.showsBooking)
        #expect(f.questions.map(\.kind) == [.multi, .single, .text])
        #expect(f.team.map(\.id) == [Self.me, Self.teammate])
        #expect(f.techChoices == [nil, Self.me, Self.teammate])
        #expect(f.showsSecondTech)
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        f.setPicked("reason", "Other", true)
        f.setPicked("reason", "Pool water level dropping", true)
        f.setPicked("reason", "Other", false)
        f.setAnswer("pool_size", "Normal")
        f.setAnswer("spa_size", "6x6")
        f.fee = "$649"
        f.techId = Self.me
        f.secondTech = Self.me
        f.when = .notYet
        #expect(!f.validate())
        #expect(f.errors["secondTech"] == "Pick someone other than the main tech.")
        f.secondTech = Self.teammate

        let job = try #require(try sync.store.get("job", f.save()))
        #expect(job["status"] == "unscheduled")
        #expect(job["scheduled_start"] == nil || job["scheduled_start"] == .null)
        #expect(job["fee_cents"] == 64900)
        #expect(job["assigned_user_id"] == .string(Self.me))
        #expect(job["second_tech_id"] == .string(Self.teammate))
        #expect(
            job["intake"] == ["reason": ["Pool water level dropping"], "pool_size": "Normal", "spa_size": "6x6"])
    }

    @Test func poolServiceLeavesIntakeAndSecondTechOff() throws {
        try seedTeam()
        let f = form(settings: [
            "services": "pool", "intake_questions": Self.questions, "maintenance": ["visit_minutes": 45],
        ])
        #expect(f.jobType == .maintenance)
        #expect(f.hours == "0.75")
        #expect(f.jobTypes.map(\.label) == ["Pool Service", "Repair"])
        #expect(!f.showsBooking)
        #expect(!f.showsSecondTech)
        #expect(f.feeLabel == "Price ($)")
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        f.setAnswer("pool_size", "Normal")
        f.secondTech = Self.teammate
        f.fee = "120"

        let jobId = try f.save()
        let job = try #require(try sync.store.get("job", jobId))
        #expect(job["type"] == "maintenance")
        #expect(job["fee_cents"] == 12000)
        #expect(job["intake"] == .null)
        #expect(job["second_tech_id"] == .null)
        let labels = try components(jobId).compactMap { $0["label"]?.string }
        #expect(labels == ["Skim surface"])

        f.jobType = .repair
        f.jobTypeChanged()
        #expect(f.hours == "2")
    }

    @Test func aTechWhoSeesOnlyTheirJobsIsAlwaysAssigned() throws {
        let f = form(role: "tech", settings: ["techs_see_all_jobs": false])
        #expect(!f.seesAll)
        #expect(f.techId == Self.me)
        #expect(f.techChoices == [Self.me])
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        f.techId = nil
        #expect(!f.validate())
        #expect(f.errors["tech"] == "Book the job for yourself.")
        f.techId = Self.me
        let job = try #require(try sync.store.get("job", f.save()))
        #expect(job["assigned_user_id"] == .string(Self.me))

        let owner = form()
        owner.input.customerName = "Ana"
        owner.input.addressLine1 = "2 Main St"
        let unassigned = try #require(try sync.store.get("job", owner.save()))
        #expect(unassigned["assigned_user_id"] == .null)
    }

    @Test func suggestionsFillTheVisit() throws {
        let f = form()
        let slot = SlotSuggestion(
            date: "2027-01-18", techId: Self.teammate, techName: "Sam", position: 0, startMin: 600, addedDriveMin: 12,
            driveInMin: 12, near: "first stop")
        f.when = .notYet
        f.use(Suggestion(slot: slot, dayLabel: "Mon, Jan 18", timeLabel: "10:00 AM"))
        #expect(f.when == .scheduled)
        #expect(f.input.scheduleDate == "2027-01-18" && f.input.scheduleTime == "10:00")
        #expect(f.techId == Self.teammate)
        #expect(f.picked == "Mon, Jan 18 at 10:00 AM with Sam.")
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

    /// Two active members with names, as the server sends them.
    func seedTeam() throws {
        sync.kv.setTeam([
            TeamProfile(id: Self.me, fullName: "Me", email: nil),
            TeamProfile(id: Self.teammate, fullName: "Sam", email: nil),
        ])
        try sync.store.applyPage(
            PullPage(
                rows: [Self.me, Self.teammate].enumerated().map { i, user in
                    PulledRow(
                        table: "membership", xid: "3",
                        row: [
                            "id": .string("00000000-0000-4000-8000-00000000050\(i)"),
                            "company_id": .string(Self.company),
                            "user_id": .string(user), "role": i == 0 ? "owner" : "tech", "status": "active",
                        ])
                }, done: true, cursor: [:], serverHLC: "1800000000002-0000-server"))
    }

    /// When They Call on a repair (owner, 2026-10-19): the price book items the owner picked,
    /// or every active one; picking fills the Price; the name is saved in `intake.repair_item`.
    @Test func whenTheyCallPicksWhatTheyNeedAndSavesIt() throws {
        let (customer, _) = try seedCustomer(spa: false)
        func item(_ n: Int, _ name: String, cents: Int, sort: Int, onCall: JSONValue, active: Bool = true) -> PulledRow
        {
            PulledRow(
                table: "price_book_item", xid: "3",
                row: [
                    "id": .string("00000000-0000-4000-8000-00000000030\(n)"), "company_id": .string(Self.company),
                    "deleted_at": nil, "name": .string(name), "category": "Repair", "unit": "each",
                    "price_cents": .number(Double(cents)), "taxable": true, "sort_order": .number(Double(sort)),
                    "active": .bool(active), "on_repair_call": onCall,
                ])
        }
        let f = form()
        f.jobType = .repair
        #expect(f.showsRepairCall && !f.showsBooking)
        // None picked yet: every active item, in order.
        #expect(
            f.repairItems.map(\.label) == [
                "Leak detection - pool ($375.00)", "Leak detection - pool and spa ($450.00)",
            ])
        try sync.store.applyPage(
            PullPage(
                rows: [
                    item(1, "Pump motor", cents: 45000, sort: 30, onCall: true),
                    item(2, "Filter grids", cents: 12000, sort: 40, onCall: false),
                    item(3, "Heater igniter", cents: 18500, sort: 35, onCall: true),
                    item(4, "Old valve", cents: 9000, sort: 1, onCall: true, active: false),
                ], done: true, cursor: [:], serverHLC: "1800000000003-0000-server"))
        // Once the owner picks some: only those, active, in order.
        #expect(f.repairItems.map(\.label) == ["Pump motor ($450.00)", "Heater igniter ($185.00)"])
        let pump = try #require(f.repairItems.first)
        f.pickRepairItem(pump)
        #expect(f.repairItem == pump && f.fee == "450.00" && f.isDirty)
        // "Pick from the price book…" keeps the price typed.
        f.pickRepairItem(nil)
        #expect(f.repairItem == nil && f.fee == "450.00")
        f.pickRepairItem(pump)
        f.fee = "475.00"
        f.notes = "Motor hums but won't start"
        f.mode = .existing
        f.selectCustomer(customer)
        f.input.scheduleDate = f.tomorrow
        let pending = try sync.store.pendingCount()
        let job = try #require(try sync.store.get("job", f.save()))
        #expect(job["type"] == "repair")
        #expect(job["intake"] == [repairItemKey: "Pump motor"])
        #expect(job["fee_cents"] == 47500)
        #expect(job["summary_notes"] == "Motor hums but won't start")
        #expect(try sync.store.pendingCount() > pending)
        // The job page shows it under "When they called".
        let view = try #require(try jobViews(sync.store, companyId: Self.company).first { $0.id == job.id })
        let details = JobDetails(job: view, team: [], settings: .null)
        #expect(details.intakeTitle == "When they called")
        #expect(details.intake.first == IntakeAnswer(question: "What they need", answer: "Pump motor"))
    }

    /// `on_repair_call` reads from synced rows; missing is false.
    @Test func onRepairCallDecodes() throws {
        func decode(_ extra: Row) throws -> PriceBookItem {
            var row: Row = [
                "id": "i", "company_id": "c", "name": "Pump motor", "unit": "each", "price_cents": 45000,
                "taxable": true, "sort_order": 1, "active": true,
            ]
            row.merge(extra) { _, new in new }
            return try JSONValue.object(row).decode(PriceBookItem.self)
        }
        #expect(try decode([:]).onRepairCall == false)
        #expect(try decode(["on_repair_call": nil]).onRepairCall == false)
        #expect(try decode(["on_repair_call": false]).onRepairCall == false)
        #expect(try decode(["on_repair_call": true]).onRepairCall == true)
        let back = try json(try decode(["on_repair_call": true]))
        #expect(back["on_repair_call"] == true)
        #expect(try json(try decode([:]))["on_repair_call"] == nil)
    }

}
