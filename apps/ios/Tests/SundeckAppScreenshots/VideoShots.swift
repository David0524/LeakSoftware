#if os(iOS)
    import Foundation
    import SundeckCore
    import SundeckLiveStop
    import SundeckStorage
    import SundeckSync
    import SundeckTokens
    import SwiftUI
    import Testing
    import UIKit

    @testable import SundeckApp

    // The iPhone frames for the two demo videos (docs/plans/demo-videos.md, sections 2 and 3):
    // the app's own screens with each video shop's day seeded on the phone, several states per
    // scene so the video can show a tap and its result. Every frame is the real SwiftUI screen;
    // the data goes in through the app's own writes (On My Way, Start, Mark Complete, tests,
    // findings, photos) where it has one, and as a sync would bring it where the server writes
    // it (reports, sent quotes). Runs only with VIDEO_SHOTS=1 (.github/workflows/video-shots.yml),
    // so the regular screenshot run skips it. PNGs at 3x of a 402 x 874 pt iPhone screen.

    private let videoRun = ProcessInfo.processInfo.environment["VIDEO_SHOTS"] == "1"
    /// iPhone 17 Pro: the screen in points, and the status bar and home indicator.
    private let videoScreen = CGSize(width: 402, height: 874)
    private let videoSafeArea = UIEdgeInsets(top: 62, left: 0, bottom: 34, right: 0)
    private let zone = "America/Phoenix"

    // MARK: - The phone

    /// A server that takes every change and has nothing new: the phone reads "All changes saved".
    final class SettledTransport: SyncTransport, @unchecked Sendable {
        func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
            PushResponse(
                serverHLC: "\(Int(Date().timeIntervalSince1970 * 1000))-0000-srv",
                results: mutations.map { MutationResult(id: $0.id, status: .applied) })
        }
        func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
            PullPage(
                rows: [], done: true, cursor: cursor, serverHLC: "\(Int(Date().timeIntervalSince1970 * 1000))-0000-srv")
        }
        func scope() async throws -> String? { nil }
    }

    struct VideoAuth: AuthBackend {
        var user: SignedInUser
        func currentSession() async -> SignInResult? { SignInResult(user: user, needsCode: false) }
        func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("offline") }
        func signUp(name: String, email: String, password: String) async throws -> Bool { false }
        func verifyCode(_ code: String) async throws {}
        func refresh() async throws {}
        func signOut() async {}
    }

    struct VideoPerson {
        var id: String
        var name: String
        var email: String
        var role: String
    }

    struct VideoShop {
        var name: String
        var services: String
        var street: String
        var city: String
        var zip: String
        var lat: Double
        var lng: Double
        var phone: String
        /// The signed-in tech first.
        var people: [VideoPerson]
    }

    let canyonState = VideoShop(
        name: "Canyon State Leak Detection", services: "leak", street: "2150 W Dunlap Ave", city: "Phoenix",
        zip: "85021", lat: 33.5675, lng: -112.1050, phone: "(602) 555-0147",
        people: [
            VideoPerson(id: "u1", name: "Dana Ruiz", email: "dana@canyonstateleak.com", role: "tech"),
            VideoPerson(id: "u2", name: "Jake Turner", email: "jake@canyonstateleak.com", role: "tech"),
            VideoPerson(id: "u3", name: "Marcus Hale", email: "marcus@canyonstateleak.com", role: "owner"),
        ])

    let blueMesa = VideoShop(
        name: "Blue Mesa Pool Co.", services: "pool", street: "1955 N Alma School Rd", city: "Chandler",
        zip: "85224", lat: 33.3290, lng: -111.8580, phone: "(480) 555-0163",
        people: [
            VideoPerson(id: "u1", name: "Priya Shah", email: "priya@bluemesapool.com", role: "tech"),
            VideoPerson(id: "u2", name: "Luis Ramirez", email: "luis@bluemesapool.com", role: "tech"),
            VideoPerson(id: "u3", name: "Tony Alvarez", email: "tony@bluemesapool.com", role: "tech"),
            VideoPerson(id: "u4", name: "Erin Cole", email: "erin@bluemesapool.com", role: "owner"),
        ])

    /// A signed-in phone for the shop's first person: synced a minute ago, tips and the welcome
    /// already seen, the shop's people, and its checklist, tests and severities.
    @MainActor
    func videoEnvironment(_ shop: VideoShop) throws -> AppEnvironment {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("video-\(UUID()).db").path
        let db = try Database(path: path, key: String(repeating: "cd", count: 32))
        let store = try LocalStore.open(db, deviceId: "video")
        let kv = try KeyValue(db)
        let me = shop.people[0]
        let user = SignedInUser(id: me.id, email: me.email)
        kv.setJSON(KVKey.user, user)
        kv.set(KVKey.launchSeen, "1")
        kv.set(KVKey.initialSyncDone, "1")
        kv.set(KVKey.lastSyncedAt, String(Date().addingTimeInterval(-60).timeIntervalSince1970))
        kv.setJSON(KVKey.tipsSeen, tips.map(\.id))
        kv.setTeam(shop.people.map { TeamProfile(id: $0.id, fullName: $0.name, email: $0.email) })
        var rows: [PulledRow] = [
            PulledRow(
                table: "company", xid: "1",
                row: [
                    "id": "c1", "company_id": "c1", "name": .string(shop.name), "timezone": .string(zone),
                    "settings": ["services": .string(shop.services)], "address_line1": .string(shop.street),
                    "city": .string(shop.city), "state": "AZ", "postal_code": .string(shop.zip),
                    "latitude": .number(shop.lat), "longitude": .number(shop.lng), "phone": .string(shop.phone),
                ])
        ]
        for p in shop.people {
            rows.append(
                PulledRow(
                    table: "membership", xid: "1",
                    row: [
                        "id": .string("m-\(p.id)"), "company_id": "c1", "user_id": .string(p.id),
                        "role": .string(p.role), "status": "active",
                    ]))
        }
        let url = try #require(Bundle.module.url(forResource: "config", withExtension: "json"))
        let config = try JSONDecoder().decode([String: [Row]].self, from: Data(contentsOf: url))
        for (table, list) in config {
            for row in list {
                var r = row
                r["company_id"] = "c1"
                rows.append(PulledRow(table: table, xid: "1", row: r))
            }
        }
        try store.applyPage(PullPage(rows: rows, done: true, cursor: [:], serverHLC: "1760000000000-0000-srv"))
        let auth = VideoAuth(user: user)
        let files = FileManager.default.temporaryDirectory.appendingPathComponent("video-media-\(UUID())")
        let sync = SyncService(
            store: store, kv: kv, transport: SettledTransport(), auth: auth, media: MediaFiles(root: files))
        let session = Session(sync: sync, auth: auth)
        session.reloadCompanies()
        let env = AppEnvironment(client: ServerCheck.makeClient(), session: session, walkthrough: Walkthrough(kv))
        env.push.asked = true
        return env
    }

    /// Everything written so far reaches the stand-in server and every photo counts as uploaded,
    /// so the sync bar stays hidden, as on a phone with signal.
    @MainActor
    func settleSync(_ env: AppEnvironment) async throws {
        let sync = env.session.sync
        for media in try sync.store.list("media") where media["upload_state"]?.string != "uploaded" {
            try sync.store.write(
                "media", id: media.id, companyId: "c1",
                ["upload_state": "uploaded", "storage_path": .string("c1/\(media.id).jpg")])
        }
        try sync.store.database.execute("delete from upload_queue")
        await sync.syncNow()
    }

    /// A time today in the shop's time zone.
    func shopTime(_ minutes: Int) -> Date {
        zonedInstant(localDay(Date(), timeZone: zone), minutes, timeZone: zone) ?? Date()
    }

    func todayISO(_ minutes: Int) -> JSONValue { .string(isoString(shopTime(minutes))) }

    struct VideoStop {
        var customer: String
        var phone: String
        var email: String
        var street: String
        var city: String
        var zip: String
        var lat: Double
        var lng: Double
        /// Minutes after midnight, shop time.
        var start: Int
        var number: Int
        var access: String? = nil
        var gallons: Int = 18000
    }

    struct SeededStop {
        var job: String
        var property: String
        var customer: String
    }

    /// Today's stops for the signed-in tech (u1), in order, each with a pool on the map (so
    /// nothing is looked up). A pool shop's stops are weekly plan visits.
    func seedStops(_ store: LocalStore, _ stops: [VideoStop], type: String, minutes: Int) throws -> [SeededStop] {
        var seeded: [SeededStop] = []
        for s in stops {
            let customer = try store.insert(
                "customer", companyId: "c1",
                ["name": .string(s.customer), "phone": .string(s.phone), "email": .string(s.email)])
            let pool = try store.insert(
                "property", companyId: "c1",
                [
                    "customer_id": .string(customer), "address_line1": .string(s.street), "city": .string(s.city),
                    "state": "AZ", "postal_code": .string(s.zip), "has_pool": true, "has_spa": false,
                    "pool_type": "gunite_plaster", "approx_gallons": .number(Double(s.gallons)),
                    "latitude": .number(s.lat), "longitude": .number(s.lng),
                    "access_notes": s.access.map { JSONValue.string($0) } ?? .null,
                ])
            var job: Row = [
                "property_id": .string(pool), "bill_to_customer_id": .string(customer), "status": "scheduled",
                "type": .string(type), "assigned_user_id": "u1", "scheduled_start": todayISO(s.start),
                "scheduled_end": todayISO(s.start + minutes), "number": .number(Double(s.number)),
            ]
            if type == "maintenance" {
                let plan = "sp-\(s.number)"
                try store.applyPage(
                    PullPage(
                        rows: [
                            PulledRow(
                                table: "service_plan", xid: "2",
                                row: [
                                    "id": .string(plan), "company_id": "c1", "customer_id": .string(customer),
                                    "property_id": .string(pool), "assigned_user_id": "u1",
                                    "starts_on": .string(try addDays(localDay(Date(), timeZone: zone), -84)),
                                    "interval_weeks": 1, "weekdays": nil, "monthly": false,
                                    "visit_time": .string(String(format: "%02d:%02d:00", s.start / 60, s.start % 60)),
                                    "duration_minutes": .number(Double(minutes)), "price_cents": 16500,
                                    "ends_on": nil, "paused": false, "notes": nil, "deleted_at": nil,
                                ])
                        ], done: true, cursor: [:], serverHLC: "1760000000002-0000-srv"))
                job["service_plan_id"] = .string(plan)
                job["plan_date"] = .string(localDay(Date(), timeZone: zone))
            } else {
                job["fee_cents"] = 48500
            }
            seeded.append(
                SeededStop(job: try store.insert("job", companyId: "c1", job), property: pool, customer: customer))
        }
        return seeded
    }

    /// A photo from apps/video/assets/photos, as the camera would save it.
    @MainActor
    func videoPhoto(_ sync: SyncService, _ file: String, target: MediaTarget, caption: String, at minutes: Int)
        throws
    {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../../apps/video/assets/photos/\(file)").standardized
        let data = try Data(contentsOf: url)
        let captured = try PhotoCompressor.compress(data, capturedAt: isoString(shopTime(minutes)))
        let id = try MediaWrites.saveCapture(sync, companyId: "c1", target: target, captured, at: nil)
        let media = try #require(jobMedia(sync.store, MediaTarget(jobId: target.jobId)).first { $0.id == id })
        try MediaWrites.setCaption(sync, media, caption)
    }

    // MARK: - Drawing frames

    /// One screen in a window, kept while it changes, so a tap's result is drawn the way the
    /// screen animates to it (a banner, the card moving on).
    @MainActor
    final class Stage {
        let window: UIWindow
        private let scene: UIWindowScene?
        init(height: CGFloat? = nil, _ view: some View) {
            Chrome.install()
            scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            let frame = CGRect(
                origin: .zero, size: CGSize(width: videoScreen.width, height: height ?? videoScreen.height))
            window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: frame)
            window.frame = frame
            window.overrideUserInterfaceStyle = .light
            let content = view.environment(\.dynamicTypeSize, .large)
                .environment(\.drawsGlass, false)
                .environment(\.drawsLiveMaps, false)
            let host = UIHostingController(rootView: AnyView(content))
            window.rootViewController = host
            window.makeKeyAndVisible()
            window.layoutIfNeeded()
            // The simulator's screen gives the window the status bar's and home indicator's room;
            // if a runner's doesn't, leave it as an iPhone 17 Pro does.
            if window.safeAreaInsets.top < 20 { host.additionalSafeAreaInsets = videoSafeArea }
            print("video safe area \(window.safeAreaInsets)")
        }

        /// Lets SwiftUI load (.task) and animate, laying out as it goes.
        func wait(_ seconds: Double = 1.4) async throws {
            for _ in 0..<Int(seconds * 10) {
                try await Task.sleep(for: .milliseconds(100))
                // Off before any scrolling too: a page scrolled with them on can stay undrawn.
                hideEdgeEffects()
                window.layoutIfNeeded()
            }
        }

        func shot(_ name: String) async throws {
            // iOS 26's scroll edge effect is a portal of the page, which the off-screen renderer
            // draws black: it's turned off, and drawn instead as the fade it is over a light page.
            hideEdgeEffects()
            window.layoutIfNeeded()
            flattenBackdrops(window.layer)
            let fade = edgeFade()
            let left = portals(window.layer)
            if !left.isEmpty { print("video portals in \(name): \(left)") }
            defer { fade?.removeFromSuperview() }
            let format = UIGraphicsImageRendererFormat()
            format.scale = 3
            format.opaque = true
            let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { context in
                if scene != nil {
                    window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
                } else {
                    window.layer.render(in: context.cgContext)
                }
            }
            try save(name, image)
            #expect(!isBlank(image), "\(name) rendered blank")
        }

        /// Bar materials are a backdrop the off-screen renderer can't draw (it leaves them clear,
        /// and the page shows through the bar): fill them with the light bar's flat color.
        private func flattenBackdrops(_ layer: CALayer) {
            // The navigation bar's own background follows its appearance (clear at the top).
            if all(UINavigationBar.self, in: window).contains(where: { $0.layer === layer }) { return }
            let kind = String(describing: type(of: layer))
            // Only the bars along the bottom: at the top, the scroll edge stays clear, as it is
            // over a page at rest.
            let frame = layer.convert(layer.bounds, to: window.layer)
            let portal = (layer.sublayers ?? []).contains { String(describing: type(of: $0)).contains("Portal") }
            if kind.contains("Backdrop"), !portal, frame.height < 200 {
                layer.backgroundColor = UIColor(red: 0.976, green: 0.976, blue: 0.98, alpha: 0.96).cgColor
            }
            for sub in layer.sublayers ?? [] { flattenBackdrops(sub) }
        }

        /// The soft scroll edge under the navigation bar, while the page is scrolled under it:
        /// the page's color, fading out at the bar's bottom edge. Removed after the picture.
        private func edgeFade() -> UIView? {
            guard let bar = all(UINavigationBar.self, in: window).first, let s = scroller,
                s.contentOffset.y > -s.adjustedContentInset.top + 2, let holder = s.superview
            else { return nil }
            let bottom = bar.convert(bar.bounds, to: window).maxY + 8
            let view = UIView(
                frame: holder.convert(CGRect(x: 0, y: 0, width: window.bounds.width, height: bottom), from: window))
            view.isUserInteractionEnabled = false
            let gradient = CAGradientLayer()
            gradient.frame = view.bounds
            let page = UIColor(Color.bg)
            gradient.colors = [page.cgColor, page.withAlphaComponent(0.97).cgColor, page.withAlphaComponent(0).cgColor]
            gradient.locations = [0, 0.75, 1]
            view.layer.addSublayer(gradient)
            holder.insertSubview(view, aboveSubview: s)
            return view
        }

        /// iOS 26's scroll edge effects, off on every scroll view.
        private func hideEdgeEffects() {
            if #available(iOS 26, *) {
                func walk(_ view: UIView) {
                    if let s = view as? UIScrollView {
                        s.topEdgeEffect.isHidden = true
                        s.bottomEdgeEffect.isHidden = true
                        s.leftEdgeEffect.isHidden = true
                        s.rightEdgeEffect.isHidden = true
                    }
                    view.subviews.forEach(walk)
                }
                walk(window)
            }
        }

        /// The layer tree, for working out what the off-screen renderer can't draw.
        private func dumpLayers(_ layer: CALayer, depth: Int) {
            guard depth < 40 else { return }
            let kind = String(describing: type(of: layer))
            let frame = layer.convert(layer.bounds, to: window.layer)
            if !["CGDrawingLayer", "CALayer", "ColorShapeLayer"].contains(kind) || depth < 12 {
                print(
                    "video layer " + String(repeating: ". ", count: depth) + kind
                        + " \(Int(frame.minX)),\(Int(frame.minY)) \(Int(frame.width))x\(Int(frame.height))"
                        + (layer.isHidden ? " hidden" : "") + (layer.opacity < 1 ? " opacity \(layer.opacity)" : "")
                        + (layer.mask != nil ? " masked" : ""))
            }
            for sub in layer.sublayers ?? [] { dumpLayers(sub, depth: depth + 1) }
        }

        /// Portal layers left on screen (each draws black off screen), by their size.
        private func portals(_ layer: CALayer) -> [String] {
            let here =
                String(describing: type(of: layer)).contains("Portal") && !layer.isHidden
                ? ["\(Int(layer.bounds.width))x\(Int(layer.bounds.height))"] : []
            return here + (layer.sublayers ?? []).flatMap(portals)
        }

        /// The page at its top, under the bar (a page sometimes first lays out scrolled).
        func scrollToTop() async throws {
            guard let s = scroller, s.contentOffset.y > -s.adjustedContentInset.top + 1 else { return }
            try await scroll(to: -s.adjustedContentInset.top)
        }

        func close() {
            window.isHidden = true
            window.rootViewController = nil
        }

        // Typing and scrolling, as a finger would.

        private func all<T: UIView>(_ type: T.Type, in view: UIView) -> [T] {
            view.subviews.flatMap { sub -> [T] in
                guard !sub.isHidden, sub.alpha > 0 else { return [] }
                return ((sub as? T).map { [$0] } ?? []) + all(type, in: sub)
            }
        }

        /// The text fields on screen, top to bottom, left to right.
        func fields() -> [UITextField] {
            let found = all(UITextField.self, in: window).filter { $0.bounds.width > 0 }
            let place = { (f: UITextField) in f.convert(f.bounds, to: self.window).origin }
            let sorted = found.sorted {
                let a = place($0)
                let b = place($1)
                return abs(a.y - b.y) > 4 ? a.y < b.y : a.x < b.x
            }
            for (i, f) in sorted.enumerated() {
                let at = place(f)
                print(
                    "video field \(i): '\(f.text ?? "")' placeholder '\(f.placeholder ?? "")' label "
                        + "'\(f.accessibilityLabel ?? "")' at \(Int(at.x)),\(Int(at.y))")
            }
            return sorted
        }

        /// Types into a field as the keyboard would. The test host has no UIApplication, so the
        /// field's own editing events are sent to SwiftUI's handlers directly.
        func typeText(_ field: UITextField, _ text: String) async throws {
            let delegate = field.delegate
            _ = delegate?.textFieldShouldBeginEditing?(field)
            delegate?.textFieldDidBeginEditing?(field)
            let range = NSRange(location: 0, length: (field.text ?? "").utf16.count)
            _ = delegate?.textField?(field, shouldChangeCharactersIn: range, replacementString: text)
            field.text = text
            for target in field.allTargets {
                guard let object = target.base as? NSObject else { continue }
                for name in field.actions(forTarget: object, forControlEvent: .editingChanged) ?? []
                where name.filter({ $0 == ":" }).count <= 1 {
                    _ = object.perform(NSSelectorFromString(name), with: field)
                }
            }
            NotificationCenter.default.post(name: UITextField.textDidChangeNotification, object: field)
            delegate?.textFieldDidChangeSelection?(field)
            _ = delegate?.textFieldShouldEndEditing?(field)
            delegate?.textFieldDidEndEditing?(field)
            try await wait(0.5)
            print("video typed '\(text)': field now '\(field.text ?? "")'")
        }

        /// The page's scroll view (the largest one).
        /// The page's vertical scroll view (not a sideways pager, not a text view).
        private var scroller: UIScrollView? {
            let found = all(UIScrollView.self, in: window).filter {
                !($0 is UITextView) && $0.bounds.width > 200 && $0.contentSize.height > $0.bounds.height + 1
                    && $0.contentSize.width <= $0.bounds.width + 1
            }
            for s in found {
                print(
                    "video scroller \(type(of: s)): \(Int(s.bounds.width)) x \(Int(s.bounds.height)), "
                        + "content \(Int(s.contentSize.width)) x \(Int(s.contentSize.height)), "
                        + "offset \(Int(s.contentOffset.y)), inset \(Int(s.adjustedContentInset.top))")
            }
            return found.max { $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height }
        }

        private func scroll(to y: CGFloat) async throws {
            guard let s = scroller else { return }
            let top = -s.adjustedContentInset.top
            let bottom = max(top, s.contentSize.height - s.bounds.height + s.adjustedContentInset.bottom)
            let target = min(max(y, top), bottom)
            // A step at a time, as a finger moves: one long jump leaves the page undrawn.
            while abs(s.contentOffset.y - target) > 1 {
                let step = max(-240, min(240, target - s.contentOffset.y))
                s.setContentOffset(CGPoint(x: s.contentOffset.x, y: s.contentOffset.y + step), animated: false)
                try await wait(0.3)
            }
            try await wait(0.4)
        }

        /// Scrolls so `view` sits `y` points under the top of the screen.
        func scroll(showing view: UIView, at y: CGFloat) async throws {
            guard let s = scroller else { return }
            let content = view.convert(view.bounds, to: s).minY
            let onScreen = s.convert(CGPoint(x: 0, y: s.contentOffset.y), to: window).y
            try await scroll(to: content - (y - onScreen))
        }

        func scrollToBottom() async throws { try await scroll(to: .greatestFiniteMagnitude) }

        func scroll(by y: CGFloat) async throws {
            guard let s = scroller else { return }
            try await scroll(to: s.contentOffset.y + y)
        }
    }

    @MainActor
    private func save(_ name: String, _ image: UIImage) throws {
        let png = try #require(image.pngData())
        if let folder = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"], !folder.isEmpty {
            try FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
            try png.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
        }
        print("video shot \(name): \(Int(image.size.width * image.scale)) x \(Int(image.size.height * image.scale))")
    }

    /// A view alone on a clear background (the Live Activity's banner and island), for laying
    /// over the video's own Lock Screen.
    @MainActor
    private func cutout(_ name: String, width: CGFloat, _ view: some View) throws {
        let renderer = ImageRenderer(
            content: view.frame(width: width).environment(\.colorScheme, .light).environment(
                \.dynamicTypeSize, .large))
        renderer.scale = 3
        renderer.isOpaque = false
        let image = try #require(renderer.uiImage, "\(name) didn't render")
        try save(name, image)
    }

    /// Today as the Today tab shows it: the tab's own page, with the logo over its title, under
    /// the bar. RootTitle places that block below the status bar, which it reads from the scene;
    /// the test host has none (0, and the block sat under the status bar), so the page starts
    /// under the status bar, as the block does on an iPhone.
    @MainActor
    func todayPage(_ env: AppEnvironment) -> some View {
        NavigationStack {
            TodayScreen().environment(\.brandInBar, true)
                .padding(.top, videoSafeArea.top)
                .background(Color.bg.ignoresSafeArea())
        }
        .app(env)
    }

    // MARK: - The Live Activity

    /// brand/logo/png/mark-reverse-512.png, the file xtool copies into the extension.
    @MainActor private var activityLogo: Image? {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../../brand/logo/png/\(LiveStopLogo.fileName).png").standardized
        return UIImage(contentsOfFile: url.path).map { Image(uiImage: $0) }
    }

    @MainActor private var backyard: UIImage? {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../../apps/video/assets/photos/hero-backyard.jpg").standardized
        return UIImage(contentsOfFile: url.path)
    }

    /// The extension's Lock Screen view, framed as iOS draws it (StopActivityWidget).
    private struct Banner: View {
        var state: LiveStopState
        var logo: Image?

        var body: some View {
            LiveStopLockScreen(
                content: liveStopContent(state.stop), logo: logo,
                actions: LiveStopActionLink.links(state.stop.phase, jobId: state.jobId)
            )
            .background(LiveStopStyle.background)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
    }

    /// The extension's expanded Dynamic Island regions, laid out as iOS does, on black.
    private struct Island: View {
        var state: LiveStopState
        var logo: Image?

        var body: some View {
            let content = liveStopContent(state.stop)
            VStack(spacing: 8) {
                HStack(alignment: .center) {
                    LiveStopIsland.leading(logo: logo)
                    Spacer()
                    LiveStopIsland.center(content)
                    Spacer()
                    LiveStopIsland.trailing(content)
                }
                LiveStopIsland.bottom(
                    content, call: LiveStopLink.call(state.phone), open: LiveStopLink.job(state.jobId),
                    actions: LiveStopActionLink.links(state.stop.phase, jobId: state.jobId))
            }
            .padding(18)
            .background(Color.black, in: RoundedRectangle(cornerRadius: 44, style: .continuous))
        }
    }

    /// The compact island: the mark on the left of the camera, the few characters on the right.
    private struct CompactIsland: View {
        var state: LiveStopState
        var logo: Image?

        var body: some View {
            HStack {
                LiveStopIsland.mark(logo: logo)
                Spacer()
                LiveStopIsland.compact(liveStopContent(state.stop))
            }
            .padding(.horizontal, 14)
            .frame(width: 250, height: 37)
            .background(Color.black, in: Capsule())
        }
    }

    /// The Lock Screen with the Live Activity, on the video's backyard photo.
    private struct LockScreen: View {
        var state: LiveStopState
        var logo: Image?
        var time: String
        var photo: UIImage?

        var body: some View {
            VStack(spacing: 0) {
                Text(Date(), format: .dateTime.weekday(.wide).month(.wide).day())
                    .font(.system(size: 21, weight: .semibold))
                Text(time).font(.system(size: 96, weight: .bold, design: .rounded)).padding(.top, -6)
                Spacer(minLength: 0)
                Banner(state: state, logo: logo).padding(.bottom, 112)
            }
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.25), radius: 6)
            .padding(.horizontal, 14)
            .padding(.top, 72)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                if let photo {
                    Image(uiImage: photo).resizable().scaledToFill().ignoresSafeArea()
                } else {
                    Color(white: 0.2).ignoresSafeArea()
                }
            }
        }
    }

    /// The stop the day is on, as the app hands it to the Live Activity (the Today card's rule).
    @MainActor
    func activityState(_ env: AppEnvironment) throws -> LiveStopState {
        let session = env.session
        let company = try #require(session.company)
        let day = TodayDay(
            store: session.sync.store, kv: session.sync.kv, company: company, userId: "u1", wanted: nil,
            drive: DriveTimes())
        let hero = try #require(day.hero())
        let input = try #require(hero.input)
        let id = try #require(hero.stopId)
        let phone = day.route?.jobs.first { $0.id == id }?.customerPhone
        return LiveStopState(stop: input, jobId: id, phone: phone)
    }

    /// The Lock Screen frame, the banner and islands alone, and the island over Today.
    @MainActor
    func liveActivityShots(_ prefix: String, _ env: AppEnvironment, time: String) async throws {
        BrandFonts.register()
        let logo = activityLogo
        #expect(logo != nil, "brand/logo/png/mark-reverse-512.png not found")
        let state = try activityState(env)
        print("video live activity \(prefix): \(liveStopContent(state.stop))")
        let lock = Stage(LockScreen(state: state, logo: logo, time: time, photo: backyard))
        try await lock.wait(0.6)
        try await lock.shot("\(prefix)-lock-screen")
        lock.close()
        try cutout("\(prefix)-banner", width: 374, Banner(state: state, logo: logo))
        try cutout("\(prefix)-island-expanded", width: 380, Island(state: state, logo: logo))
        try cutout("\(prefix)-island-compact", width: 250, CompactIsland(state: state, logo: logo))
        // Touch and hold the island over Today: it opens over the app.
        let over = Stage(
            ZStack(alignment: .top) {
                todayPage(env)
                VStack {
                    Island(state: state, logo: logo).padding(.horizontal, 11).padding(.top, 11)
                    Spacer()
                }
                .ignoresSafeArea()
            })
        try await over.wait()
        try await over.shot("\(prefix)-island-over-today")
        over.close()
    }

    // MARK: - Canyon State Leak Detection

    private let leakStops: [VideoStop] = [
        VideoStop(
            customer: "Rebecca Soto", phone: "(480) 555-0136", email: "rebecca.soto@example.com",
            street: "4827 E Desert Cove Ave", city: "Scottsdale", zip: "85254", lat: 33.5835, lng: -111.9780,
            start: 9 * 60 + 30, number: 1048, access: "Side gate on the left. Code 2580.", gallons: 22000),
        VideoStop(
            customer: "Carl Jensen", phone: "(480) 555-0172", email: "carl.jensen@example.com",
            street: "6212 E Cholla Ln", city: "Scottsdale", zip: "85253", lat: 33.5925, lng: -111.9475,
            start: 12 * 60 + 30, number: 1049),
        VideoStop(
            customer: "Alicia Moreno", phone: "(602) 555-0118", email: "alicia.moreno@example.com",
            street: "3127 E Sierra Vista Dr", city: "Phoenix", zip: "85016", lat: 33.5260, lng: -112.0140,
            start: 15 * 60, number: 1050),
    ]

    /// Dana's day with Rebecca first; Rebecca's pool is a kidney with no spa.
    @MainActor
    func leakDay(_ env: AppEnvironment) throws -> SeededStop {
        let sync = env.session.sync
        let stops = try seedStops(sync.store, leakStops, type: "detection", minutes: 120)
        let rebecca = stops[0]
        try InspectionWrites.setDiagramShape(sync, propertyId: rebecca.property, companyId: "c1", shape: .kidney)
        return rebecca
    }

    /// On My Way at 9:08 with an 18-minute drive, then Start at 9:28, through the app's writes.
    @MainActor
    func leakOnTheWay(_ env: AppEnvironment, _ stop: SeededStop) throws {
        try StopWrites.recordOnMyWay(
            env.session.sync, companyId: "c1", jobId: stop.job, driveMinutes: 18, now: shopTime(9 * 60 + 8))
    }

    @MainActor
    func startStop(_ env: AppEnvironment, _ jobId: String, at minutes: Int) throws {
        let sync = env.session.sync
        let row = try #require(try sync.store.get("job", jobId))
        try sync.write(
            "job", id: jobId, companyId: "c1", jobStatusValues(.inProgress, job: row, now: shopTime(minutes)))
    }

    struct LeakWork {
        var job: String
        var returns: String
        var light: String
        var pressure: String?
        var dye: String?
        var findings: [String] = []
    }

    /// Rebecca's checklist from the shop's default: the visual walk done, the plumbing started
    /// (skimmer and main drain fine, the returns and light still to check).
    @MainActor
    func leakChecklist(_ env: AppEnvironment, _ stop: SeededStop) throws -> LeakWork {
        let sync = env.session.sync
        let stored = try #require(try sync.store.get("property", stop.property))
        let property = try JSONValue.object(stored).decode(Property.self)
        let config = InspectionConfig(sync.store, companyId: "c1")
        try InspectionWrites.createChecklist(
            sync, companyId: "c1", jobId: stop.job, types: config.componentTypes, property: property,
            jobType: .detection)
        let inspection = JobInspection(sync.store, jobId: stop.job)
        let key = { (c: JobComponent) in config.componentTypeById[c.componentTypeId]?.key ?? "" }
        let section = { (c: JobComponent) in config.componentTypeById[c.componentTypeId]?.section?.rawValue ?? "" }
        for c in inspection.components
        where section(c) == "visual" || ["skimmer", "skimmer_seam", "skimmer_suction", "main_drain"].contains(key(c)) {
            try InspectionWrites.setVerdict(
                sync, companyId: "c1", jobId: stop.job, componentId: c.id, existing: inspection.resultByComponent[c.id],
                verdict: .ok, userId: "u1")
        }
        let returns = try #require(inspection.components.first { key($0) == "return" })
        let light = try #require(inspection.components.first { key($0) == "light" })
        return LeakWork(job: stop.job, returns: returns.id, light: light.id)
    }

    /// The pressure test on the return line (20 to 12 PSI in 15 minutes) and the dye test at the
    /// light niche, saved as the test sheet saves them, and the two items marked Leaking.
    @MainActor
    func leakTests(_ env: AppEnvironment, _ work: inout LeakWork) throws {
        let sync = env.session.sync
        let config = InspectionConfig(sync.store, companyId: "c1")
        let pressure = try #require(config.testTypes.first { $0.key == "pressure" })
        let pressureData = normalizeTestData(
            pressure.fieldSchema,
            ["line_name": "Return line", "start_psi": "20", "end_psi": "12", "duration_min": "15"].mapValues {
                .string($0)
            })
        work.pressure = try InspectionWrites.saveTest(
            sync, companyId: "c1", jobId: work.job, existing: nil, type: pressure, componentId: work.returns,
            data: pressureData, outcome: calculate(pressure, pressureData).suggested,
            notes: "Capped at the pad and the return fittings. Dropped steadily.")
        try sync.write(
            "test_result", id: work.pressure ?? "", companyId: "c1", ["performed_at": todayISO(9 * 60 + 52)])
        let dye = try #require(config.testTypes.first { $0.key == "dye" })
        let dyeData = normalizeTestData(
            dye.fieldSchema,
            [
                "location": "Light niche, deep end", "observation": "Dye drawn in (leak)",
                "notes": "Dye pulled into the conduit behind the light.",
            ].mapValues { .string($0) })
        work.dye = try InspectionWrites.saveTest(
            sync, companyId: "c1", jobId: work.job, existing: nil, type: dye, componentId: work.light, data: dyeData,
            outcome: .fail, notes: "")
        try sync.write("test_result", id: work.dye ?? "", companyId: "c1", ["performed_at": todayISO(10 * 60 + 31)])
        let inspection = JobInspection(sync.store, jobId: work.job)
        for (component, place) in [(work.returns, "Return line under the deck"), (work.light, "Light niche conduit")] {
            try InspectionWrites.setVerdict(
                sync, companyId: "c1", jobId: work.job, componentId: component,
                existing: inspection.resultByComponent[component], verdict: .leaking, userId: "u1")
            try InspectionWrites.saveChecklistResult(
                sync, companyId: "c1", jobId: work.job, componentId: component,
                existing: JobInspection(sync.store, jobId: work.job).resultByComponent[component],
                ["location_text": .string(place)])
        }
    }

    /// Both leaks pinned on the diagram, and the dye photo on the light niche's finding.
    @MainActor
    func leakFindings(_ env: AppEnvironment, _ work: inout LeakWork) throws {
        let sync = env.session.sync
        let returnLeak = try InspectionWrites.saveFinding(
            sync, companyId: "c1", jobId: work.job, existing: nil, title: "Return line leak under the deck",
            componentId: work.returns, severityKey: "major", location: "Return line, 6 ft from the pool wall",
            pin: (0.82, 0.42), status: .open, notes: "Lost 8 PSI in 15 minutes.")
        let niche = try InspectionWrites.saveFinding(
            sync, companyId: "c1", jobId: work.job, existing: nil, title: "Light niche conduit leak",
            componentId: work.light, severityKey: "major", location: "Light niche, deep end", pin: (0.52, 0.9),
            status: .open, notes: "Dye drawn into the conduit behind the light.")
        work.findings = [returnLeak, niche]
        try videoPhoto(
            sync, "leak-dye-light-niche.jpg", target: MediaTarget(jobId: work.job, findingId: niche),
            caption: "Dye drawn into the light niche conduit", at: 10 * 60 + 41)
    }

    /// Every item still to do marked Not Leaking, as the tech does before the report.
    @MainActor
    func finishChecklist(_ env: AppEnvironment, _ job: String) throws {
        let sync = env.session.sync
        let inspection = JobInspection(sync.store, jobId: job)
        for c in inspection.components where (inspection.resultByComponent[c.id]?.status ?? .pending) == .pending {
            try InspectionWrites.setVerdict(
                sync, companyId: "c1", jobId: job, componentId: c.id, existing: inspection.resultByComponent[c.id],
                verdict: .ok, userId: "u1")
        }
    }

    /// The homeowner report as the server drafts it, and the repair quote with three lines.
    @MainActor
    func leakWrapUp(_ env: AppEnvironment, _ work: LeakWork, sent: Bool) throws {
        let sync = env.session.sync
        let sections: JSONValue = [
            [
                "key": "summary", "title": "What We Found",
                "text":
                    "We found two leaks. The return line is leaking under the deck, about 6 feet from the pool wall: it lost 8 PSI in 15 minutes. Dye also drew into the light niche conduit at the deep end. Everything else we checked is not leaking.",
            ],
            [
                "key": "next_steps", "title": "Next Steps",
                "text":
                    "Repair the return line under the deck and seal the light niche conduit. The quote for both repairs is attached.",
            ],
        ]
        var rows: [PulledRow] = [
            PulledRow(
                table: "report", xid: "3",
                row: [
                    "id": "r1", "company_id": "c1", "job_id": .string(work.job), "template_key": "homeowner",
                    "version": 1, "status": sent ? "sent" : "draft", "final_sections": sections,
                    "ai_draft": ["problems": []], "sent_at": sent ? todayISO(11 * 60 + 12) : .null,
                ])
        ]
        let lines: [(String, Int, String?)] = [
            ("Repair return line under the deck (per break)", 125_000, work.findings.first),
            ("Seal light niche conduit", 34_000, work.findings.last),
            ("Dive fee", 25_000, nil),
        ]
        let keys: [(String?, Int)] = [("return", 0), ("light", 1), (nil, 2)]
        for (i, item) in keys.enumerated() {
            rows.append(
                PulledRow(
                    table: "price_book_item", xid: "3",
                    row: [
                        "id": .string("pb\(i)"), "company_id": "c1", "name": .string(lines[item.1].0), "unit": "each",
                        "price_cents": .number(Double(lines[item.1].1)), "taxable": false,
                        "sort_order": .number(Double(i + 1)), "active": true,
                        "component_type_key": item.0.map { JSONValue.string($0) } ?? .null,
                    ]))
        }
        rows.append(
            PulledRow(
                table: "quote", xid: "3",
                row: [
                    "id": "q1", "company_id": "c1", "job_id": .string(work.job),
                    "number": sent ? 1052 : .null, "status": sent ? "sent" : "draft", "subtotal_cents": 184_000,
                    "discount_cents": 0, "tax_cents": 0, "total_cents": 184_000, "deposit_cents": sent ? 92_000 : 0,
                    "sent_at": sent ? todayISO(11 * 60 + 14) : .null,
                ]))
        for (i, line) in lines.enumerated() {
            rows.append(
                PulledRow(
                    table: "quote_line_item", xid: "3",
                    row: [
                        "id": .string("ql\(i)"), "company_id": "c1", "quote_id": "q1",
                        "description": .string(line.0), "quantity": 1, "unit_price_cents": .number(Double(line.1)),
                        "taxable": false, "sort_order": .number(Double(i + 1)),
                        "finding_id": line.2.map { JSONValue.string($0) } ?? .null,
                        "price_book_item_id": .string("pb\(i)"),
                    ]))
        }
        if sent {
            rows += [
                PulledRow(
                    table: "share_link", xid: "3",
                    row: [
                        "id": "sl1", "company_id": "c1", "job_id": .string(work.job), "report_id": "r1",
                        "token": "Rk8vQ2",
                    ]),
                PulledRow(
                    table: "share_link", xid: "3",
                    row: [
                        "id": "sl2", "company_id": "c1", "job_id": .string(work.job), "quote_id": "q1",
                        "token": "Qm4tH7",
                    ]),
                PulledRow(
                    table: "signature", xid: "3",
                    row: [
                        "id": "sg1", "company_id": "c1", "job_id": .string(work.job), "report_id": "r1",
                        "purpose": "inspection_ack", "signer_name": "Rebecca Soto", "signer_role": "Homeowner",
                        "signed_at": todayISO(11 * 60 + 10),
                    ]),
            ]
        }
        try sync.store.applyPage(PullPage(rows: rows, done: true, cursor: [:], serverHLC: "1760000000004-0000-srv"))
        if sent, let files = sync.media {
            let svg = """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180">\
                <path d="M40 120 C55 40 95 30 92 70 C90 100 60 110 70 90 C85 70 110 120 130 128 \
                C140 132 150 100 160 96 C175 92 168 125 185 122 C200 118 205 95 220 100 C232 104 225 128 240 124 \
                C255 120 262 98 275 104 C285 110 280 130 295 126"/>\
                <path d="M330 80 C360 60 380 70 360 96 C345 116 390 120 410 108 C425 98 430 118 445 116 \
                C460 114 462 96 476 100 C490 104 482 124 498 120 C512 116 520 104 540 100"/>\
                <path d="M300 150 C380 140 470 138 560 146"/>\
                </svg>
                """
            let url = files.url(SignatureDrawing.localPath("sg1"))
            try FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try svg.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    // MARK: - Blue Mesa Pool Co.

    private let poolStops: [VideoStop] = [
        VideoStop(
            customer: "Karen Whitfield", phone: "(480) 555-0121", email: "karen.whitfield@example.com",
            street: "1842 E Ivanhoe St", city: "Chandler", zip: "85225", lat: 33.3195, lng: -111.8120,
            start: 7 * 60 + 30, number: 2201),
        VideoStop(
            customer: "Robert Chen", phone: "(480) 555-0158", email: "robert.chen@example.com",
            street: "2315 W Myrtle Dr", city: "Chandler", zip: "85248", lat: 33.2650, lng: -111.8790,
            start: 8 * 60 + 5, number: 2202),
        VideoStop(
            customer: "Sofia Delgado", phone: "(480) 555-0184", email: "sofia.delgado@example.com",
            street: "951 W Laredo St", city: "Chandler", zip: "85225", lat: 33.3010, lng: -111.8560,
            start: 8 * 60 + 40, number: 2203, access: "Gate code 1964. Dog stays inside.", gallons: 15000),
        VideoStop(
            customer: "Megan Price", phone: "(480) 555-0109", email: "megan.price@example.com",
            street: "3260 E Kesler Ln", city: "Chandler", zip: "85225", lat: 33.2920, lng: -111.7980,
            start: 9 * 60 + 15, number: 2204),
        VideoStop(
            customer: "James Okafor", phone: "(480) 555-0193", email: "james.okafor@example.com",
            street: "1477 S Velero St", city: "Chandler", zip: "85286", lat: 33.2840, lng: -111.8250,
            start: 9 * 60 + 50, number: 2205),
        VideoStop(
            customer: "Laura Bennett", phone: "(480) 555-0145", email: "laura.bennett@example.com",
            street: "4080 S Joshua Tree Ln", city: "Gilbert", zip: "85297", lat: 33.2700, lng: -111.7350,
            start: 10 * 60 + 25, number: 2206),
        VideoStop(
            customer: "Mike Sullivan", phone: "(480) 555-0177", email: "mike.sullivan@example.com",
            street: "2721 E Bart St", city: "Gilbert", zip: "85295", lat: 33.3030, lng: -111.7260,
            start: 11 * 60, number: 2207),
        VideoStop(
            customer: "Teresa Ramos", phone: "(480) 555-0112", email: "teresa.ramos@example.com",
            street: "1189 E Elgin St", city: "Chandler", zip: "85225", lat: 33.3130, lng: -111.8230,
            start: 12 * 60, number: 2208),
        VideoStop(
            customer: "Greg Patterson", phone: "(480) 555-0166", email: "greg.patterson@example.com",
            street: "6122 W Erie St", city: "Chandler", zip: "85226", lat: 33.3060, lng: -111.9500,
            start: 12 * 60 + 35, number: 2209),
        VideoStop(
            customer: "Nina Hoffman", phone: "(480) 555-0138", email: "nina.hoffman@example.com",
            street: "512 W Remington Dr", city: "Chandler", zip: "85225", lat: 33.2980, lng: -111.8500,
            start: 13 * 60 + 10, number: 2210),
        VideoStop(
            customer: "Victor Salazar", phone: "(480) 555-0151", email: "victor.salazar@example.com",
            street: "2290 S Pewter Dr", city: "Gilbert", zip: "85295", lat: 33.3240, lng: -111.7480,
            start: 13 * 60 + 45, number: 2211),
        VideoStop(
            customer: "Amy Lindqvist", phone: "(480) 555-0127", email: "amy.lindqvist@example.com",
            street: "870 N Monterey St", city: "Gilbert", zip: "85233", lat: 33.3610, lng: -111.8080,
            start: 14 * 60 + 20, number: 2212),
    ]

    /// Priya's 12 weekly visits, from home; the first two done.
    @MainActor
    func poolDay(_ env: AppEnvironment) throws -> [SeededStop] {
        let sync = env.session.sync
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "member_start", xid: "2",
                        row: [
                            "id": "ms1", "company_id": "c1", "user_id": "u1", "start_from": "home",
                            "home_address": "2240 N Comanche Dr, Chandler, AZ 85224",
                            "home_geocoded_address": "2240 N Comanche Dr, Chandler, AZ 85224",
                            "home_latitude": 33.3330, "home_longitude": -111.8790,
                        ])
                ], done: true, cursor: [:], serverHLC: "1760000000002-0000-srv"))
        let stops = try seedStops(sync.store, poolStops, type: "maintenance", minutes: 30)
        let day = localDay(Date(), timeZone: zone)
        for (i, stop) in stops.prefix(2).enumerated() {
            try startStop(env, stop.job, at: poolStops[i].start + 2)
            let block = try StopWrites.mark(
                sync, companyId: "c1", settings: env.session.company?.settings, jobId: stop.job, complete: true,
                day: day)
            #expect(block == nil, "stop \(i + 1) not completed: \(block ?? "")")
        }
        return stops
    }

    /// Sofia's visit checklist: the service tasks (clean filter due today, from the plan), the
    /// first ones done, the equipment check needing attention (pump noise, with a photo).
    @MainActor
    func poolVisit(_ env: AppEnvironment, _ stop: SeededStop) throws -> (equipment: String, filter: String) {
        let sync = env.session.sync
        let config = InspectionConfig(sync.store, companyId: "c1")
        let stored = try #require(try sync.store.get("property", stop.property))
        let property = try JSONValue.object(stored).decode(Property.self)
        try InspectionWrites.createChecklist(
            sync, companyId: "c1", jobId: stop.job, types: config.componentTypes, property: property,
            jobType: .maintenance)
        let filterType = try #require(config.componentTypes.first { $0.key == "svc_filter_clean" })
        let today = localDay(Date(), timeZone: zone)
        let plan = try #require(try sync.store.get("job", stop.job)?["service_plan_id"]?.string)
        try sync.store.applyPage(
            PullPage(
                rows: [
                    PulledRow(
                        table: "plan_cleaning", xid: "3",
                        row: [
                            "id": "pc-filter", "company_id": "c1", "service_plan_id": .string(plan),
                            "component_type_id": .string(filterType.id), "every_months": 3, "next_due": .string(today),
                            "last_done_on": .string(try addDays(today, -91)),
                        ])
                ], done: true, cursor: [:], serverHLC: "1760000000003-0000-srv"))
        var inspection = JobInspection(sync.store, jobId: stop.job)
        if !inspection.components.contains(where: { $0.componentTypeId == filterType.id }) {
            let component = try sync.store.insert(
                "job_component", companyId: "c1",
                [
                    "job_id": .string(stop.job), "component_type_id": .string(filterType.id), "instance_number": 1,
                    "label": .string(filterType.name), "sort_order": 6, "plan_cleaning_id": "pc-filter",
                ])
            try sync.store.insert(
                "checklist_item_result", companyId: "c1",
                ["job_id": .string(stop.job), "job_component_id": .string(component), "status": "pending"])
            inspection = JobInspection(sync.store, jobId: stop.job)
        }
        let key = { (c: JobComponent) in config.componentTypeById[c.componentTypeId]?.key ?? "" }
        for c in inspection.components where ["svc_skim", "svc_brush", "svc_baskets", "svc_filter"].contains(key(c)) {
            try InspectionWrites.setVerdict(
                sync, companyId: "c1", jobId: stop.job, componentId: c.id, existing: inspection.resultByComponent[c.id],
                verdict: .ok, userId: "u1")
        }
        let equipment = try #require(inspection.components.first { key($0) == "svc_equipment" })
        let filter = try #require(inspection.components.first { key($0) == "svc_filter_clean" })
        return (equipment.id, filter.id)
    }

    /// The pump noise: Needs Attention on the equipment check, a note and the pad's photo.
    @MainActor
    func pumpNoise(_ env: AppEnvironment, _ stop: SeededStop, equipment: String) throws {
        let sync = env.session.sync
        try InspectionWrites.setVerdict(
            sync, companyId: "c1", jobId: stop.job, componentId: equipment,
            existing: JobInspection(sync.store, jobId: stop.job).resultByComponent[equipment], verdict: .attention,
            userId: "u1")
        try InspectionWrites.saveChecklistResult(
            sync, companyId: "c1", jobId: stop.job, componentId: equipment,
            existing: JobInspection(sync.store, jobId: stop.job).resultByComponent[equipment],
            ["location_text": "Pump noise: bearings grinding"])
        try videoPhoto(
            sync, "equipment-pad.jpg", target: MediaTarget(jobId: stop.job, componentId: equipment),
            caption: "Pump noise: motor bearings", at: 8 * 60 + 42)
    }

    /// The repair quote for the pump on the visit: a draft, or sent.
    @MainActor
    func pumpQuote(_ env: AppEnvironment, _ stop: SeededStop, sent: Bool) throws {
        let lines: [(String, Int)] = [
            ("Replace pump motor, 1.5 HP", 68_500), ("Pump shaft seal and O-rings", 6_500),
            ("Labor, 1.5 hours", 18_000),
        ]
        var rows: [PulledRow] = [
            PulledRow(
                table: "quote", xid: "4",
                row: [
                    "id": "q2", "company_id": "c1", "job_id": .string(stop.job), "number": sent ? 1061 : .null,
                    "status": sent ? "sent" : "draft", "subtotal_cents": 93_000, "discount_cents": 0, "tax_cents": 0,
                    "total_cents": 93_000, "deposit_cents": sent ? 25_000 : 0,
                    "sent_at": sent ? todayISO(9 * 60 + 6) : .null,
                ])
        ]
        for (i, line) in lines.enumerated() {
            rows.append(
                PulledRow(
                    table: "quote_line_item", xid: "4",
                    row: [
                        "id": .string("pq\(i)"), "company_id": "c1", "quote_id": "q2", "description": .string(line.0),
                        "quantity": 1, "unit_price_cents": .number(Double(line.1)), "taxable": false,
                        "sort_order": .number(Double(i + 1)),
                    ]))
        }
        if sent {
            rows.append(
                PulledRow(
                    table: "share_link", xid: "4",
                    row: [
                        "id": "sl3", "company_id": "c1", "job_id": .string(stop.job), "quote_id": "q2",
                        "token": "Pm2xW9",
                    ]))
        }
        try env.session.sync.store.applyPage(
            PullPage(rows: rows, done: true, cursor: [:], serverHLC: "1760000000005-0000-srv"))
    }

    // MARK: - The frames

    @Suite(.serialized, .enabled(if: videoRun)) @MainActor struct VideoShots {
        /// Leak scene 2: Today with Rebecca at 9:30, On My Way, the Live Activity, Start.
        @Test func leakToday() async throws {
            let env = try videoEnvironment(canyonState)
            let rebecca = try leakDay(env)
            try await settleSync(env)
            let todayStage = Stage(todayPage(env))
            try await todayStage.wait(2)
            try await todayStage.scrollToTop()
            try await todayStage.shot("leak-01-today")
            try leakOnTheWay(env, rebecca)
            try await settleSync(env)
            try await todayStage.wait()
            try await todayStage.shot("leak-02-today-on-my-way-sent")
            todayStage.close()
            try await liveActivityShots("leak-03-live-activity-driving", env, time: "9:09")
            try startStop(env, rebecca.job, at: 9 * 60 + 28)
            try await settleSync(env)
            let onSite = Stage(todayPage(env))
            try await onSite.wait(2)
            try await onSite.shot("leak-04-today-on-site")
            onSite.close()
        }

        /// Leak scene 3: the checklist, the pressure test typed in (and its drop), the dye test.
        @Test func leakTest() async throws {
            let env = try videoEnvironment(canyonState)
            let rebecca = try leakDay(env)
            try leakOnTheWay(env, rebecca)
            try startStop(env, rebecca.job, at: 9 * 60 + 28)
            var work = try leakChecklist(env, rebecca)
            try await settleSync(env)
            let checklist = Stage(NavigationStack { JobScreen(jobId: work.job, section: .checklist) }.app(env))
            try await checklist.wait(2)
            try await checklist.shot("leak-10-checklist")
            try await checklist.scroll(by: 560)
            try await checklist.shot("leak-10-checklist-plumbing")
            checklist.close()

            // Add Test from the Returns item: the pressure test typed in, then the end reading.
            let config = InspectionConfig(env.session.sync.store, companyId: "c1")
            let pressure = try #require(config.testTypes.first { $0.key == "pressure" })
            let editor = Stage(
                TestEditor(jobId: work.job, testId: nil, typeId: pressure.id, componentId: work.returns).app(env))
            try await editor.wait(1.5)
            let fields = editor.fields()
            if fields.count >= 4 {
                try await editor.typeText(fields[0], "Return line")
                try await editor.typeText(fields[1], "20")
                try await editor.typeText(fields[3], "15")
                try await editor.shot("leak-11-pressure-test-start")
                try await editor.typeText(editor.fields()[2], "12")
                try await editor.shot("leak-12-pressure-test-dropped")
            } else {
                Issue.record("pressure test: \(fields.count) text fields")
            }
            _ = editor.fields()
            editor.close()

            try leakTests(env, &work)
            try await settleSync(env)
            let marked = Stage(NavigationStack { JobScreen(jobId: work.job, section: .checklist) }.app(env))
            try await marked.wait(2)
            if let leak = marked.fields().first(where: { $0.text == "Return line under the deck" }) {
                try await marked.scroll(showing: leak, at: 330)
            } else {
                try await marked.scroll(by: 300)
            }
            try await marked.shot("leak-13-checklist-leaking")
            marked.close()
            let dye = Stage(TestEditor(jobId: work.job, testId: work.dye, typeId: nil, componentId: nil).app(env))
            try await dye.wait(1.5)
            try await dye.shot("leak-14-dye-test")
            dye.close()
            let tests = Stage(NavigationStack { JobScreen(jobId: work.job, section: .findings) }.app(env))
            try await tests.wait(2)
            try await tests.shot("leak-15-findings-tests")
            tests.close()
        }

        /// Leak scene 3: the findings pinned on the diagram, and the photo on one.
        @Test func leakFindingsFrames() async throws {
            let env = try videoEnvironment(canyonState)
            let rebecca = try leakDay(env)
            try leakOnTheWay(env, rebecca)
            try startStop(env, rebecca.job, at: 9 * 60 + 28)
            var work = try leakChecklist(env, rebecca)
            try leakTests(env, &work)
            try leakFindings(env, &work)
            try await settleSync(env)
            let findings = Stage(NavigationStack { JobScreen(jobId: work.job, section: .findings) }.app(env))
            try await findings.wait(2.5)
            try await findings.shot("leak-20-findings")
            try await findings.scrollToBottom()
            try await findings.shot("leak-20-findings-list")
            findings.close()
            let editor = Stage(
                FindingEditor(jobId: work.job, findingId: work.findings[1], componentId: nil).app(env))
            try await editor.wait(2.5)
            try await editor.shot("leak-21-finding-light-niche")
            try await editor.scrollToBottom()
            try await editor.shot("leak-21-finding-light-niche-photo")
            editor.close()
            let photo = try #require(
                jobMedia(env.session.sync.store, MediaTarget(jobId: work.job, findingId: work.findings[1])).first?.id)
            let media = Stage(NavigationStack { MediaScreen(jobId: work.job, mediaId: photo) }.app(env))
            try await media.wait(2.5)
            try await media.shot("leak-22-photo")
            media.close()
            let photos = Stage(NavigationStack { JobScreen(jobId: work.job, section: .photos) }.app(env))
            try await photos.wait(2.5)
            try await photos.shot("leak-23-job-photos")
            photos.close()
        }

        /// Leak scene 4: Wrap-Up with the report and the quote, before and after sending.
        @Test func leakWrapUpFrames() async throws {
            for sent in [false, true] {
                let env = try videoEnvironment(canyonState)
                let rebecca = try leakDay(env)
                try leakOnTheWay(env, rebecca)
                try startStop(env, rebecca.job, at: 9 * 60 + 28)
                var work = try leakChecklist(env, rebecca)
                try leakTests(env, &work)
                try leakFindings(env, &work)
                try finishChecklist(env, work.job)
                try leakWrapUp(env, work, sent: sent)
                try await settleSync(env)
                let tag = sent ? "sent" : "draft"
                let wrapUp = Stage(NavigationStack { JobScreen(jobId: work.job, section: .wrapUp) }.app(env))
                try await wrapUp.wait(2.5)
                try await wrapUp.shot("leak-3\(sent ? 3 : 0)-wrap-up-report-\(tag)")
                let fields = wrapUp.fields()
                if let line = fields.first(where: { $0.text?.hasPrefix("Repair return line") == true }) {
                    try await wrapUp.scroll(showing: line, at: 560)
                } else if let link = fields.first(where: { $0.text?.hasPrefix("https://") == true }) {
                    try await wrapUp.scroll(showing: link, at: 520)
                } else {
                    try await wrapUp.scrollToBottom()
                }
                try await wrapUp.shot("leak-3\(sent ? 4 : 1)-wrap-up-quote-\(tag)")
                wrapUp.close()
                let tall = Stage(
                    height: 3600, NavigationStack { JobScreen(jobId: work.job, section: .wrapUp) }.app(env))
                try await tall.wait(2.5)
                try await tall.shot("leak-3\(sent ? 5 : 2)-wrap-up-\(tag)-tall")
                tall.close()
                if !sent {
                    let review = Stage(NavigationStack { ReviewScreen(jobId: work.job) }.app(env))
                    try await review.wait(2.5)
                    try await review.shot("leak-36-review-with-customer")
                    try await review.scroll(by: 700)
                    try await review.shot("leak-36-review-with-customer-findings")
                    review.close()
                }
            }
        }

        /// Pool scene 2: Priya's 12 stops, on the way to stop 3, the Live Activity, at stop 3.
        @Test func poolToday() async throws {
            let env = try videoEnvironment(blueMesa)
            let stops = try poolDay(env)
            _ = try poolVisit(env, stops[2])
            try await settleSync(env)
            let todayStage = Stage(todayPage(env))
            try await todayStage.wait(2)
            try await todayStage.shot("pool-01-today-stop-3")
            try StopWrites.recordOnMyWay(
                env.session.sync, companyId: "c1", jobId: stops[2].job, driveMinutes: 11, now: shopTime(8 * 60 + 29))
            try await settleSync(env)
            try await todayStage.wait()
            try await todayStage.shot("pool-02-today-on-the-way")
            todayStage.close()
            try await liveActivityShots("pool-03-live-activity-driving", env, time: "8:31")
            try startStop(env, stops[2].job, at: 8 * 60 + 41)
            try await settleSync(env)
            let onSite = Stage(todayPage(env))
            try await onSite.wait(2)
            try await onSite.shot("pool-04-today-at-stop-3")
            onSite.close()
            try await liveActivityShots("pool-05-live-activity-on-site", env, time: "8:52")
            let tall = Stage(height: 2600, todayPage(env))
            try await tall.wait(2)
            try await tall.shot("pool-06-today-12-stops-tall")
            tall.close()
        }

        /// Pool scenes 3 to 5: the visit's checklist, readings and what to add, the filter
        /// cleaning, before and after photos, the pump noise and its quote, Mark Complete.
        @Test func poolVisitFrames() async throws {
            let env = try videoEnvironment(blueMesa)
            let stops = try poolDay(env)
            let sofia = stops[2]
            try StopWrites.recordOnMyWay(
                env.session.sync, companyId: "c1", jobId: sofia.job, driveMinutes: 11, now: shopTime(8 * 60 + 29))
            try startStop(env, sofia.job, at: 8 * 60 + 41)
            let visit = try poolVisit(env, sofia)
            try await settleSync(env)
            let checklist = Stage(NavigationStack { JobScreen(jobId: sofia.job, section: .checklist) }.app(env))
            try await checklist.wait(2)
            try await checklist.shot("pool-10-visit-checklist")
            checklist.close()

            // The Chemical card opened on the visit, readings typed in.
            let target = ChemicalTarget(propertyId: sofia.property, jobId: sofia.job)
            let card = Stage(
                ScrollView { ChemicalCard(target: target, open: true).padding(16) }.background(Color.bg).app(env))
            try await card.wait(1.5)
            try await card.shot("pool-11-chemical-card")
            let fields = card.fields()
            let readings = ["1.0", "7.9", "80", "260", "40"]
            if fields.count >= 1 + 2 * readings.count {
                for (i, value) in readings.enumerated() { try await card.typeText(card.fields()[1 + 2 * i], value) }
                try await card.wait(0.6)
                try await card.shot("pool-12-chemical-readings")
                try await card.scrollToBottom()
                try await card.shot("pool-13-chemical-what-to-add")
            } else {
                Issue.record("chemical card: \(fields.count) text fields")
            }
            _ = card.fields()
            card.close()
            // The What to Add sheet, as the Chemical screen shows it, for the same readings.
            let pool = try #require(chemicalPool(env.session.sync.store, target))
            var form = ChemicalForm(gallons: 15000)
            form.readings = [.fc: "1.0", .ph: "7.9", .ta: "80", .ch: "260", .cya: "40"]
            let result = form.result
            let doses = Stage(
                FormSheet(title: "What to Add", cancelTitle: "Close") { DoseList(result: result) }.app(env))
            try await doses.wait(1)
            try await doses.shot("pool-13-what-to-add-sheet")
            doses.close()
            _ = try ChemicalLogWrites.submit(
                env.session.sync, companyId: "c1", pool: pool, form: form, now: shopTime(8 * 60 + 47))

            // Filter cleaning done, the pump noise, the photos.
            try InspectionWrites.setVerdict(
                env.session.sync, companyId: "c1", jobId: sofia.job, componentId: visit.filter,
                existing: JobInspection(env.session.sync.store, jobId: sofia.job).resultByComponent[visit.filter],
                verdict: .ok, userId: "u1")
            try pumpNoise(env, sofia, equipment: visit.equipment)
            try videoPhoto(
                env.session.sync, "pool-before.jpg", target: MediaTarget(jobId: sofia.job), caption: "Before",
                at: 8 * 60 + 43)
            try videoPhoto(
                env.session.sync, "pool-after.jpg", target: MediaTarget(jobId: sofia.job), caption: "After",
                at: 9 * 60 + 4)
            try await settleSync(env)
            let done = Stage(NavigationStack { JobScreen(jobId: sofia.job, section: .checklist) }.app(env))
            try await done.wait(2)
            try await done.shot("pool-14-visit-checklist-readings-in")
            if let note = done.fields().first(where: { $0.text?.hasPrefix("Pump noise") == true }) {
                try await done.scroll(showing: note, at: 420)
            } else {
                try await done.scrollToBottom()
            }
            try await done.shot("pool-15-checklist-pump-noise")
            done.close()
            let tallChecklist = Stage(
                height: 3400, NavigationStack { JobScreen(jobId: sofia.job, section: .checklist) }.app(env))
            try await tallChecklist.wait(2)
            try await tallChecklist.shot("pool-15-visit-checklist-tall")
            tallChecklist.close()
            let photos = Stage(NavigationStack { JobScreen(jobId: sofia.job, section: .photos) }.app(env))
            try await photos.wait(2.5)
            try await photos.shot("pool-16-photos")
            try await photos.scroll(by: 420)
            try await photos.shot("pool-16-after-photo")
            try await photos.scroll(by: 358)
            try await photos.shot("pool-16-before-photo")
            photos.close()

            // The pump repair quoted on the visit (Details › Quotes), then sent.
            for sent in [false, true] {
                try pumpQuote(env, sofia, sent: sent)
                try await settleSync(env)
                let details = Stage(NavigationStack { JobScreen(jobId: sofia.job, section: .details) }.app(env))
                try await details.wait(2.5)
                if let line = details.fields().first(where: { $0.text?.hasPrefix("Replace pump motor") == true }) {
                    try await details.scroll(showing: line, at: 420)
                } else {
                    try await details.scrollToBottom()
                }
                try await details.shot("pool-1\(sent ? 8 : 7)-pump-quote-\(sent ? "sent" : "draft")")
                details.close()
                let tall = Stage(
                    height: 3600, NavigationStack { JobScreen(jobId: sofia.job, section: .details) }.app(env))
                try await tall.wait(2.5)
                try await tall.shot("pool-1\(sent ? 8 : 7)-visit-details-\(sent ? "sent" : "draft")-tall")
                tall.close()
            }

            // Mark Complete on Today's card: Sofia done, the card moves on to Megan Price.
            let todayStage = Stage(todayPage(env))
            try await todayStage.wait(2)
            try await todayStage.shot("pool-20-today-mark-complete")
            let block = try StopWrites.mark(
                env.session.sync, companyId: "c1", settings: env.session.company?.settings, jobId: sofia.job,
                complete: true, day: localDay(Date(), timeZone: zone), visitReports: nil)
            #expect(block == nil, "Sofia's visit not completed: \(block ?? "")")
            try await todayStage.wait(0.5)
            try await todayStage.shot("pool-21-today-sofia-done")
            try await settleSync(env)
            try await todayStage.wait(1.5)
            try await todayStage.shot("pool-22-today-next-megan-price")
            todayStage.close()
            try await liveActivityShots("pool-23-live-activity-next", env, time: "9:07")
        }
    }
#endif
