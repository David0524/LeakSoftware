#if os(iOS)
    import Network
    import Sentry
    import Supabase
    import SundeckStorage
    import SundeckSync
    import SundeckTokens
    import SwiftUI

    @main
    struct SundeckProApp: App {
        @State private var app = AppEnvironment.make()
        @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate

        init() {
            BrandFonts.register()
            Chrome.install()
            if let dsn = AppConfig.sentryDSN {
                SentrySDK.start { options in
                    options.dsn = dsn
                }
            }
        }

        var body: some Scene {
            WindowGroup {
                switch app {
                case .success(let environment):
                    RootView()
                        .environment(environment.session)
                        .environment(environment.session.sync)
                        .environment(environment)
                        .environment(environment.unsavedEdits)
                        .environment(\.mediaURLSigner, environment.signer)
                case .failure(let error):
                    ContentUnavailableView(
                        "Sundeck Pro Couldn’t Start", systemImage: "exclamationmark.triangle",
                        description: Text("This phone’s storage couldn’t be opened. \(error.localizedDescription)")
                    )
                    .preferredColorScheme(.light)
                }
            }
        }
    }

    /// Everything the app runs on: the encrypted database, the server client, sync and the session.
    @MainActor @Observable
    final class AppEnvironment {
        let client: SupabaseClient
        let session: Session
        let walkthrough: Walkthrough
        /// This phone's Light | Dark choice (Light until changed).
        let appearance: AppearanceSetting
        /// Signed links to uploaded files, shared by every screen so links are reused.
        let signer: MediaURLSigner
        /// This phone's push token on the server.
        let push: PushRegistration
        /// Map pins to find again after an address change (POST /api/locate after a sync).
        let locate: LocateQueue
        /// Completed visits whose report may go out by itself (POST visit-report after a sync).
        let visitReports: VisitReportQueue
        /// Finish Report and report sends tapped without signal (run after a sync).
        let reportSends: ReportSendQueue
        /// A Live Activity button's request, done by Today on that stop (owner, 2026-10-20).
        var stopRequest: StopRequest?
        /// The Live Activity for the stop the tech is on.
        let liveStop: LiveStopController
        /// Where a tapped notification or the Live Activity's Open Job goes (MainView opens it).
        var link: AppLink?
        /// Editors with unsaved changes; a link waits for "Discard changes?" while any are open.
        let unsavedEdits = UnsavedEdits()
        /// "Photo removed" with Undo, shown by whichever screen is in front (owner, 2026-10-26).
        let removals = RemovalCenter()
        /// Drops the same link arriving twice at once.
        @ObservationIgnored var linkGate = LinkGate()
        @ObservationIgnored private let monitor = NWPathMonitor()

        init(client: SupabaseClient, session: Session, walkthrough: Walkthrough) {
            self.client = client
            self.session = session
            self.walkthrough = walkthrough
            appearance = AppearanceSetting(session.sync.kv)
            push = PushRegistration(kv: session.sync.kv)
            locate = LocateQueue(kv: session.sync.kv)
            visitReports = VisitReportQueue(kv: session.sync.kv)
            reportSends = ReportSendQueue(kv: session.sync.kv)
            liveStop = LiveStopController(session: session)
            signer = MediaURLSigner { path, seconds in
                try await client.storage.from("media").createSignedURL(path: path, expiresIn: seconds)
            }
        }

        /// The website's API as the signed-in person (reports, quotes, transcripts).
        var api: WebAPI {
            WebAPI(baseURL: AppConfig.webURL) { [client] in try? await client.auth.session.accessToken }
        }

        /// iOS gave the phone a push token: file it for whoever is signed in.
        func received(_ token: Data) {
            Task { await push.received(token, api: api, userId: session.user?.id) }
        }

        static func make() -> Result<AppEnvironment, Error> {
            Result {
                let db = try openDatabase()
                var store = try LocalStore.open(db)
                let kv = try KeyValue(db)
                // A phone updated from the Expo build: move its unsent work and data in first.
                let documents = try FileManager.default.url(
                    for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                let moved = ExpoMigration.run(
                    into: db, expoPath: ExpoMigration.expoPath(documents: documents),
                    expoKey: ExpoMigration.expoKeyFromKeychain())
                if case .moved = moved { store = try LocalStore.open(db) }  // reads the moved device id and clock
                let client = ServerCheck.makeClient()
                let auth = SupabaseAuthBackend(client)
                let media = try MediaFiles.documents()
                let uploader = TusUploader(
                    supabaseUrl: AppConfig.supabaseURL.absoluteString, apiKey: AppConfig.supabasePublishableKey,
                    accessToken: { try? await client.auth.session.accessToken }, files: media.source)
                let sync = SyncService(
                    store: store, kv: kv, transport: SupabaseTransport(SupabaseRPC(client)), auth: auth,
                    uploader: uploader, media: media)
                sync.holdsBackgroundTime = true
                let session = Session(sync: sync, auth: auth)
                let environment = AppEnvironment(client: client, session: session, walkthrough: Walkthrough(kv))
                sync.afterSync = { [weak environment] in await environment?.afterSync() }
                sync.voiceNoteUploaded = { [weak sync] id in
                    // Ask the server to transcribe it. Best effort: offline, the office can retry.
                    let api = WebAPI(baseURL: AppConfig.webURL) { try? await client.auth.session.accessToken }
                    if (try? await api.post("api/media/\(id)/transcribe")) != nil { sync?.syncSoon(0) }
                }
                session.willSignOut = { [weak environment] in
                    guard let environment else { return }
                    environment.liveStop.end()
                    await environment.push.unregister(api: environment.api)
                }
                // Whether a new shop's owner still has to finish setup (Session.checkSetup).
                session.fetchAccess = { [client] id in
                    try await client.rpc("company_access", params: ["target_company": id]).execute().value
                }
                AppDelegate.environment = environment
                environment.watchNetwork()
                return environment
            }
        }

        /// Opens the encrypted database. A file this key can't read (left by an earlier install)
        /// is replaced: the server's copy comes back on the next sync.
        private static func openDatabase() throws -> Database {
            let folder = try FileManager.default.url(
                for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let path = folder.appendingPathComponent("sundeck.db").path
            let key = try DatabaseKey.loadOrCreate()
            do {
                return try Database(path: path, key: key)
            } catch {
                for suffix in ["", "-wal", "-shm"] { try? FileManager.default.removeItem(atPath: path + suffix) }
                return try Database(path: path, key: key)
            }
        }

        private func watchNetwork() {
            // Called on the monitor's own queue. `@Sendable` says so: a plain closure made in this
            // main-actor class could be taken for main-actor code, which Swift 6 checks at run time.
            monitor.pathUpdateHandler = { @Sendable [weak self] path in
                let online = path.status == .satisfied
                Task { @MainActor in self?.session.sync.networkChanged(online: online) }
            }
            monitor.start(queue: DispatchQueue(label: "network"))
        }

        /// After each sync: the company list, and teammates' names for offline use.
        private func afterSync() async {
            session.reloadCompanies()
            if !visitReports.pending.isEmpty, session.sync.status.pending == 0 {
                let before = visitReports.pending.count
                let settings = session.company?.settings
                await visitReports.flush(
                    api, uploading: { [sync = session.sync] in sync.hasPendingUploads(jobId: $0) },
                    needsPhoto: { [sync = session.sync] in
                        visitReportPhotoBlock(sync.store, settings: settings, jobId: $0) != nil
                    })
                if visitReports.pending.count < before { session.sync.syncSoon(2) }  // bring the sent report down
            }
            if !reportSends.pending.isEmpty, session.sync.status.pending == 0 {
                let before = reportSends.pending.count
                // A queued text opens for the tech to send: only with the app in front.
                await reportSends.flush(api, canText: UIApplication.shared.applicationState == .active) {
                    [sync = session.sync] in sync.hasPendingUploads(jobId: $0)
                }
                if reportSends.pending.count < before { session.sync.syncSoon(2) }  // bring the report down
            }
            let waiting = locate.pending.count
            if waiting > 0, session.sync.status.pending == 0 {
                await locate.flush(api)
                if locate.pending.count < waiting { session.sync.syncSoon(2) }  // bring the new pins down
            }
            if let team: [TeamProfile] = try? await client.from("profile").select("id, full_name, email").execute()
                .value
            {
                session.sync.kv.setTeam(team)
            }
        }
    }

    /// Picks the screen for where the person is: signed out, owing a code, setting up, or in.
    struct RootView: View {
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.scenePhase) private var scenePhase

        var body: some View {
            Group {
                switch session.route {
                case .signedOut: SignInFlow()
                case .code: CodeView()
                case .setup: SetupView()
                case .finishSetup: FinishSetupView()
                case .ready: MainView()
                }
            }
            .preferredColorScheme(app.appearance.choice.colorScheme)
            .task { await session.launch() }
            // A new phone opens as soon as its company and membership arrive, a page or so into
            // the first download; the rest comes down behind the app (owner, 2026-10-21).
            .onChange(of: sync.status.download) { _, _ in
                if session.route == .setup { session.reloadCompanies() }
            }
            .onChange(of: scenePhase) { _, phase in
                // Screen time counts only while the app is in front (Admin portal Usage).
                UsageRecorder.shared.foreground(phase == .active)
                // The sign-in's token refreshes while the app is open and again on return to the
                // front (supabase-swift's autoRefreshToken does this too; said here so it holds).
                if phase == .active {
                    app.client.auth.startAutoRefresh()
                } else if phase == .background {
                    app.client.auth.stopAutoRefresh()
                }
                if phase == .background {
                    // Sent once, on reaching the background (inactive comes first and is often only
                    // a glance at Control Center), with iOS's time to finish it.
                    Task {
                        let time = BackgroundTime("Usage")
                        await UsageRecorder.shared.flush(app.api, companyId: session.company?.id)
                        time.end()
                    }
                }
                guard phase == .active else { return }
                sync.appBecameActive()
                Task {
                    await session.checkSession()
                    await session.checkSetup()
                }
            }
            .onChange(of: sync.revision) {
                session.reloadCompanies()
                app.liveStop.check()
                DayStartNotifications.check(session)
            }
            .onChange(of: session.user) { app.walkthrough.reload() }
            // Finish Setting Up Your Account (owner, 2026-10-24): asked once the shop's row is here.
            .task(id: "\(session.user?.id ?? "")|\(session.company?.id ?? "")|\(session.company?.role ?? "")") {
                await session.checkSetup()
            }
            .task(id: "\(session.user?.id ?? "")|\(session.company?.id ?? "")") {
                // Usage for the Admin portal (owner, 2026-10-22): sent every minute while signed in.
                guard session.user != nil else { return }
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(60))
                    await UsageRecorder.shared.flush(app.api, companyId: session.company?.id)
                }
            }
            .task(id: session.user?.id) {
                // Signed in: send a token the phone couldn't file offline, and ask iOS for a fresh one.
                guard let id = session.user?.id else { return }
                await app.push.registerIfNeeded(api: app.api, userId: id)
                await NotificationPermission.registerIfAllowed()
            }
            .task(id: "\(scenePhase == .active)|\(session.user?.id ?? "")|\(session.company?.id ?? "")") {
                // The Live Activity runs whenever the app is open during the work day: on launch
                // and on coming back to the app it begins again even if the tech removed it earlier
                // (`foregrounded`), then it's checked every minute while open (and after each
                // change, above), which keeps a removal.
                guard scenePhase == .active, session.user != nil, session.company != nil else { return }
                app.liveStop.foregrounded()
                DayStartNotifications.check(session)
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(60))
                    guard !Task.isCancelled else { return }
                    app.liveStop.check()
                    DayStartNotifications.check(session)
                }
            }
            .onOpenURL { url in
                if let link = AppLink(url: url) { app.link = link }
            }
        }
    }
#endif
