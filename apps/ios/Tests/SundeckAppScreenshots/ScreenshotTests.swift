#if os(iOS)
    import Foundation
    import SundeckCore
    import SundeckStorage
    import SundeckSync
    import SwiftUI
    import Testing
    import UIKit

    @testable import SundeckApp

    // Renders each screen with sample data in the iPhone simulator and saves a PNG per screen, so
    // screens can be looked at from CI (cloud sessions have no simulator; docs/plans/swift-app.md).
    // The folder comes from SCREENSHOT_DIR (CI passes TEST_RUNNER_SCREENSHOT_DIR); without it the
    // tests still render every screen, which catches crashes and layout loops.

    /// A server stand-in that never answers: screenshots show the phone's own data.
    final class SilentTransport: SyncTransport, @unchecked Sendable {
        func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
            throw SyncFailure("offline")
        }
        func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage { throw SyncFailure("offline") }
        func scope() async throws -> String? { nil }
    }

    struct SampleAuth: AuthBackend {
        func currentSession() async -> SignInResult? {
            SignInResult(user: SignedInUser(id: "u1", email: "tech@demo.leakbook.test"), needsCode: false)
        }
        func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("offline") }
        func signUp(name: String, email: String, password: String) async throws -> Bool { false }
        func verifyCode(_ code: String) async throws {}
        func refresh() async throws {}
        func signOut() async {}
    }

    @MainActor
    func sampleEnvironment(signedIn: Bool = true, jobs: Bool = true) throws -> AppEnvironment {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("shots-\(UUID()).db").path
        let db = try Database(path: path, key: String(repeating: "ab", count: 32))
        let store = try LocalStore.open(db, deviceId: "shots")
        let kv = try KeyValue(db)
        let auth = SampleAuth()
        let sync = SyncService(store: store, kv: kv, transport: SilentTransport(), auth: auth)
        if signedIn {
            kv.setJSON(KVKey.user, SignedInUser(id: "u1", email: "tech@demo.leakbook.test"))
            kv.set(KVKey.launchSeen, "1")
            kv.set(KVKey.lastSyncedAt, String(Date().addingTimeInterval(-120).timeIntervalSince1970))
            kv.setTeam([TeamProfile(id: "u1", fullName: "Dana Tech", email: "tech@demo.leakbook.test")])
            try store.applyPage(
                PullPage(
                    rows: [
                        PulledRow(
                            table: "company", xid: "1",
                            row: [
                                "id": "c1", "company_id": "c1", "name": "Demo Leak Co.",
                                "timezone": "America/Phoenix", "settings": ["services": "both"],
                            ]),
                        PulledRow(
                            table: "membership", xid: "1",
                            row: [
                                "id": "m1", "company_id": "c1", "user_id": "u1", "role": "owner", "status": "active",
                            ]),
                    ], done: true, cursor: [:], serverHLC: "1760000000000-0000-srv"))
            if jobs { try seedJobs(store) }
        }
        let client = ServerCheck.makeClient()
        let session = Session(sync: sync, auth: auth)
        return AppEnvironment(client: client, session: session, walkthrough: Walkthrough(kv))
    }

    func seedJobs(_ store: LocalStore) throws {
        let iso = { (offset: TimeInterval) in isoTimestamp(milliseconds: (Date().timeIntervalSince1970 + offset) * 1000)
        }
        let maria = try store.insert(
            "customer", companyId: "c1",
            ["name": "Maria Alvarez", "phone": "(602) 555-0199", "email": "maria@example.com"])
        let pool = try store.insert(
            "property", companyId: "c1",
            [
                "customer_id": .string(maria), "address_line1": "1423 Palm Ct", "city": "Mesa", "state": "AZ",
                "postal_code": "85201", "has_pool": true, "has_spa": true, "pool_type": "gunite_plaster",
                "access_notes": "Gate code 4417. Dog in the side yard.",
            ])
        try store.insert(
            "job", companyId: "c1",
            [
                "property_id": .string(pool), "bill_to_customer_id": .string(maria), "status": "in_progress",
                "type": "detection", "started_at": .string(iso(-1800)), "assigned_user_id": "u1", "number": 1042,
                "fee_cents": 64900,
            ])
        let sam = try store.insert("customer", companyId: "c1", ["name": "Sam Sample"])
        let samPool = try store.insert(
            "property", companyId: "c1",
            ["customer_id": .string(sam), "address_line1": "88 Desert Willow Dr", "city": "Gilbert", "has_pool": true])
        try store.insert(
            "job", companyId: "c1",
            [
                "property_id": .string(samPool), "status": "scheduled", "type": "maintenance",
                "scheduled_start": .string(iso(3 * 86400)), "number": 1043,
            ])
        try store.insert(
            "job", companyId: "c1", ["property_id": .string(samPool), "status": "unscheduled", "type": "repair"])
    }

    @MainActor
    func snapshot(_ name: String, dark: Bool = false, largeText: Bool = false, _ view: some View) async throws {
        let size = CGSize(width: 393, height: 852)  // iPhone 16 / 17 points
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        let content = view.environment(\.dynamicTypeSize, largeText ? .accessibility2 : .large)
        window.rootViewController = UIHostingController(rootView: content)
        window.makeKeyAndVisible()
        try await Task.sleep(for: .milliseconds(800))
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        window.isHidden = true
        guard let folder = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"], !folder.isEmpty else { return }
        try FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
        try image.pngData()?.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
    }

    extension View {
        @MainActor func app(_ environment: AppEnvironment) -> some View {
            self.environment(environment.session).environment(environment.session.sync).environment(environment)
        }
    }

    @Suite(.serialized) @MainActor struct ScreenshotTests {
        @Test func signIn() async throws {
            let env = try sampleEnvironment(signedIn: false)
            try await snapshot("01-sign-in", SignInFlow().app(env))
            try await snapshot("01-sign-in-dark", dark: true, SignInFlow().app(env))
        }

        @Test func jobs() async throws {
            let env = try sampleEnvironment()
            try await snapshot("02-jobs", MainView().app(env))
            try await snapshot("02-jobs-dark", dark: true, MainView().app(env))
            try await snapshot("02-jobs-large-text", largeText: true, MainView().app(env))
        }

        @Test func emptyJobs() async throws {
            let env = try sampleEnvironment(jobs: false)
            try await snapshot("03-jobs-empty", MainView().app(env))
        }

        @Test func job() async throws {
            let env = try sampleEnvironment()
            let id = try #require(env.session.sync.store.list("job").first { $0["number"] == 1042 }?.id)
            try await snapshot("04-job", NavigationStack { JobScreen(jobId: id) }.app(env))
            try await snapshot("04-job-dark", dark: true, NavigationStack { JobScreen(jobId: id) }.app(env))
        }

        @Test func settings() async throws {
            let env = try sampleEnvironment()
            try await snapshot(
                "05-settings", NavigationStack { SettingsView(showWelcome: {}, showReauth: {}) }.app(env))
        }

        @Test func welcome() async throws {
            let env = try sampleEnvironment()
            try await snapshot("06-welcome", WelcomeView().app(env))
        }

        @Test func code() async throws {
            let env = try sampleEnvironment()
            try await snapshot("07-code", CodeView().app(env))
        }

        @Test func newJob() async throws {
            let env = try sampleEnvironment()
            let company = try #require(env.session.company)
            try await snapshot(
                "08-new-job",
                NewJobView(form: NewJobForm(sync: env.session.sync, company: company, userId: "u1")) { _ in }.app(env))
        }
    }
#endif
