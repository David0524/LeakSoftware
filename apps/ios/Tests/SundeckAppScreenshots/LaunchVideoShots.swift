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

    /// Rebecca Quinn's leak detection in progress (job #1042), for the inspection helpers.
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
            let store = env.session.sync.store
            try launchRoute(store)
            try launchLeakJob(store)
            env.session.reloadCompanies()
            let ids = try seedInspection(env)
            try seedMoney(env.session.sync, job: ids.job, finding: ids.finding)
            try await snapshot(
                "lv-checklist", height: 3000,
                NavigationStack { JobScreen(jobId: ids.job, section: .checklist) }.app(env))
            try await snapshot(
                "lv-pressure-test", TestEditor(jobId: ids.job, testId: ids.test, typeId: nil, componentId: nil).app(env)
            )
            try await snapshot(
                "lv-findings", height: 1800, NavigationStack { JobScreen(jobId: ids.job, section: .findings) }.app(env))
            try await snapshot(
                "lv-sync-waiting", NavigationStack { JobScreen(jobId: ids.job, section: .findings) }.app(env))
            try await snapshot(
                "lv-voice-note", height: 2000,
                NavigationStack { ComponentScreen(jobId: ids.job, componentId: ids.seam) }.app(env))
            let job = try #require(try jobViews(store, companyId: "c1").first { $0.id == ids.job })
            let list = wrapUp(wrapUpInput(store: store, companyId: "c1", settings: nil, job: job))
            let quote = jobQuotes(store, companyId: "c1", jobId: job.id).first?.id
            for (name, step) in [
                ("lv-review-sign", WrapUpOpen(step: .sign, refId: nil)),
                ("lv-quote", WrapUpOpen(step: .quote, refId: quote)),
            ] {
                try await snapshot(
                    name, height: 3600, WrapUpStepSheet(job: job, step: step, title: step.title(list)).app(env))
            }
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
                    #"{"id":"i1","company_id":"c1","job_id":"j1","number":1042,"status":"sent","total_cents":37500,"amount_paid_cents":0,"subtotal_cents":37500,"discount_cents":0,"tax_cents":0,"credit_cents":0}"#
                        .utf8))
            try await snapshot(
                "lv-record-payment",
                RecordPaymentSheet(
                    title: "Rebecca Quinn · Invoice #1042", invoice: invoice,
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
