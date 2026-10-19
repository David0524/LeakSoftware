import Foundation
import SundeckCore
import SundeckSync
import SundeckSyncPostgres
import Testing

@testable import SundeckApp

/// S4's "Done when": the BUILD_PLAN M4 and M8.5 sample inspections, entered offline through the
/// same writes the iPhone screens make (SyncService and InspectionWrites), sync intact to the
/// server and to the second tech's phone.
@Suite(.serialized, .enabled(if: databaseAvailable)) @MainActor
struct FieldWorkIntegrationTests {
    static let fixture = CompanyFixture()

    /// A phone running the app's sync service as `user`.
    @MainActor struct Phone {
        let device: Device
        let sync: SyncService
        let userId: String

        init(_ name: String, _ user: TestUser) throws {
            device = try SundeckSyncIntegrationTests.device(name, user)
            sync = SyncService(
                store: device.store, kv: try KeyValue(device.store.database), transport: device.transport,
                auth: SignedIn(id: user.id, email: user.email))
            userId = user.id
        }
    }

    @Test func theM85SampleTwoTechs27ItemsALeakRepairedOnSite() async throws {
        let co = try await Self.fixture.get()
        let a = try Phone("fieldA", co.tech)
        let b = try Phone("fieldB", co.owner)
        await a.sync.syncNow()
        await b.sync.syncNow()

        // ---- Offline from here ----
        a.device.transport.offline = true
        let (job, property) = try newJob(
            a, co, pool: ["pool_type": "vinyl", "has_pool": true, "has_spa": true],
            job: ["second_tech_id": .string(co.owner.id), "fee_cents": 64900])
        let config = InspectionConfig(a.sync.store, companyId: co.id)
        try InspectionWrites.createChecklist(
            a.sync, companyId: co.id, jobId: job, types: config.componentTypes, property: property.row,
            jobType: .detection)
        var inspection = JobInspection(a.sync.store, jobId: job)
        #expect(inspection.components.count == 27)

        // One tap per item: Skimmer seam leaking (with where), the equipment area needs
        // attention, the vinyl questions answered, everything else not leaking.
        for c in inspection.components {
            let key = config.componentTypeById[c.componentTypeId]?.key
            let verdict: Verdict =
                switch key {
                case "skimmer_seam": .leaking
                case "equipment_area": .attention
                case "vinyl_stretched": .na
                default: .ok
                }
            try InspectionWrites.setVerdict(
                a.sync, companyId: co.id, jobId: job, componentId: c.id, existing: inspection.resultByComponent[c.id],
                verdict: verdict, userId: a.userId)
        }
        inspection = JobInspection(a.sync.store, jobId: job)
        let seam = try #require(inspection.components.first { $0.label == "Skimmer seam" })
        try InspectionWrites.saveChecklistResult(
            a.sync, companyId: co.id, jobId: job, componentId: seam.id, existing: inspection.resultByComponent[seam.id],
            ["location_text": "Seam at the skimmer throat"])

        // The leak, found and then repaired on site (status is set on the saved finding, as on
        // the phone).
        let finding = try InspectionWrites.saveFinding(
            a.sync, companyId: co.id, jobId: job, existing: nil, title: "Skimmer seam leak", componentId: seam.id,
            severityKey: "major", location: "Skimmer throat", pin: (diagramFraction(0.21), diagramFraction(0.073_19)),
            status: .open, notes: "")
        let saved = try #require(JobInspection(a.sync.store, jobId: job).findings.first { $0.id == finding })
        try InspectionWrites.saveFinding(
            a.sync, companyId: co.id, jobId: job, existing: saved, title: saved.title, componentId: seam.id,
            severityKey: "major", location: "Skimmer throat", pin: (0.21, 0.0732), status: .repaired,
            notes: "Resealed with underwater putty.")

        await a.sync.syncNow()
        #expect(a.sync.status.phase == .offline)
        #expect(a.sync.status.pending > 27)

        // ---- Back online ----
        a.device.transport.offline = false
        await a.sync.syncNow()
        #expect(a.sync.status.problems == 0, "\(problems(a))")
        #expect(a.sync.status.pending == 0)
        await b.sync.syncNow()

        try await expectSameEverywhere(a, b, job: job)
        let office = JobInspection(b.sync.store, jobId: job)
        #expect(office.components.count == 27)
        let tally = office.results.reduce(into: [String: Int]()) { counts, r in
            counts[currentVerdict(status: r.status, outcome: r.outcome).map { "\($0)" } ?? "pending", default: 0] += 1
        }
        #expect(tally == ["ok": 24, "leaking": 1, "attention": 1, "na": 1])
        #expect(office.resultByComponent[seam.id]?.locationText == "Seam at the skimmer throat")
        #expect(office.findings.map(\.status) == [.repaired])
        #expect(office.findings.first?.pinY == 0.0732)
        let serverJob = try await testDatabase!.serverRow("job", job)
        #expect(serverJob?["second_tech_id"] == .string(co.owner.id))
        #expect(serverJob?["fee_cents"] == 64900)
    }

