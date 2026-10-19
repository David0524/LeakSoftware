import Crypto
import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Supabase
import Testing

@testable import SundeckApp

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// S5's "Done when", the BUILD_PLAN M5 test through the Swift app against real Supabase
/// Storage: 30 photos and 2 videos captured offline upload after reconnecting, with the app
/// killed mid-upload, and nothing is duplicated. Port of packages/sync/test/hosted/media.test.ts,
/// through the app's own path (MediaWrites.saveCapture and SyncService). Needs the network, so
/// it runs only with `SUNDECK_LIVE=1`. Each run leaves about 16 MB in the dev project's media
/// bucket (originals can't be deleted by app users).
@Suite(.serialized, .enabled(if: ProcessInfo.processInfo.environment["SUNDECK_LIVE"] == "1")) @MainActor
struct LiveMediaTests {
    @Test(.timeLimit(.minutes(10)))
    func thirtyPhotosAndTwoVideosCapturedOfflineSurviveAKill() async throws {
        let check = ServerCheck(client: ServerCheck.makeClient())
        _ = try await check.signIn(email: "tech@demo.leakbook.test", password: "leakbook-demo")
        let client = check.client
        let token: @Sendable () async throws -> String? = { try? await client.auth.session.accessToken }

        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("live-media-\(UUID())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let db = try Database(
            path: folder.appendingPathComponent("app.db").path, key: String(repeating: "4d", count: 32))
        let store = try LocalStore.open(db)
        let kv = try KeyValue(db)
        let media = MediaFiles(root: folder)
        let transport = Switchable(SupabaseTransport(SupabaseRPC(client)))
        let http = KillingHTTP()
        func uploader(_ client: any HTTPClient) -> TusUploader {
            TusUploader(
                supabaseUrl: AppConfig.supabaseURL.absoluteString, apiKey: AppConfig.supabasePublishableKey,
                accessToken: token, files: media.source, http: client)
        }
        let sync = SyncService(
            store: store, kv: kv, transport: transport, auth: LiveAuth(), uploader: uploader(http), media: media)
        await sync.syncNow()
        #expect(sync.status.error == nil)
        let company = try #require(try store.list("company").first?["id"]?.string)

        // ---- Captured offline ----
        transport.offline = true
        http.offline = true
        let customer = try sync.insert("customer", companyId: company, ["name": "Swift media test"])
        let property = try sync.insert(
            "property", companyId: company, ["customer_id": .string(customer), "address_line1": "5 Upload Ave"])
        let job = try sync.insert(
            "job", companyId: company,
            ["property_id": .string(property), "bill_to_customer_id": .string(customer), "status": "in_progress"])

        struct Shot {
            let id: String
            let path: String
            let sha: String
            let video: Bool
        }
        var shots: [Shot] = []
        for i in 0..<32 {
            let video = i >= 30
            // Videos span two 6 MB chunks so the kill lands between chunks.
            let bytes = Data((0..<(video ? 7 * 1024 * 1024 : 256 * 1024)).map { _ in UInt8.random(in: 0...255) })
            let temp = folder.appendingPathComponent("capture-\(i)")
            try bytes.write(to: temp)
            let mime = video ? "video/mp4" : "image/jpeg"
            let id = try MediaWrites.saveCapture(
                sync, companyId: company, target: MediaTarget(jobId: job),
                CapturedFile(
                    kind: video ? .video : .photo, url: temp, mime: mime,
                    capturedAt: isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000)),
                at: nil)
            let sha = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
            shots.append(Shot(id: id, path: try mediaStoragePath(company, job, id, mime), sha: sha, video: video))
        }
        await sync.syncNow()
        #expect(sync.status.phase == .offline)
        #expect(sync.status.uploadsWaiting == 32)
        #expect(!sync.status.uploadsAllPhotos)

        // ---- Reconnect; the app is killed after the first video's first chunk ----
        let firstVideo = shots[30]
        http.killAfterFirstChunk = { url in
            (try? db.query("select media_id from upload_queue where resume_url = ?", [.text(url)]))?
                .first?["media_id"] == .text(firstVideo.id)
        }
        transport.offline = false
        http.offline = false
        try db.execute("update upload_queue set next_attempt_at = 0")
        await sync.syncNow()  // rows reach the server first, then the files
        #expect(sync.status.problems == 0)
        #expect(sync.status.uploadsWaiting == 2)
        let saved = try db.query("select resume_url from upload_queue where media_id = ?", [.text(firstVideo.id)])
        #expect(saved.first?["resume_url"].map { "\($0)".contains("upload/resumable/") } == true)

