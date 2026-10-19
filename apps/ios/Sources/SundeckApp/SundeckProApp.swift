#if os(iOS)
    import Network
    import Sentry
    import Supabase
    import SundeckStorage
    import SundeckSync
    import SwiftUI

    @main
    struct SundeckProApp: App {
        @State private var app = AppEnvironment.make()

        init() {
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
                        .environment(\.mediaURLSigner, environment.signer)
                case .failure(let error):
                    ContentUnavailableView(
                        "Sundeck Pro Couldn’t Start", systemImage: "exclamationmark.triangle",
                        description: Text("This phone’s storage couldn’t be opened. \(error.localizedDescription)"))
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
        /// Signed links to uploaded files, shared by every screen so links are reused.
        let signer: MediaURLSigner
        @ObservationIgnored private let monitor = NWPathMonitor()

        init(client: SupabaseClient, session: Session, walkthrough: Walkthrough) {
            self.client = client
            self.session = session
            self.walkthrough = walkthrough
            signer = MediaURLSigner { path, seconds in
                try await client.storage.from("media").createSignedURL(path: path, expiresIn: seconds)
            }
        }

        /// The website's API as the signed-in person (reports, quotes, transcripts).
        var api: WebAPI {
            WebAPI(baseURL: AppConfig.webURL) { [client] in try? await client.auth.session.accessToken }
        }

        static func make() -> Result<AppEnvironment, Error> {
            Result {
                let db = try openDatabase()
                let store = try LocalStore.open(db)
                let kv = try KeyValue(db)
                let client = ServerCheck.makeClient()
                let auth = SupabaseAuthBackend(client)
                let media = try MediaFiles.documents()
                let uploader = TusUploader(
                    supabaseUrl: AppConfig.supabaseURL.absoluteString, apiKey: AppConfig.supabasePublishableKey,
                    accessToken: { try? await client.auth.session.accessToken }, files: media.source)
                let sync = SyncService(
                    store: store, kv: kv, transport: SupabaseTransport(SupabaseRPC(client)), auth: auth,
                    uploader: uploader, media: media)
                let environment = AppEnvironment(
                    client: client, session: Session(sync: sync, auth: auth), walkthrough: Walkthrough(kv))
                sync.afterSync = { [weak environment] in await environment?.afterSync() }
                sync.voiceNoteUploaded = { [weak sync] id in
                    // Ask the server to transcribe it. Best effort: offline, the office can retry.
                    let api = WebAPI(baseURL: AppConfig.webURL) { try? await client.auth.session.accessToken }
                    if (try? await api.post("api/media/\(id)/transcribe")) != nil { sync?.syncSoon(0) }
                }
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
            monitor.pathUpdateHandler = { [weak self] path in
                let online = path.status == .satisfied
                Task { @MainActor in self?.session.sync.networkChanged(online: online) }
            }
            monitor.start(queue: DispatchQueue(label: "network"))
        }

        /// After each sync: the company list, and teammates' names for offline use.
        private func afterSync() async {
            session.reloadCompanies()
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
                case .ready: MainView()
                }
            }
            .task { await session.launch() }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active else { return }
                sync.appBecameActive()
                Task { await session.checkSession() }
            }
            .onChange(of: sync.revision) { session.reloadCompanies() }
            .onChange(of: session.user) { app.walkthrough.reload() }
        }
    }
#endif