    @Test func theM4SampleExtraLinesAnExclusionTestsAndPinnedFindings() async throws {
        let co = try await Self.fixture.get()
        let a = try Phone("fieldC", co.tech)
        let b = try Phone("fieldD", co.owner)
        await a.sync.syncNow()
        await b.sync.syncNow()

        a.device.transport.offline = true
        let (job, property) = try newJob(
            a, co, pool: ["pool_type": "gunite_plaster", "has_pool": true, "has_spa": true], job: [:])
        try InspectionWrites.setDiagramShape(a.sync, propertyId: property.id, companyId: co.id, shape: .kidney)
        let config = InspectionConfig(a.sync.store, companyId: co.id)
        let type = { (key: String) in config.componentTypes.first { $0.key == key }! }
        try InspectionWrites.createChecklist(
            a.sync, companyId: co.id, jobId: job, types: config.componentTypes, property: property.row,
            jobType: .detection)

        // "+ Add": a second skimmer and three more returns.
        try InspectionWrites.addComponent(
            a.sync, companyId: co.id, jobId: job, type: type("skimmer"),
            existing: JobInspection(a.sync.store, jobId: job).components)
        for _ in 0..<3 {
            try InspectionWrites.addComponent(
                a.sync, companyId: co.id, jobId: job, type: type("return"),
                existing: JobInspection(a.sync.store, jobId: job).components)
        }
        // One added by mistake, then removed.
        let extra = try InspectionWrites.addComponent(
            a.sync, companyId: co.id, jobId: job, type: type("light"),
            existing: JobInspection(a.sync.store, jobId: job).components)
        var inspection = JobInspection(a.sync.store, jobId: job)
        try InspectionWrites.removeComponent(
            a.sync, companyId: co.id, component: inspection.componentById[extra]!,
            result: inspection.resultByComponent[extra])

        inspection = JobInspection(a.sync.store, jobId: job)
        let of = { (key: String) in
            inspection.components.filter { config.componentTypeById[$0.componentTypeId]?.key == key }
        }
        #expect(of("skimmer").map(\.label) == ["Skimmer", "Skimmer 2"])
        #expect(of("return").map(\.label) == ["Returns", "Returns 2", "Returns 3", "Returns 4"])
        #expect(of("light").count == 1)
        #expect(of("spa").count == 1)
        let comp = { (label: String) in inspection.components.first { $0.label == label }!.id }

        // Verdicts: the main drain not applicable (no diver), Returns 3 leaking, the rest fine.
        for c in inspection.components {
            let verdict: Verdict = c.label == "Main drain" ? .na : c.label == "Returns 3" ? .leaking : .ok
            try InspectionWrites.setVerdict(
                a.sync, companyId: co.id, jobId: job, componentId: c.id, existing: inspection.resultByComponent[c.id],
                verdict: verdict, userId: a.userId)
        }

        // Tests: 5 pressure (Returns 3 fails), 1 bucket, 2 dye.
        let testType = { (key: String) in config.testTypes.first { $0.key == key }! }
        func addTest(_ key: String, _ label: String?, _ raw: [String: String], _ chosen: Outcome? = nil) throws
            -> String
        {
            let tt = testType(key)
            let data = normalizeTestData(tt.fieldSchema, raw.mapValues { .string($0) })
            #expect(validateTestData(tt.fieldSchema, data).isEmpty)
            return try InspectionWrites.saveTest(
                a.sync, companyId: co.id, jobId: job, existing: nil, type: tt, componentId: label.map(comp), data: data,
                outcome: chosen ?? calculate(tt, data).suggested, notes: "")
        }
        for line in ["Skimmer", "Skimmer 2", "Returns", "Returns 2"] {
            try addTest(
                "pressure", line, ["line_name": line, "start_psi": "20", "end_psi": "20", "duration_min": "15"])
        }
        let failing = try addTest(
            "pressure", "Returns 3",
            ["line_name": "Returns 3", "start_psi": "20", "end_psi": "12", "duration_min": "15"])
        try addTest(
            "bucket", nil,
            [
                "pool_start_in": "10", "pool_end_in": "9.25", "bucket_start_in": "10", "bucket_end_in": "9.94",
                "duration_hours": "24",
            ])
        try addTest(
            "dye", "All light niches and conduits", ["location": "Light niche", "observation": "No draw"], .pass)
        try addTest(
            "dye", "Returns 3", ["location": "Returns 3 fitting", "observation": "Dye drawn in (leak)"], .fail)

        // Findings with pins, tapped on the diagram.
        for (title, label, severity, x, y) in [
            ("Returns 3 line break", "Returns 3", "major", 0.421_37, 0.18),
            ("Light niche seal worn", "All light niches and conduits", "minor", 0.81, 0.659_99),
        ] {
            #expect(validateFinding(title: title, severityKey: severity).isEmpty)
            try InspectionWrites.saveFinding(
                a.sync, companyId: co.id, jobId: job, existing: nil, title: title, componentId: comp(label),
                severityKey: severity, location: "", pin: (diagramFraction(x), diagramFraction(y)), status: .open,
                notes: "")
        }

        await a.sync.syncNow()
        #expect(a.sync.status.phase == .offline)

        a.device.transport.offline = false
        await a.sync.syncNow()
        #expect(a.sync.status.problems == 0, "\(problems(a))")
        #expect(a.sync.status.pending == 0)
        await b.sync.syncNow()

        try await expectSameEverywhere(a, b, job: job)
        let office = JobInspection(b.sync.store, jobId: job)
        #expect(office.componentById[extra] == nil)
        #expect(office.results.filter { $0.status == .excluded }.count == 1)
        #expect(office.tests.count == 8)
        #expect(office.tests.filter { $0.outcome == .fail }.count == 3)  // Returns 3 pressure, bucket, Returns 3 dye
        #expect(office.tests.first { $0.id == failing }?.computed["drop_psi"] == .number(8))
        #expect(office.findings.map { [$0.pinX, $0.pinY] } == [[0.4214, 0.18], [0.81, 0.66]])
        #expect(try b.sync.store.get("property", property.id)?["diagram_shape"] == "kidney")
    }

