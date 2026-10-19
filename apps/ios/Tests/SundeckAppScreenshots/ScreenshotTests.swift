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
        let files = FileManager.default.temporaryDirectory.appendingPathComponent("shots-media-\(UUID())")
        let sync = SyncService(
            store: store, kv: kv, transport: SilentTransport(), auth: auth, media: MediaFiles(root: files))
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

    /// The sample job's inspection, partly done: config from a new shop, the default checklist,
    /// a few verdicts, a failing pressure test, and a pinned finding on a kidney pool.
    @MainActor
    func seedInspection(_ env: AppEnvironment) throws -> (job: String, seam: String, test: String, finding: String) {
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

        let jobs = try sync.store.list("job")
        let jobRow = try #require(jobs.first { $0["number"] == 1042 })
        let job = try #require(jobRow["id"]?.string)
        let propertyId = try #require(jobRow["property_id"]?.string)
        let stored = try sync.store.get("property", propertyId)
        let property = try JSONValue.object(try #require(stored)).decode(Property.self)
        try InspectionWrites.setDiagramShape(sync, propertyId: propertyId, companyId: "c1", shape: .kidney)
        let types = InspectionConfig(sync.store, companyId: "c1")
        try InspectionWrites.createChecklist(
            sync, companyId: "c1", jobId: job, types: types.componentTypes, property: property, jobType: .detection)
        let inspection = JobInspection(sync.store, jobId: job)
        let key = { (c: JobComponent) in types.componentTypeById[c.componentTypeId]?.key ?? "" }
        for (i, c) in inspection.components.enumerated() where i < 12 {
            let verdict: Verdict = key(c) == "skimmer_seam" ? .leaking : key(c) == "backwash" ? .attention : .ok
            try InspectionWrites.setVerdict(
                sync, companyId: "c1", jobId: job, componentId: c.id, existing: inspection.resultByComponent[c.id],
                verdict: verdict, userId: "u1")
        }
        let seam = try #require(inspection.components.first { key($0) == "skimmer_seam" })
        try InspectionWrites.saveChecklistResult(
            sync, companyId: "c1", jobId: job, componentId: seam.id,
            existing: JobInspection(sync.store, jobId: job).resultByComponent[seam.id],
            ["location_text": "Seam at the skimmer throat"])
        let pressure = try #require(types.testTypes.first { $0.key == "pressure" })
        let data = normalizeTestData(
            pressure.fieldSchema,
            ["line_name": "Skimmer", "start_psi": "20", "end_psi": "12", "duration_min": "15"].mapValues { .string($0) }
        )
        let test = try InspectionWrites.saveTest(
            sync, companyId: "c1", jobId: job, existing: nil, type: pressure, componentId: seam.id, data: data,
            outcome: calculate(pressure, data).suggested, notes: "")
        let finding = try InspectionWrites.saveFinding(
            sync, companyId: "c1", jobId: job, existing: nil, title: "Skimmer seam leak", componentId: seam.id,
            severityKey: "major", location: "Skimmer throat", pin: (0.18, 0.12), status: .open, notes: "")
        try seedPhoto(sync, job: job, componentId: seam.id)
        return (job, seam.id, test, finding)
    }

    /// A drawn stand-in for a pool photo on the skimmer seam, with markup and a caption.
    @MainActor
    func seedPhoto(_ sync: SyncService, job: String, componentId: String) throws {
        let size = CGSize(width: 1600, height: 1200)
        let image = UIGraphicsImageRenderer(size: size).image { context in
            UIColor(red: 0.62, green: 0.80, blue: 0.90, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor(red: 0.85, green: 0.82, blue: 0.75, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: size.width, height: 360))
            UIColor.white.setFill()
            context.fill(CGRect(x: 520, y: 260, width: 560, height: 220))
            UIColor(white: 0.25, alpha: 1).setFill()
            context.fill(CGRect(x: 600, y: 330, width: 400, height: 90))
        }
        let temp = FileManager.default.temporaryDirectory.appendingPathComponent("shot-\(UUID()).jpg")
        try #require(image.jpegData(compressionQuality: 0.7)).write(to: temp)
        let id = try MediaWrites.saveCapture(
            sync, companyId: "c1", target: MediaTarget(jobId: job, componentId: componentId),
            CapturedFile(
                kind: .photo, url: temp, mime: "image/jpeg", width: 1600, height: 1200,
                capturedAt: isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000)),
            at: Coordinate(latitude: 33.4152, longitude: -111.8315))
        let media = try #require(jobMedia(sync.store, MediaTarget(jobId: job)).first { $0.id == id })
        try MediaWrites.setMarkup(
            sync, media,
            Markup(
                shapes: [
                    .circle(color: .red, cx: 0.5, cy: 0.31, rx: 0.2, ry: 0.12),
                    .arrow(color: .yellow, x1: 0.18, y1: 0.75, x2: 0.4, y2: 0.4),
                    .text(color: .white, x: 0.12, y: 0.82, text: "Crack"),
                ]))
        try MediaWrites.setCaption(sync, media, "Seam at the skimmer throat")
    }

    @MainActor
    func snapshot(
        _ name: String, dark: Bool = false, largeText: Bool = false, height: CGFloat? = nil, _ view: some View
    ) async throws {
        // Package tests run in a bare xctest host with no app scene. With a scene, draw the window on
        // screen; without one, lay the window out off screen and render its layers.
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window =
            scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        if let scene { window.frame = scene.coordinateSpace.bounds }
        // A long screen in one picture (the job page with its tab).
        if let height { window.frame.size.height = height }
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        let content = view.environment(\.dynamicTypeSize, largeText ? .accessibility2 : .large)
        window.rootViewController = UIHostingController(rootView: content)
        window.makeKeyAndVisible()
        // Let SwiftUI load data (.task) and settle, then lay out once more.
        for _ in 0..<12 {
            try await Task.sleep(for: .milliseconds(100))
            window.layoutIfNeeded()
        }
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { context in
            if scene != nil {
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            } else {
                window.layer.render(in: context.cgContext)
            }
        }
        window.isHidden = true
        let png = try #require(image.pngData())
        if let folder = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"], !folder.isEmpty {
            try FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
            try png.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
        }
        // A blank picture means nothing was drawn.
        #expect(!isBlank(image), "\(name) rendered blank")
    }

    /// Whether every sampled pixel has the same color. Walks rows by bytesPerRow: rows are padded,
    /// and reading the padding as pixels made blank pictures look drawn.
    @MainActor
    func isBlank(_ image: UIImage) -> Bool {
        guard let cg = image.cgImage, let data = cg.dataProvider?.data, let bytes = CFDataGetBytePtr(data) else {
            return true
        }
        let pixelBytes = max(1, cg.bitsPerPixel / 8)
        var first: [UInt8]?
        for y in stride(from: 0, to: cg.height, by: max(1, cg.height / 64)) {
            for x in stride(from: 0, to: cg.width, by: max(1, cg.width / 64)) {
                let offset = y * cg.bytesPerRow + x * pixelBytes
                let pixel = (0..<min(pixelBytes, 3)).map { bytes[offset + $0] }
                if let first, first != pixel { return false }
                first = first ?? pixel
            }
        }
        return true
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

        @Test func inspection() async throws {
            let env = try sampleEnvironment()
            let ids = try seedInspection(env)
            try await snapshot("09-checklist", height: 3000, NavigationStack { JobScreen(jobId: ids.job) }.app(env))
            try await snapshot(
                "09-checklist-dark", dark: true, height: 3000, NavigationStack { JobScreen(jobId: ids.job) }.app(env))
            try await snapshot(
                "10-tests", height: 1800, NavigationStack { JobScreen(jobId: ids.job, tab: .tests) }.app(env))
            try await snapshot(
                "11-findings", height: 1800, NavigationStack { JobScreen(jobId: ids.job, tab: .findings) }.app(env))
            try await snapshot(
                "12-component", NavigationStack { ComponentScreen(jobId: ids.job, componentId: ids.seam) }.app(env))
            try await snapshot(
                "13-test-editor",
                TestEditor(jobId: ids.job, testId: ids.test, typeId: nil, componentId: nil).app(env))
            try await snapshot(
                "14-finding-editor",
                FindingEditor(jobId: ids.job, findingId: ids.finding, componentId: nil).app(env))
            try await snapshot(
                "14-finding-editor-large-text", largeText: true,
                FindingEditor(jobId: ids.job, findingId: ids.finding, componentId: nil).app(env))
            let photo = try #require(jobMedia(env.session.sync.store, MediaTarget(jobId: ids.job)).first?.id)
            try await snapshot(
                "15-media", NavigationStack { MediaScreen(jobId: ids.job, mediaId: photo) }.app(env))
            try await snapshot(
                "15-media-dark", dark: true,
                NavigationStack { MediaScreen(jobId: ids.job, mediaId: photo) }.app(env))
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
