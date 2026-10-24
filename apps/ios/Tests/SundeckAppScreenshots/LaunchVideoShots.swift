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

    // The App Store screenshots (docs/release/APP_STORE.md, "Screenshots") come from the same
    // shop and the same screens: .github/workflows/app-store-screenshots.yml runs this suite with
    // APP_STORE_SHOTS=1 and keeps app-store/*.png. The film's lv-*.png are drawn alongside.
    private let appStoreShots = ProcessInfo.processInfo.environment["APP_STORE_SHOTS"] == "1"

    /// The 6.9-inch iPhone (16 and 17 Pro Max): 440 × 956 points at 3x is 1320 × 2868 pixels, the
    /// size App Store Connect asks for first.
    private let storeScreen = CGSize(width: 440, height: 956)

    /// One App Store screenshot: `view` laid out on the 6.9-inch iPhone's screen, with its status
    /// bar and home indicator areas, a 9:41 status bar drawn in, saved as app-store/<name>.png at
    /// exactly 1320 × 2868. Rendered off screen like the other shots, so it shows the flat look of
    /// iOS 18 to 25 and no live maps. Does nothing without APP_STORE_SHOTS=1.
    @MainActor
    private func storeShot(_ name: String, scrolled: CGFloat? = nil, _ view: some View) async throws {
        guard appStoreShots else { return }
        Chrome.install()
        // Drawn like `snapshot`: in the simulator's scene when there is one (a window drawn with
        // layer.render left Today blank, 2026-10-24), off screen otherwise.
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: .zero)
        window.frame = CGRect(origin: .zero, size: storeScreen)
        window.overrideUserInterfaceStyle = .light
        let content = view.environment(\.dynamicTypeSize, .large)
            .environment(\.drawsGlass, false)
            .environment(\.drawsLiveMaps, false)
            .environment(\.keepsTitleFont, true)
        let host = UIHostingController(rootView: content)
        window.rootViewController = host
        window.makeKeyAndVisible()
        window.layoutIfNeeded()
        // The status bar (Dynamic Island) and home indicator areas of the 6.9-inch iPhone: only
        // what the window doesn't have already. A Pro Max simulator gives the window both, and
        // adding them again left an empty band under the status bar (2026-10-24).
        host.additionalSafeAreaInsets = UIEdgeInsets(
            top: max(0, 62 - window.safeAreaInsets.top), left: 0,
            bottom: max(0, 34 - window.safeAreaInsets.bottom), right: 0)
        for _ in 0..<15 {
            try await Task.sleep(for: .milliseconds(100))
            window.layoutIfNeeded()
        }
        if let scrolled, let scroll = pageScrollView(in: window) {
            scroll.setContentOffset(
                CGPoint(x: scroll.contentOffset.x, y: scroll.contentOffset.y + scrolled), animated: false)
            for _ in 0..<6 {
                try await Task.sleep(for: .milliseconds(100))
                window.layoutIfNeeded()
            }
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 3
        // App Store Connect takes screenshots without transparency.
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: storeScreen, format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: storeScreen))
            if scene != nil {
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            } else {
                window.layer.render(in: context.cgContext)
            }
            drawStatusBar(width: storeScreen.width)
        }
        window.isHidden = true
        let png = try #require(image.pngData())
        let pixels = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        #expect(pixels == CGSize(width: 1320, height: 2868), "\(name) is \(pixels)")
        #expect(!isBlank(image), "\(name) rendered blank")
        if let folder = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"], !folder.isEmpty {
            let store = URL(fileURLWithPath: folder).appendingPathComponent("app-store")
            try FileManager.default.createDirectory(at: store, withIntermediateDirectories: true)
            try png.write(to: store.appendingPathComponent("\(name).png"))
        }
    }

    /// The status bar Apple's own screenshots show: 9:41 beside the Dynamic Island, full bars,
    /// Wi-Fi and a full battery, in black on the light screens.
    @MainActor
    private func drawStatusBar(width: CGFloat) {
        let ink = UIColor.black
        let middle: CGFloat = 32
        let time = NSAttributedString(
            string: "9:41",
            attributes: [.font: UIFont.systemFont(ofSize: 17, weight: .semibold), .foregroundColor: ink])
        let timeSize = time.size()
        time.draw(at: CGPoint(x: 78 - timeSize.width / 2, y: middle - timeSize.height / 2))
        let config = UIImage.SymbolConfiguration(pointSize: 15, weight: .semibold)
        var x = width - 30
        for symbol in ["battery.100", "wifi", "cellularbars"] {
            guard
                let glyph = UIImage(systemName: symbol, withConfiguration: config)?
                    .withTintColor(ink, renderingMode: .alwaysOriginal)
            else { continue }
            x -= glyph.size.width
            glyph.draw(at: CGPoint(x: x, y: middle - glyph.size.height / 2))
            x -= 6
        }
    }

    private struct LaunchAuth: AuthBackend {
        func currentSession() async -> SignInResult? {
            SignInResult(user: SignedInUser(id: "u1", email: "dana@canyonstate.example"), needsCode: false)
        }
        func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("offline") }
        func signUp(name: String, email: String, password: String, heardFrom: String?, heardFromOther: String?)
            async throws -> Bool
        { false }
        func verifyCode(_ code: String) async throws {}
        func refresh() async throws {}
        func signOut() async {}
    }

    /// The office as the phone sees it when there's signal: every change is accepted at once and
    /// there's nothing new to download, so the sync bar stays hidden.
    private final class LaunchTransport: SyncTransport, @unchecked Sendable {
        func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
            PushResponse(
                serverHLC: "1760000000009-0000-srv",
                results: mutations.map { MutationResult(id: $0.id, status: .applied) })
        }
        func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
            PullPage(rows: [], done: true, cursor: cursor, serverHLC: "1760000000009-0000-srv")
        }
        func scope() async throws -> String? { nil }
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
            store: store, kv: kv, transport: LaunchTransport(), auth: auth, media: MediaFiles(root: files))
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

    /// A time this morning in Phoenix, as the server stores it: Rebecca's job runs 8:00 to 9:50 AM
    /// whatever time the capture runs.
    private func phoenixMorning(_ hour: Int, _ minute: Int) -> JSONValue {
        let zone = "America/Phoenix"
        return .string(
            zonedInstant(localDay(Date(), timeZone: zone), hour * 60 + minute, timeZone: zone).map(isoString) ?? "")
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
                // Her kidney pool, drawn in the app for the laminate card (owner, 2026-10-23: "include
                // a tree landmark"): the spa in its curve, a tree on each side, the equipment pad by
                // the spa (scripts/launch-video-seed.mjs, STORY_LAYOUT; the job's markup, STORY_MARKUP).
                "diagram_shape": "kidney",
                "diagram_layout": [
                    "centered": true,
                    "spa": ["x": 0.585, "y": 0.17, "r": 13, "size": "medium", "shape": "round"],
                    "landmarks": [
                        ["kind": "tree", "x": 0.07, "y": 0.22, "s": 28],
                        ["kind": "tree", "x": 0.93, "y": 0.72, "s": 24],
                        ["kind": "equipment", "x": 0.9, "y": 0.15, "s": 20],
                    ],
                ],
            ])
        try store.insert(
            "job", companyId: "c1",
            [
                "property_id": .string(pool), "bill_to_customer_id": .string(rebecca.id), "status": "in_progress",
                "type": "detection",
                "started_at": phoenixMorning(8, 0),
                "assigned_user_id": "u1", "number": 1042, "fee_cents": 37500,
                // Her two leaks marked up on the diagram: a red circle, an arrow and a label each.
                "diagram_markup": [
                    "version": 1,
                    "shapes": [
                        ["type": "circle", "color": "red", "cx": 0.79, "cy": 0.13, "rx": 0.065, "ry": 0.12],
                        ["type": "arrow", "color": "red", "x1": 0.735, "y1": 0.47, "x2": 0.775, "y2": 0.27],
                        ["type": "text", "color": "white", "x": 0.71, "y": 0.58, "text": "Break under deck", "s": 0.7],
                        ["type": "circle", "color": "red", "cx": 0.47, "cy": 0.86, "rx": 0.065, "ry": 0.12],
                        ["type": "arrow", "color": "red", "x1": 0.33, "y1": 0.56, "x2": 0.43, "y2": 0.77],
                        ["type": "text", "color": "white", "x": 0.3, "y": 0.47, "text": "Dye at the light", "s": 0.7],
                    ],
                ],
            ])
    }

    /// Rebecca's leak detection as the narration tells it: the return line dropped on the
    /// pressure test (a break under the deck), and dye pulled into the light niche's conduit.
    /// Checklist, test, both findings pinned on her kidney pool with a spa, a dye photo, the draft
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
        try InspectionWrites.setDiagramShape(sync, propertyId: propertyId, companyId: "c1", shape: .kidney)
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
        try sync.store.write("test_result", id: test, companyId: "c1", ["performed_at": phoenixMorning(8, 30)])
        let returnFinding = try InspectionWrites.saveFinding(
            sync, companyId: "c1", jobId: job, existing: nil, title: "Return line break", componentId: returns.id,
            severityKey: "major", location: "Under the deck, 6 ft from the pool wall", pin: (0.79, 0.13),
            status: .open, notes: "Return line dropped 8 PSI in 15 minutes; the others held.")
        let lightFinding = try InspectionWrites.saveFinding(
            sync, companyId: "c1", jobId: job, existing: nil, title: "Light niche conduit leak", componentId: light.id,
            severityKey: "moderate", location: "Behind the pool light", pin: (0.47, 0.86), status: .open,
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

    /// Rebecca Quinn's signature as the pad records it: x, y pairs per stroke (top-left origin).
    /// The same strokes as apps/video/assets/owner/rebecca-signature.svg.
    private func rebeccaSignature() -> [SignatureStroke] {
        let strokes: [[Double]] = [
            [
                32.8, 150, 34.5, 144, 36.2, 138, 37.8, 132, 39.5, 126, 41.2, 120, 42.9, 114, 44.6, 108, 46.2, 102, 47.9,
                96, 49.6, 90, 51.3, 84, 53, 78, 54.6, 72, 56.3, 66, 58, 60, 59.7, 54, 61.4, 48, 63, 42, 64.7, 36, 66.4,
                30, 66.4, 30, 70.3, 30.2, 74.1, 30.6, 77.8, 31.4, 81.2, 32.4, 84.3, 33.8, 87.2, 35.3, 89.8, 37.2, 92,
                39.3, 93.9, 41.5, 95.4, 44, 96.5, 46.6, 97.1, 49.3, 97.4, 52.2, 97.2, 55.1, 96.6, 58, 95.5, 60.9, 94.1,
                63.8, 92.3, 66.7, 90.1, 69.4, 87.5, 72, 84.7, 74.5, 81.6, 76.7, 78.2, 78.8, 74.6, 80.7, 70.8, 82.2,
                66.9, 83.6, 62.8, 84.6, 58.8, 85.4, 54.7, 85.8, 50.7, 86, 56.7, 90.2, 58.8, 94.4, 60.8, 98.6, 62.8,
                102.8, 64.8, 107, 66.9, 111.2, 68.9, 115.4, 70.9, 119.6, 72.9, 123.8, 75, 128, 77, 132.2, 79, 136.4, 81,
                140.6, 83.1, 144.8, 85.1, 149,
            ],
            [
                105.1, 113.2, 104.1, 113.3, 103, 114.1, 101.8, 115.5, 100.7, 117.5, 99.8, 120, 99, 122.9, 98.6, 126.1,
                98.4, 129.6, 98.7, 133.1, 99.4, 136.6, 100.6, 139.9, 102.2, 143, 104.2, 145.7, 106.7, 147.9, 109.6,
                149.6, 112.9, 150.6, 116.4, 151.1, 120.2, 150.8, 124.1, 149.9, 128, 148.3, 132, 146.2, 135.8, 143.5,
                139.5, 140.3, 142.9, 136.8, 146, 133, 148.8, 129.1, 151.1, 125.1, 153, 121.3, 154.4, 117.6, 155.3,
                114.3, 155.9, 111.4, 156, 109.1, 155.7, 107.3, 155.1, 106.1, 154.3, 105.6, 153.2, 105.8, 152.1, 106.7,
                151, 108.1, 149.9, 110.2, 148.9, 112.7, 148.2, 115.7, 147.8, 118.9, 147.7, 122.3, 148, 125.9, 148.7,
                129.3, 149.9, 132.7, 151.6, 135.7, 153.7, 138.3, 156.2, 140.5, 159.1, 142.2, 162.4, 143.2, 166, 143.5,
                169.7, 143.2, 173.7, 142.2, 177.6, 140.6, 181.6, 138.4, 185.4, 135.6, 189.1, 132.4, 192.5, 128.9, 195.5,
                125.1, 198.2, 121.1, 200.5, 117.2, 202.3, 113.4, 203.7, 109.8, 204.6, 106.5, 205.1, 103.7, 205.2, 101.3,
                204.9, 99.6, 204.3, 98.5, 203.4, 98.1, 202.4, 98.3, 201.2, 99.2, 200.1, 100.8, 199, 102.8, 198.1, 105.4,
                197.4, 108.4, 197, 111.7, 196.9, 115.1, 197.3, 118.7, 198.1, 122.1, 199.3, 125.4, 201, 128.4, 203.1,
                131, 205.7, 133.2, 208.7, 134.7, 212, 135.7, 215.6, 136, 219.3, 135.6, 223.3, 134.6, 227.2, 132.9,
                231.2, 130.6, 235, 127.8, 238.6, 124.6, 242, 121, 245, 117.2, 247.7, 113.2, 249.9, 109.3, 251.7, 105.5,
                253.1, 101.9, 253.9, 98.7, 254.4, 95.9, 254.4, 93.6, 254.1, 91.9, 253.4, 90.9, 252.5, 90.5, 251.5, 90.9,
                250.4, 91.8, 249.2, 93.4, 248.1, 95.5, 247.2, 98.1, 246.6, 101.2, 246.2, 104.5, 246.2, 107.9, 246.6,
                111.4, 247.4, 114.9, 248.7, 118.2, 250.4, 121.1, 252.6, 123.7, 255.2, 125.8, 258.2, 127.3, 261.5, 128.2,
                265.1, 128.4, 268.9, 128, 272.9, 126.9, 276.8, 125.2, 280.8, 122.8, 284.6, 120, 288.2, 116.7, 291.5,
                113.1, 294.5, 109.3, 297.2, 105.3, 299.4, 101.4, 301.1, 97.6, 302.4, 94, 303.2, 90.8, 303.6, 88.1,
                303.6, 85.9, 303.3, 84.3, 302.6, 83.3, 301.7, 83, 300.6, 83.4, 299.5, 84.4, 298.3, 86, 297.3, 88.2,
                296.4, 90.9, 295.8, 93.9, 295.4, 97.2, 295.4, 100.7, 295.9, 104.2, 296.7, 107.7, 298, 110.9, 299.8,
                113.9, 302, 116.4, 304.7, 118.4, 307.7, 119.9, 311.1, 120.7, 314.7, 120.9, 318.5, 120.4, 322.5, 119.2,
                326.4, 117.4, 330.4, 115.1, 334.2, 112.2, 337.7, 108.9, 341.1, 105.2, 344, 101.4, 346.6, 97.4, 348.8,
                93.5, 350.5, 89.7, 351.7, 86.2, 352.5, 83, 352.9, 80.3, 352.8, 78.2, 352.4, 76.6, 351.7, 75.7,
            ],
            [
                361.6, 47, 357.8, 47.3, 353.9, 48.2, 349.9, 49.6, 345.9, 51.6, 341.9, 54.1, 338, 57.1, 334.2, 60.5,
                330.6, 64.4, 327.2, 68.6, 324, 73.2, 321.1, 78, 318.6, 83.1, 316.4, 88.2, 314.6, 93.5, 313.3, 98.8,
                312.3, 104, 311.8, 109.1, 311.7, 114.1, 312, 118.8, 312.8, 123.2, 314, 127.3, 315.6, 131, 317.7, 134.3,
                320, 137.1, 322.8, 139.3, 325.8, 141.1, 329.1, 142.3, 332.7, 142.9, 336.4, 142.9, 340.2, 142.4, 344.2,
                141.3, 348.2, 139.6, 352.2, 137.4, 356.2, 134.7, 360.1, 131.5, 363.8, 127.9, 367.3, 123.8, 370.6, 119.4,
                373.7, 114.8, 376.4, 109.8, 378.8, 104.7, 380.8, 99.5, 382.4, 94.2, 383.6, 89, 384.4, 83.8, 384.7, 78.7,
                384.6, 73.9, 384.1, 69.3, 383.1, 65, 381.7, 61.1, 379.9, 57.5, 377.8, 54.5, 375.2, 51.9, 372.4, 49.8,
                369.2, 48.3, 365.8, 47.4, 362.2, 47, 358.4, 47.2, 354.5, 48, 350.5, 49.3,
            ],
            [
                343.4, 130, 345, 132.4, 346.6, 134.8, 348.2, 137.1, 349.9, 139.5, 351.5, 141.7, 353.2, 143.9, 354.9,
                146, 356.6, 148, 358.4, 149.8, 360.1, 151.6, 362, 153.3, 363.8, 154.8, 365.7, 156.2, 367.6, 157.5,
                369.6, 158.6, 371.6, 159.6, 373.6, 160.6, 375.7, 161.4, 377.7, 162.1, 379.8, 162.7, 382, 163.3, 384.1,
                163.7, 386.3, 164.2, 388.4, 164.6, 390.6, 165,
            ],
            [
                403.9, 117.6, 403.1, 117.7, 402.3, 118.4, 401.4, 119.7, 400.6, 121.4, 399.9, 123.5, 399.4, 126, 399.1,
                128.8, 399.1, 131.8, 399.4, 134.8, 400.1, 137.8, 401.2, 140.6, 402.7, 143.3, 404.5, 145.6, 406.7, 147.5,
                409.3, 149, 412.1, 149.9, 415.2, 150.3, 418.5, 150.1, 421.9, 149.4, 425.4, 148.1, 428.8, 146.3, 432.2,
                144.1, 435.4, 141.4, 438.4, 138.5, 441.2, 135.3, 443.6, 132, 445.7, 128.7, 447.4, 125.5, 448.7, 122.5,
                449.6, 119.7, 450.1, 117.3, 450.3, 115.3, 450.2, 113.9, 449.8, 112.9, 449.2, 112.6, 448.4, 112.8, 447.6,
                113.5, 446.7, 114.8, 445.9, 116.5, 445.2, 118.7, 444.7, 121.3, 444.5, 124.1, 444.5, 127, 444.9, 130,
                445.6, 133, 446.7, 135.8, 448.2, 138.5, 450.1, 140.7, 452.4, 142.6, 454.9, 144, 457.8, 144.9, 460.9,
                145.3, 464.2, 145.1, 467.6, 144.3, 471.1, 142.9, 474.6, 141.1, 477.9, 138.8, 481.1, 136.1, 484.1, 133.2,
                486.8, 130, 489.2, 126.7, 491.2, 123.4, 492.9, 120.2, 494.2, 117.2, 495, 114.4, 495.5, 112.1, 495.7,
                110.2, 495.6, 108.7, 495.1, 107.9, 494.5, 107.5, 493.8, 107.8, 492.9, 108.6, 492, 109.9, 491.2, 111.7,
                490.6, 113.9, 490.1, 116.5, 489.8, 119.3, 489.9, 122.3, 490.3, 125.3, 491.1, 128.3, 492.2, 131.1, 493.8,
                133.7, 495.7, 135.9, 498, 137.7, 500.6, 139.1, 503.5, 140, 506.6, 140.3, 509.9, 140, 513.4, 139.1,
                516.8, 137.8, 520.3, 135.9, 523.6, 133.5, 526.8, 130.8, 529.7, 127.8, 532.4, 124.6, 534.8, 121.4, 536.8,
                118.1, 538.4, 114.9, 539.6, 111.9, 540.5, 109.2, 541, 106.9, 541.1, 105, 540.9, 103.6, 540.5, 102.8,
                539.8, 102.5, 539.1, 102.8, 538.2, 103.7, 537.3, 105, 536.6, 106.9, 535.9, 109.1, 535.4, 111.7, 535.2,
                114.5, 535.3, 117.5, 535.7, 120.5, 536.5, 123.5, 537.7, 126.3, 539.3, 128.9, 541.3, 131.1, 543.6, 132.9,
                546.2, 134.2, 549.2, 135, 552.3, 135.2, 555.6, 134.9, 559.1, 134, 562.5, 132.6, 566, 130.6, 569.3,
                128.3, 572.5, 125.5, 575.4, 122.5, 578, 119.3, 580.4, 116, 582.3, 112.7, 583.9, 109.6, 585.1, 106.6,
                585.9, 103.9, 586.4, 101.6, 586.5, 99.8, 586.3, 98.5, 585.8, 97.7,
            ],
            [
                560, 160, 564.9, 160.3, 569.8, 160.6, 574.8, 160.9, 579.7, 161.1, 584.6, 161.4, 589.6, 161.6, 594.5,
                161.7, 599.5, 161.8, 604.5, 161.9, 609.5, 161.9, 614.5, 161.8, 619.5, 161.7, 624.6, 161.5, 629.6, 161.3,
                634.7, 160.9, 639.9, 160.5, 645, 160, 650.2, 159.4, 655.3, 158.8, 660.6, 158, 665.8, 157.2, 671.1,
                156.2, 676.3, 155.2, 681.6, 154.1, 687, 152.9, 692.3, 151.7, 697.7, 150.3, 703.1, 148.9, 708.5, 147.4,
                713.9, 145.9, 719.4, 144.3, 724.9, 142.6, 730.3, 140.9, 735.8, 139.2, 741.3, 137.4, 746.9, 135.5, 752.4,
                133.7, 757.9, 131.8, 763.4, 129.9, 769, 128,
            ],
        ]
        return strokes.map { flat in stride(from: 0, to: flat.count - 1, by: 2).map { SIMD2(flat[$0], flat[$0 + 1]) } }
    }

    @Suite(.serialized, .enabled(if: launchShots || appStoreShots)) @MainActor struct LaunchVideoShots {
        /// Today, Today with the first stop done, and Today in dark mode at 6 AM.
        @Test func today() async throws {
            let env = try launchEnvironment()
            let store = env.session.sync.store
            try launchRoute(store)
            env.session.reloadCompanies()
            try await snapshot("lv-today", height: 1500, MainView().app(env))
            try await storeShot("01-today", MainView().app(env))
            try await snapshot("lv-today-dark", dark: true, height: 1500, MainView().app(env))
            let visit = try #require(try seedCleanings(store))
            try await snapshot("lv-today-pool", height: 1500, MainView().app(env))
            try await snapshot(
                "lv-cleanings", height: 2400, NavigationStack { JobScreen(jobId: visit, section: .checklist) }.app(env))
            try await storeShot(
                "03-pool-visit", NavigationStack { JobScreen(jobId: visit, section: .checklist) }.app(env))
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
            await sync.syncNow()
            try await snapshot(
                "lv-checklist", height: 3000,
                NavigationStack { JobScreen(jobId: ids.job, section: .checklist) }.app(env))
            try await storeShot(
                "05-leak-checklist", NavigationStack { JobScreen(jobId: ids.job, section: .checklist) }.app(env))
            try await snapshot(
                "lv-pressure-test", TestEditor(jobId: ids.job, testId: ids.test, typeId: nil, componentId: nil).app(env)
            )
            try await snapshot(
                "lv-findings", height: 2200, NavigationStack { JobScreen(jobId: ids.job, section: .findings) }.app(env))
            try await storeShot(
                "06-findings", NavigationStack { JobScreen(jobId: ids.job, section: .findings) }.app(env))
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
            let signature = try SignatureWrites.save(
                sync, companyId: "c1", jobId: job.id, purpose: .inspectionAck, signerName: "Rebecca Quinn",
                signerRole: "Homeowner", strokes: rebeccaSignature(), at: nil)
            try store.write("signature", id: signature, companyId: "c1", ["signed_at": phoenixMorning(9, 42)])
            await sync.syncNow()
            list = wrapUp(wrapUpInput(store: store, companyId: "c1", settings: nil, job: job))
            try await snapshot(
                "lv-signed", height: 3600, WrapUpStepSheet(job: job, step: sign, title: sign.title(list)).app(env))
            // The report as Rebecca reads it before signing. (The signature step's drawn strokes
            // don't render off screen, so the store shows the report instead.)
            try await storeShot("07-review", NavigationStack { ReviewScreen(jobId: job.id) }.app(env))
            let report = WrapUpOpen(step: .report, refId: nil)
            try await snapshot(
                "lv-send-report", height: 3600,
                WrapUpStepSheet(job: job, step: report, title: report.title(list)).app(env))
            try await storeShot(
                "08-report", WrapUpStepSheet(job: job, step: report, title: report.title(list)).app(env))
            let quoteStep = WrapUpOpen(step: .quote, refId: quote)
            try await snapshot(
                "lv-quote", height: 3600,
                WrapUpStepSheet(job: job, step: quoteStep, title: quoteStep.title(list)).app(env))
            try await storeShot(
                "09-quote", WrapUpStepSheet(job: job, step: quoteStep, title: quoteStep.title(list)).app(env))
            // In the backyard with no signal: two answers saved on the phone, waiting to sync.
            sync.networkChanged(online: false)
            let inspection = JobInspection(store, jobId: job.id)
            for c in inspection.components.dropFirst(12).prefix(2) {
                try InspectionWrites.setVerdict(
                    sync, companyId: "c1", jobId: job.id, componentId: c.id,
                    existing: inspection.resultByComponent[c.id], verdict: .ok, userId: "u1")
            }
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
            let whatToAdd = FormSheet(title: "What to Add", cancelTitle: "Close") {
                DoseList(
                    result: calculateChemistry(
                        ChemistryInput(
                            gallons: 18000, readings: Readings(fc: 1.5, ph: 7.9, ta: 90, ch: 250, cya: 40),
                            chlorine: .liquid12, acid: .muriatic31)))
            }
            try await snapshot("lv-what-to-add", height: 1200, whatToAdd.app(env))
            try await storeShot("04-what-to-add", whatToAdd.app(env))
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

        /// App Store only: Schedule's day with the route in order. The day map is folded, since a
        /// live map can't be drawn into a picture (DayMapCanvas).
        @Test func storeSchedule() async throws {
            guard appStoreShots else { return }
            let env = try launchEnvironment()
            try launchRoute(env.session.sync.store)
            env.session.reloadCompanies()
            let mapWasOpen = UserDefaults.standard.object(forKey: "schedule.dayMapOpen")
            UserDefaults.standard.set(false, forKey: "schedule.dayMapOpen")
            defer { UserDefaults.standard.set(mapWasOpen, forKey: "schedule.dayMapOpen") }
            try await storeShot("02-schedule", NavigationStack { ScheduleScreen() }.app(env))
        }

        /// App Store only: texting Rebecca from the company number, the report and quote sent.
        @Test func storeMessages() async throws {
            guard appStoreShots else { return }
            let env = try launchEnvironment()
            let store = env.session.sync.store
            try launchRoute(store)
            env.session.reloadCompanies()
            let rebecca = try #require(try store.list("customer").first { $0["name"] == "Rebecca Quinn" }?.id)
            let ago = { (minutes: Double) in
                isoTimestamp(milliseconds: (Date().timeIntervalSince1970 - minutes * 60) * 1000)
            }
            let text = { (id: String, minutes: Double, dir: String, body: String) -> PulledRow in
                PulledRow(
                    table: "text_message", xid: "6",
                    row: [
                        "id": .string(id), "company_id": "c1", "conversation_id": "cv1",
                        "created_at": .string(ago(minutes)), "direction": .string(dir), "body": .string(body),
                        "media": [], "status": .string(dir == "out" ? "delivered" : "received"),
                        "sent_by": dir == "out" ? JSONValue.string("u1") : .null,
                    ])
            }
            try store.applyPage(
                PullPage(
                    rows: [
                        PulledRow(
                            table: "phone_line", xid: "6",
                            row: [
                                "id": "pl1", "company_id": "c1", "number": "+16025550100", "status": "active",
                                "pictures": true,
                            ]),
                        PulledRow(
                            table: "conversation", xid: "6",
                            row: [
                                "id": "cv1", "company_id": "c1", "phone": "+14805550171",
                                "customer_id": .string(rebecca), "last_at": .string(ago(4)),
                                "last_preview": "That was fast. Go ahead with the repair, thank you!",
                                "unread": false, "opted_out": false,
                            ]),
                        text(
                            "st1", 130, "out",
                            "Hi Rebecca, it’s Dana with Canyon State. I’m on my way, about 15 minutes out."),
                        text("st2", 126, "in", "Great, the gate code is 1955."),
                        text(
                            "st3", 12, "out",
                            "We found two leaks: a break in the return line under the deck, and the light niche. Your report and the repair quote are in your email."
                        ),
                        text("st4", 4, "in", "That was fast. Go ahead with the repair, thank you!"),
                    ], done: true, cursor: [:], serverHLC: "1760000000006-0000-srv"))
            try await storeShot("10-messages", NavigationStack { ConversationScreen(conversationId: "cv1") }.app(env))
        }
    }
#endif