    // MARK: - Helpers

    /// A customer, pool, and in-progress leak detection job, entered on the phone.
    private func newJob(_ p: Phone, _ co: TestCompany, pool: Row, job extra: Row) throws -> (
        job: String, property: (id: String, row: Property)
    ) {
        let customer = try p.sync.insert("customer", companyId: co.id, ["name": "Riley Rivera"])
        var poolRow = pool
        poolRow["customer_id"] = .string(customer)
        poolRow["address_line1"] = "9 Sample Way"
        let property = try p.sync.insert("property", companyId: co.id, poolRow)
        var jobRow: Row = [
            "property_id": .string(property), "bill_to_customer_id": .string(customer), "status": "in_progress",
            "type": "detection", "assigned_user_id": .string(p.userId),
            "started_at": .string(isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000)),
        ]
        jobRow.merge(extra) { _, new in new }
        let job = try p.sync.insert("job", companyId: co.id, jobRow)
        let stored = try p.sync.store.get("property", property)
        let row = try JSONValue.object(try #require(stored)).decode(Property.self)
        return (job, (property, row))
    }

    private func problems(_ p: Phone) -> String { "\((try? p.sync.store.problems()) ?? [])" }

    /// The server and both phones hold the same inspection rows for the job.
    private func expectSameEverywhere(_ a: Phone, _ b: Phone, job: String) async throws {
        for table in ["job", "job_component", "checklist_item_result", "test_result", "finding"] {
            let ids =
                table == "job"
                ? [job] : try a.sync.store.list(table, jobId: job, includeDeleted: true).compactMap { $0["id"]?.string }
            if table != "test_result" { #expect(!ids.isEmpty, "\(table) has rows") }
            for id in ids {
                let server = try await testDatabase!.serverRow(table, id)
                #expect(server != nil, "\(table) \(id) on the server")
                #expect(try a.device.localRow(table, id) == server, "\(table) \(id) on phone A")
                #expect(try b.device.localRow(table, id) == server, "\(table) \(id) on phone B")
            }
        }
    }
}

/// A signed-in session that never changes (the database harness signs in as the user directly).
private struct SignedIn: AuthBackend {
    let id: String
    let email: String
    func currentSession() async -> SignInResult? {
        SignInResult(user: SignedInUser(id: id, email: email), needsCode: false)
    }
    func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("not used") }
    func signUp(name: String, email: String, password: String) async throws -> Bool { false }
    func verifyCode(_ code: String) async throws {}
    func refresh() async throws {}
    func signOut() async {}
}