        // One photo finished on the server, but the app died before recording it.
        let photo = shots[0]
        try db.query(
            "insert into upload_queue (media_id, company_id, local_path, storage_path, mime_type) values (?, ?, ?, ?, ?)",
            [
                .text(photo.id), .text(company), .text(try media.relativePath(photo.id, mime: "image/jpeg")),
                .text(photo.path), .text("image/jpeg"),
            ])

        // ---- Relaunch: a fresh store, sync service and uploader over the same database ----
        sync.stop()
        let relaunched = try LocalStore.open(db)
        let sync2 = SyncService(
            store: relaunched, kv: kv, transport: transport, auth: LiveAuth(),
            uploader: uploader(URLSessionHTTPClient()), media: media)
        try db.execute("update upload_queue set next_attempt_at = 0")
        await sync2.syncNow()  // uploads the three
        #expect(sync2.status.uploadsWaiting == 0, "\(sync2.status.lastUploadError ?? "")")
        await sync2.syncNow()  // sends the "uploaded" marks
        #expect(sync2.status.pending == 0)
        #expect(sync2.status.problems == 0)

        // ---- Server: exactly 32 objects, all intact, all rows marked uploaded ----
        let bucket = client.storage.from("media")
        let listed = try await bucket.list(path: "\(company)/\(job)", options: SearchOptions(limit: 100))
        #expect(listed.map(\.name).sorted() == shots.map { String($0.path.split(separator: "/").last!) }.sorted())
        for shot in shots.filter(\.video) + [photo] {
            let data = try await bucket.download(path: shot.path)
            #expect(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() == shot.sha, "\(shot.id)")
        }
        struct Uploaded: Decodable {
            let uploadState: String
            enum CodingKeys: String, CodingKey { case uploadState = "upload_state" }
        }
        let rows: [Uploaded] = try await client.from("media").select("upload_state").eq("job_id", value: job)
            .execute().value
        #expect(rows.count == 32)
        #expect(rows.allSatisfy { $0.uploadState == "uploaded" })

        // Originals can't be overwritten.
        await #expect(throws: (any Error).self) {
            try await bucket.upload(
                photo.path, data: Data([1, 2, 3]), options: FileOptions(contentType: "image/jpeg", upsert: true))
        }
        try await check.signOut()
    }
}

/// The session lives in the Supabase client; this backend only says someone is signed in.
private struct LiveAuth: AuthBackend {
    func currentSession() async -> SignInResult? {
        SignInResult(user: SignedInUser(id: "live", email: "tech@demo.leakbook.test"), needsCode: false)
    }
    func signIn(email: String, password: String) async throws -> SignInResult { throw AuthMessage("not used") }
    func signUp(name: String, email: String, password: String) async throws -> Bool { false }
    func verifyCode(_ code: String) async throws {}
    func refresh() async throws {}
    func signOut() async {}
}

/// A sync transport that can lose its signal.
private final class Switchable: SyncTransport, @unchecked Sendable {
    private let inner: any SyncTransport
    private let lock = NSLock()
    private var _offline = false
    var offline: Bool {
        get { lock.withLock { _offline } }
        set { lock.withLock { _offline = newValue } }
    }

    init(_ inner: any SyncTransport) { self.inner = inner }

    func push(_ mutations: [Mutation], deviceId: String) async throws -> PushResponse {
        if offline { throw SyncFailure("Network request failed") }
        return try await inner.push(mutations, deviceId: deviceId)
    }
    func pull(cursor: PullCursor, pageSize: Int) async throws -> PullPage {
        if offline { throw SyncFailure("Network request failed") }
        return try await inner.pull(cursor: cursor, pageSize: pageSize)
    }
    func scope() async throws -> String? {
        if offline { throw SyncFailure("Network request failed") }
        return try await inner.scope()
    }
}

/// The uploader's network: off, on, or "killed" (everything fails) once the first chunk of a
/// chosen upload has reached the server.
private final class KillingHTTP: HTTPClient, @unchecked Sendable {
    private let inner = URLSessionHTTPClient()
    private let lock = NSLock()
    private var _offline = false
    private var _killed = false
    private var _kill: (@Sendable (String) -> Bool)?
    var offline: Bool {
        get { lock.withLock { _offline } }
        set { lock.withLock { _offline = newValue } }
    }
    var killAfterFirstChunk: (@Sendable (String) -> Bool)? {
        get { lock.withLock { _kill } }
        set { lock.withLock { _kill = newValue } }
    }

    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        if lock.withLock({ _offline || _killed }) { throw SyncFailure("Network request failed") }
        let response = try await inner.send(request)
        if request.method == "PATCH", request.header("upload-offset") == "0",
            killAfterFirstChunk?(request.url.absoluteString) == true
        {
            lock.withLock { _killed = true }
        }
        return response
    }
}
