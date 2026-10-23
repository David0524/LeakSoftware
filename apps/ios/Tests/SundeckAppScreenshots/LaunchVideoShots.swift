#if os(iOS)
    import Foundation
    import SundeckCore
    import SundeckStorage
    import SundeckSync
    import SwiftUI
    import Testing
    import UIKit

    @testable import SundeckApp

    // The launch film's iPhone screens (docs/plans/launch-video.md): the app's real screens with
    // the shop the owner's recordings show (Canyon State Leak Detections: Dana Owner on the route
    // with Jake Turner, customers Rebecca Quinn, Janet Yates, Julia Hughes), saved as lv-*.png.
    // Runs only from .github/workflows/launch-video-iphone.yml (LAUNCH_VIDEO_SHOTS=1), so CI's
    // screenshot job skips it.

    private let launchShots = ProcessInfo.processInfo.environment["LAUNCH_VIDEO_SHOTS"] == "1"

    private struct LaunchAuth: AuthBackend {
        func currentSession() async -> SignInResult? {
            SignInResult(user: SignedInUser(id: "u1", email: "dana@canyonstate.example"), needsCode: false)
        }
        func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("offline") }
        func signUp(name: String, email: String, password: String) async throws -> Bool { false }
        func verifyCode(_ code: String) async throws {}
        func refresh() async throws {}
        func signOut() async {}
    }

    private let shop = "Canyon State Leak Detections"

    /// A signed-in phone for the film's shop, with nothing synced from a server.
    @MainActor
    private func launchEnvironment() throws -> AppEnvironment {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("launch-\(UUID()).db").path
        let db = try Database(path: path, key: String(repeating: "cd", count: 32))
        let store = try LocalStore.open(db, deviceId: "launch")
        let kv = try KeyValue(db)
        let auth = LaunchAuth()
        let files = FileManager.default.temporaryDirectory.appendingPathComponent("launch-media-\(UUID())")
        // Synced two minutes ago, set before the sync service reads it, so no screen shows "Not
        // synced yet".
        kv.setJSON(KVKey.user, SignedInUser(id: "u1", email: "dana@canyonstate.example"))
        kv.set(KVKey.lastSyncedAt, String(Date().addingTimeInterval(-120).timeIntervalSince1970))
        kv.set(KVKey.initialSyncDone, "1")
        let sync = SyncService(
            store: store, kv: kv, transport: SilentTransport(), auth: auth, media: MediaFiles(root: files))
        kv.setTeam([
            TeamProfile(id: "u1", fullName: "Dana Owner", email: "dana@canyonstate.example"),
            TeamProfile(id: "u2", fullName: "Jake Turner", email: nil),
        ])
        try store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "company", xid: "1",
                        row: [
                            "id": "c1", "company_id": "c1", "name": .string(shop), "timezone": "America/Phoenix",
                            "settings": ["services": "both"], "address_line1": "200 W Washington St",
                            "city": "Phoenix", "state": "AZ", "postal_code": "85003", "latitude": 33.4484,
                            "longitude": -112.0740,
                        ]),
                    PulledRow(
                        table: "membership", xid: "1",
                        row: ["id": "m1", "company_id": "c1", "user_id": "u1", "role": "owner", "status": "active"]),
                    PulledRow(
                        table: "membership", xid: "1",
                        row: ["id": "m2", "company_id": "c1", "user_id": "u2", "role": "tech", "status": "active"]),
                ], done: true, cursor: [:], serverHLC: "1760000000000-0000-srv"))
        let session = Session(sync: sync, auth: auth)
        return AppEnvironment(client: ServerCheck.makeClient(), session: session, walkthrough: Walkthrough(kv))
    }

    /// Dana's day as the owner's recordings show it: Rebecca Quinn first (Code #1955), then
    /// Janet Yates, then Julia Hughes's weekly pool visit (job #1102), and Jake on Rebecca's too.
    private func launchRoute(_ store: LocalStore) throws {
        let zone = "America/Phoenix"
        let today = localDay(Date(), timeZone: zone)
        let at = { (day: String, minutes: Int) -> JSONValue in
            .string(zonedInstant(day, minutes, timeZone: zone).map(isoString) ?? "")
        }
        let stops: [(String, String, String, Double, Double, Int, String?, Int)] = [
            ("Rebecca Quinn", "(480) 555-0171", "7745 N 42nd Ave", 33.5463, -112.1497, 8 * 60, "Code #1955", 1100),
            ("Janet Yates", "(602) 555-0128", "3897 N 46th Way", 33.4920, -111.9840, 11 * 60, nil, 1101),
            (
                "Julia Hughes", "(602) 555-0164", "6121 N 31st St", 33.5280, -112.0120, 13 * 60 + 30,
                "Dog in the yard; latch the gate.", 1102
            ),
        ]
        for s in stops {
            let customer = try store.insert("customer", companyId: "c1", ["name": .string(s.0), "phone": .string(s.1)])
            let pool = try store.insert(
                "property", companyId: "c1",
                [
                    "customer_id": .string(customer), "address_line1": .string(s.2), "city": "Phoenix", "state": "AZ",
                    "has_pool": true, "latitude": .number(s.3), "longitude": .number(s.4),
                    "access_notes": s.6.map { .string($0) } ?? .null,
                ])
            try store.insert(
                "job", companyId: "c1",
                [
                    "property_id": .string(pool), "bill_to_customer_id": .string(customer), "status": "scheduled",
                    "type": "detection", "assigned_user_id": "u1", "scheduled_start": at(today, s.5),
                    "scheduled_end": at(today, s.5 + 120), "number": .number(Double(s.7)),
                ])
        }
    }

    /// Rebecca Quinn's leak detection in progress, for the inspection helpers: numbered #1042 as they
    /// expect, then #5163 (the job in the owner's recording) once they've run.
    private func launchLeakJob(_ store: LocalStore) throws {
        let rebecca = try #require(try store.list("customer").first { $0["name"] == "Rebecca Quinn" })
        let pool = try store.insert(
            "property", companyId: "c1",
            [
                "customer_id": .string(rebecca.id), "address_line1": "7745 N 42nd Ave", "city": "Phoenix",
                "state": "AZ", "postal_code": "85051", "has_pool": true, "has_spa": true,
                "pool_type": "gunite_plaster", "approx_gallons": 20000, "access_notes": "Code #1955",
            ])
        try store.insert(
            "job", companyId: "c1",
            [
                "property_id": .string(pool), "bill_to_customer_id": .string(rebecca.id), "status": "in_progress",
                "type": "detection",
                "started_at": .string(isoTimestamp(milliseconds: (Date().timeIntervalSince1970 - 1800) * 1000)),
                "assigned_user_id": "u1", "number": 1042, "fee_cents": 37500,
            ])
    }

    /// Rebecca's leak detection as the narration tells it: the return line dropped on the
    /// pressure test (a break under the deck), and dye pulled into the light niche's conduit.
    /// Checklist, test, both findings pinned on her Roman pool with a spa, a dye photo, the draft
    /// report, and the repair quote from the price book ($1,150 + $385). Numbered #5163.
    @MainActor
    private func launchInspection(_ env: AppEnvironment) throws -> (
        job: String, light: String, test: String, returnFinding: String, lightFinding: String
    ) {
        let sync = env.session.sync
        let url = try #require(Bundle.module.url(forResource: "config", withExtension: "json"))
        let config = try JSONDecoder().decode([String: [Row]].self, from: Data(contentsOf: url))
        var rows: [PulledRow] = []
        for (table, list) in config {
            for row in list {
                var r = row
                r["company_id"] = "c1"
                rows.append(PulledRow(table: table, xid: "2", row: r))
            }
        }
        try sync.store.applyPage(PullPage(rows: rows, done: true, cursor: [:], serverHLC: "1760000000001-0000-srv"))
        let jobRow = try #require(try sync.store.list("job").first { $0["number"] == 1042 })
        let job = try #require(jobRow["id"]?.string)
        let propertyId = try #require(jobRow["property_id"]?.string)
        let property = try JSONValue.object(try #require(try sync.store.get("property", propertyId))).decode(
            Property.self)
        try InspectionWrites.setDiagramShape(sync, propertyId: propertyId, companyId: "c1", shape: .roman)
        let types = InspectionConfig(sync.store, companyId: "c1")
        try InspectionWrites.createChecklist(
            sync, companyId: "c1", jobId: job, types: types.componentTypes, property: property, jobType: .detection)
        let inspection = JobInspection(sync.store, jobId: job)
        let key = { (c: JobComponent) in types.componentTypeById[c.componentTypeId]?.key ?? "" }
        for (i, c) in inspection.components.enumerated() where i < 12 {
            let verdict: Verdict = ["return", "light"].contains(key(c)) ? .leaking : .ok
            try InspectionWrites.setVerdict(
                sync, companyId: "c1", jobId: job, componentId: c.id, existing: inspection.resultByComponent[c.id],
                verdict: verdict, userId: "u1")
        }
        let returns = try #require(inspection.components.first { key($0) == "return" })
        let light = try #require(inspection.components.first { key($0) == "light" })
        let places = [(returns, "Under the deck, 6 ft from the pool wall"), (light, "Behind the pool light")]
        for (component, place) in places {
            try InspectionWrites.saveChecklistResult(
                sync, companyId: "c1", jobId: job, componentId: component.id,
                existing: JobInspection(sync.store, jobId: job).resultByComponent[component.id],
                ["location_text": .string(place)])
        }
        let pressure = try #require(types.testTypes.first { $0.key == "pressure" })
        let data = normalizeTestData(
            pressure.fieldSchema,
            ["line_name": "Return", "start_psi": "20", "end_psi": "12", "duration_min": "15"].mapValues { .string($0) }
        )
        let test = try InspectionWrites.saveTest(
            sync, companyId: "c1", jobId: job, existing: nil, type: pressure, componentId: returns.id, data: data,
            outcome: calculate(pressure, data).suggested, notes: "")
        let returnFinding = try InspectionWrites.saveFinding(
            sync, companyId: "c1", jobId: job, existing: nil, title: "Return line break", componentId: returns.id,
            severityKey: "major", location: "Under the deck, 6 ft from the pool wall", pin: (0.55, 0.06),
            status: .open, notes: "Return line dropped 8 PSI in 15 minutes; the others held.")
        let lightFinding = try InspectionWrites.saveFinding(
            sync, companyId: "c1", jobId: job, existing: nil, title: "Light niche conduit leak", componentId: light.id,
            severityKey: "moderate", location: "Behind the pool light", pin: (0.30, 0.94), status: .open,
            notes: "Dye pulled into the conduit at the back of the light niche.")
        try seedPhoto(sync, job: job, componentId: light.id)
        func line(_ id: String, _ item: String, _ finding: String, _ text: String, _ cents: Int, _ order: Int)
            -> PulledRow
        {
            PulledRow(
                table: "quote_line_item", xid: "5",
                row: [
                    "id": .string(id), "company_id": "c1", "quote_id": "q1", "description": .string(text),
                    "quantity": 1, "unit_price_cents": .number(Double(cents)), "taxable": false,
                    "sort_order": .number(Double(order)), "price_book_item_id": .string(item),
                    "finding_id": .string(finding),
                ])
        }
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "report", xid: "3",
                        row: [
                            "id": "r1", "company_id": "c1", "job_id": .string(job), "template_key": "homeowner",
                            "version": 1, "status": "draft",
                            "final_sections": [
                                [
                                    "key": "summary", "title": "What We Found",
                                    "text":
                                        "We found two leaks: a break in the return line under the deck, and water getting into the conduit behind the pool light. Everything else we checked is holding.",
                                ],
                                [
                                    "key": "next_steps", "title": "Next Steps",
                                    "text":
                                        "Repair the return line and reseal the light niche conduit. We've sent a quote for both.",
                                ],
                            ],
                            "ai_draft": ["problems": []],
                        ]),
                    PulledRow(
                        table: "price_book_item", xid: "5",
                        row: [
                            "id": "pbr1", "company_id": "c1", "name": "Repair return line break", "unit": "each",
                            "price_cents": 115000, "taxable": false, "sort_order": 1, "active": true,
                            "component_type_key": "return",
                        ]),
                    PulledRow(
                        table: "price_book_item", xid: "5",
                        row: [
                            "id": "pbr2", "company_id": "c1", "name": "Reseal light niche conduit", "unit": "each",
                            "price_cents": 38500, "taxable": false, "sort_order": 2, "active": true,
                            "component_type_key": "light",
                        ]),
                    PulledRow(
                        table: "quote", xid: "5",
                        row: [
                            "id": "q1", "company_id": "c1", "job_id": .string(job), "status": "draft",
                            "subtotal_cents": 153500, "discount_cents": 0, "tax_cents": 0, "total_cents": 153500,
                            "deposit_cents": 76750,
                        ]),
                    line("ql1", "pbr1", returnFinding, "Repair return line break", 115000, 1),
                    line("ql2", "pbr2", lightFinding, "Reseal light niche conduit", 38500, 2),
                ], done: true, cursor: [:], serverHLC: "1760000000005-0000-srv"))
        try sync.store.write("job", id: job, companyId: "c1", ["number": 5163])
        return (job, light.id, test, returnFinding, lightFinding)
    }

    /// "Rebecca Quinn" in a quick hand, as the signature pad records it (points, top-left origin).
    private func rebeccaSignature() -> [SignatureStroke] {
        func stroke(_ from: Double, _ to: Double, _ y: (Double) -> Double) -> SignatureStroke {
            stride(from: from, through: to, by: 3).map { x in SIMD2<Double>(x, y(x)) }
        }
        func loops(_ x: Double, _ start: Double, _ base: Double, _ height: Double, _ width: Double) -> Double {
            let wave: Double = abs(sin((x - start) / width))
            return base - height * wave
        }
        var r: SignatureStroke = stroke(20, 40) { x in 150 - (x - 20) * 4.5 }
        r += stroke(40, 80) { x in 60 + 30 * sin((x - 40) / 40 * Double.pi) }
        r += stroke(80, 120) { x in 90 + (x - 80) * 1.5 }
        let ebecca = stroke(120, 330) { x in loops(x, 120, 120, 22, 18) }
        let q = stroke(380, 470) { x in 100 + 45 * sin((x - 380) / 90 * 2 * Double.pi) }
        let qTail = stroke(440, 500) { x in 140 + (x - 440) * 0.6 }
        let uinn = stroke(500, 700) { x in loops(x, 500, 125, 18, 14) }
        let tail = stroke(700, 760) { x in 125 + (x - 700) * 0.3 }
        return [r, ebecca, q, qTail, uinn, tail]
    }

    /// Marks everything written so far as synced, so the sync bar shows no waiting changes.
    private func markSynced(_ store: LocalStore) throws {
        let batch = try store.pendingBatch(maxMutations: 100_000)
        try store.acknowledge(batch.seqsByMutation.values.flatMap { $0 })
    }

    @Suite(.serialized, .enabled(if: launchShots)) @MainActor struct LaunchVideoShots {
        /// Today, Today with the first stop done, and Today in dark mode at 6 AM.
        @Test func today() async throws {
            let env = try launchEnvironment()
            let store = env.session.sync.store
            try launchRoute(store)
            env.session.reloadCompanies()
            try await snapshot("lv-today", height: 1500, MainView().app(env))
            try await snapshot("lv-today-dark", dark: true, height: 1500, MainView().app(env))
            let visit = try #require(try seedCleanings(store))
            try await snapshot("lv-today-pool", height: 1500, MainView().app(env))
            try await snapshot(
                "lv-cleanings", height: 2400, NavigationStack { JobScreen(jobId: visit, section: .checklist) }.app(env))
            let today = try localDate(Date(), "America/Phoenix")
            if let first = try store.list("job").first(where: { $0["number"] == 1100 }) {
                try store.write("job", id: first.id, companyId: "c1", ["stop_done_on": .string(today)])
            }
            try await snapshot("lv-today-done", height: 1500, MainView().app(env))
        }

        /// The leak job: checklist, the pressure test that dropped, findings and the diagram, the
        /// voice note button, the customer's signature step, the quote from the price book.
        @Test func leakJob() async throws {
            let env = try launchEnvironment()
            let sync = env.session.sync
            let store = sync.store
            try launchRoute(store)
            try launchLeakJob(store)
            env.session.reloadCompanies()
            let ids = try launchInspection(env)
            // Everything so far reached the office: no "waiting to sync" bar on these screens.
            try markSynced(store)
            try await snapshot(
                "lv-checklist", height: 3000,
                NavigationStack { JobScreen(jobId: ids.job, section: .checklist) }.app(env))
            try await snapshot(
                "lv-pressure-test", TestEditor(jobId: ids.job, testId: ids.test, typeId: nil, componentId: nil).app(env)
            )
            try await snapshot(
                "lv-findings", height: 2200, NavigationStack { JobScreen(jobId: ids.job, section: .findings) }.app(env))
            try await snapshot(
                "lv-voice-note", height: 2000,
                NavigationStack { ComponentScreen(jobId: ids.job, componentId: ids.light) }.app(env))
            let job = try #require(try jobViews(store, companyId: "c1").first { $0.id == ids.job })
            var list = wrapUp(wrapUpInput(store: store, companyId: "c1", settings: nil, job: job))
            let quote = jobQuotes(store, companyId: "c1", jobId: job.id).first?.id
            let sign = WrapUpOpen(step: .sign, refId: nil)
            try await snapshot(
                "lv-review-sign", height: 3600, WrapUpStepSheet(job: job, step: sign, title: sign.title(list)).app(env))
            // Rebecca signs on the tech's phone.
            try SignatureWrites.save(
                sync, companyId: "c1", jobId: job.id, purpose: .inspectionAck, signerName: "Rebecca Quinn",
                signerRole: "Homeowner", strokes: rebeccaSignature(), at: nil)
            try markSynced(store)
            list = wrapUp(wrapUpInput(store: store, companyId: "c1", settings: nil, job: job))
            try await snapshot(
                "lv-signed", height: 3600, WrapUpStepSheet(job: job, step: sign, title: sign.title(list)).app(env))
            let report = WrapUpOpen(step: .report, refId: nil)
            try await snapshot(
                "lv-send-report", height: 3600,
                WrapUpStepSheet(job: job, step: report, title: report.title(list)).app(env))
            let quoteStep = WrapUpOpen(step: .quote, refId: quote)
            try await snapshot(
                "lv-quote", height: 3600,
                WrapUpStepSheet(job: job, step: quoteStep, title: quoteStep.title(list)).app(env))
            // In the backyard with no signal: two answers saved on the phone, waiting to sync.
            let inspection = JobInspection(store, jobId: job.id)
            for c in inspection.components.dropFirst(12).prefix(2) {
                try InspectionWrites.setVerdict(
                    sync, companyId: "c1", jobId: job.id, componentId: c.id,
                    existing: inspection.resultByComponent[c.id], verdict: .ok, userId: "u1")
            }
            await sync.syncNow()
            try await snapshot(
                "lv-offline", height: 3000,
                NavigationStack { JobScreen(jobId: ids.job, section: .checklist) }.app(env))
        }

        /// The upsell on a pool visit: the tech hears the pump going and adds a finding, then
        /// quotes the replacement from the price book.
        @Test func pumpUpsell() async throws {
            let env = try launchEnvironment()
            let sync = env.session.sync
            let store = sync.store
            try launchRoute(store)
            env.session.reloadCompanies()
            let visit = try #require(try seedCleanings(store))
            let url = try #require(Bundle.module.url(forResource: "config", withExtension: "json"))
            let config = try JSONDecoder().decode([String: [Row]].self, from: Data(contentsOf: url))
            var rows: [PulledRow] = []
            for (table, list) in config {
                for row in list {
                    var r = row
                    r["company_id"] = "c1"
                    rows.append(PulledRow(table: table, xid: "2", row: r))
                }
            }
            try store.applyPage(PullPage(rows: rows, done: true, cursor: [:], serverHLC: "1760000000001-0000-srv"))
            // The visit's equipment item, and the price book's pump work for it.
            let equipment = try store.insert(
                "job_component", companyId: "c1",
                [
                    "job_id": .string(visit), "component_type_id": "a0133e78-a118-42d6-9a1a-9c891372096d",
                    "instance_number": 1, "label": "Equipment", "sort_order": 99,
                ])
            try store.applyPage(
                PullPage(
                    rows: [
                        PulledRow(
                            table: "price_book_item", xid: "5",
                            row: [
                                "id": "pbp1", "company_id": "c1", "name": "Replace pump motor (1.5 HP)", "unit": "each",
                                "price_cents": 69500, "taxable": true, "sort_order": 1, "active": true,
                                "component_type_key": "svc_equipment",
                            ]),
                        PulledRow(
                            table: "price_book_item", xid: "5",
                            row: [
                                "id": "pbp2", "company_id": "c1", "name": "Pump labor", "unit": "each",
                                "price_cents": 15000, "taxable": false, "sort_order": 2, "active": true,
                                "component_type_key": "svc_equipment",
                            ]),
                    ], done: true, cursor: [:], serverHLC: "1760000000004-0000-srv"))
            let finding = try InspectionWrites.saveFinding(
                sync, companyId: "c1", jobId: visit, existing: nil, title: "Pump bearing noise", componentId: equipment,
                severityKey: "moderate", location: "Equipment pad", pin: nil, status: .open,
                notes: "Loud grinding at startup. Motor is 9 years old; recommend replacing before it fails.")
            try await snapshot(
                "lv-pump-finding", height: 2400, FindingEditor(jobId: visit, findingId: finding).app(env))
            func line(_ id: String, _ item: String, _ description: String, _ cents: Int, _ order: Int) -> PulledRow {
                PulledRow(
                    table: "quote_line_item", xid: "5",
                    row: [
                        "id": .string(id), "company_id": "c1", "quote_id": "pq1", "description": .string(description),
                        "quantity": 1, "unit_price_cents": .number(Double(cents)), "taxable": false,
                        "sort_order": .number(Double(order)), "price_book_item_id": .string(item),
                        "finding_id": .string(finding),
                    ])
            }
            try store.applyPage(
                PullPage(
                    rows: [
                        PulledRow(
                            table: "quote", xid: "5",
                            row: [
                                "id": "pq1", "company_id": "c1", "job_id": .string(visit), "status": "draft",
                                "subtotal_cents": 84500, "discount_cents": 0, "tax_cents": 0, "total_cents": 84500,
                                "deposit_cents": 0,
                            ]),
                        line("pql1", "pbp1", "Replace pump motor (1.5 HP)", 69500, 1),
                        line("pql2", "pbp2", "Pump labor", 15000, 2),
                    ], done: true, cursor: [:], serverHLC: "1760000000005-0000-srv"))
            let job = try #require(try jobViews(store, companyId: "c1").first { $0.id == visit })
            let list = wrapUp(wrapUpInput(store: store, companyId: "c1", settings: nil, job: job))
            let step = WrapUpOpen(step: .quote, refId: "pq1")
            try await snapshot(
                "lv-pump-quote", height: 3600, WrapUpStepSheet(job: job, step: step, title: step.title(list)).app(env))
        }

        /// What to Add from the visit's readings, and a cash payment with its receipt by text.
        @Test func poolAndMoney() async throws {
            let env = try launchEnvironment()
            try await snapshot(
                "lv-what-to-add", height: 1200,
                FormSheet(title: "What to Add", cancelTitle: "Close") {
                    DoseList(
                        result: calculateChemistry(
                            ChemistryInput(
                                gallons: 18000, readings: Readings(fc: 1.5, ph: 7.9, ta: 90, ch: 250, cya: 40),
                                chlorine: .liquid12, acid: .muriatic31)))
                }
                .app(env))
            let invoice = try JSONDecoder().decode(
                InvoiceRecord.self,
                from: Data(
                    #"{"id":"i1","company_id":"c1","job_id":"j1","number":2087,"status":"sent","total_cents":37500,"amount_paid_cents":0,"subtotal_cents":37500,"discount_cents":0,"tax_cents":0,"credit_cents":0}"#
                        .utf8))
            try await snapshot(
                "lv-record-payment",
                RecordPaymentSheet(
                    title: "Rebecca Quinn · Invoice #2087", invoice: invoice,
                    flow: InvoiceFlow(sync: env.session.sync, companyId: "c1", jobId: "j1")
                ) { _ in }
                .app(env))
            let receipt = ReceiptForm(
                start: ReceiptStart(
                    invoiceId: "i1", paymentId: "p1", status: "paid", summary: "$375.00 · Cash · Paid in full"),
                email: "rebecca.quinn@example.com", phone: "4805550171", texting: true)
            receipt.channel = .text
            try await snapshot("lv-send-receipt", SendReceiptSheet(form: receipt) { _ in }.app(env))
        }
    }
#endif
