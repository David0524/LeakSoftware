import Foundation
import Observation
import SundeckCore
import SundeckStorage
import SundeckSync

#if canImport(UIKit)
    import UIKit
#endif

/// Where syncing stands. Port of SyncPhase in apps/mobile/src/lib/sync-service.ts.
public enum SyncPhase: String, Sendable {
    case idle, syncing, offline, signedOut, error, readOnly
}

/// What the sync bar and Settings show.
public struct SyncStatus: Equatable, Sendable {
    public var phase: SyncPhase = .idle
    public var pending = 0
    public var problems = 0
    public var lastSyncedAt: Date?
    public var initialSyncDone = false
    public var error: String?
    public var uploadsWaiting = 0
    /// Every waiting file is a photo (the bar then says "photos", not "photos and recordings").
    public var uploadsAllPhotos = true
    public var lastUploadError: String?
    public var storageLow = false
    /// Since when changes or files have waited without a break, or nil when nothing waits. The
    /// sync bar says so only after `syncNoteDelay` of it (`syncBarStatus`).
    public var waitingSince: Date?
    /// The first download's progress (rows per table against the server's count), for Getting
    /// Ready; nil outside a first download.
    public var download: PullProgress?

    public init() {}
}

/// Syncs the phone's database with the server: right away, when the app comes to the
/// foreground, when the network returns, every minute, and two seconds after each change.
/// Every local write goes through here (row and outbox in one transaction, then a sync soon).
/// Port of apps/mobile/src/lib/sync-service.ts.
@MainActor @Observable
public final class SyncService {
    public private(set) var status = SyncStatus() {
        didSet {
            let running = !status.initialSyncDone && status.phase == .syncing
            if firstSyncRunning != running { firstSyncRunning = running }
        }
    }
    /// The first download is running (no company on the phone yet). Its own property, so a screen
    /// that only needs this (Today's skeleton) doesn't redraw on every status change (gestures
    /// spec section 6).
    public private(set) var firstSyncRunning = false
    /// Changes whenever local data changes (a write, a pull, a sign-out), so screens re-read.
    public private(set) var revision = 0
    /// Bumped when a held-back "waiting" note comes due, so the sync bar looks again.
    private var noteTick = 0
    public let store: LocalStore
    public let kv: KeyValue

    @ObservationIgnored private let transport: any SyncTransport
    @ObservationIgnored private let engine: SyncEngine
    /// Captured files waiting to upload (nil when the app has no uploader, as in some tests).
    @ObservationIgnored private let uploads: UploadQueue?
    /// Where captures are kept; emptied on sign-out.
    @ObservationIgnored public let media: MediaFiles?
    @ObservationIgnored private let auth: any AuthBackend
    @ObservationIgnored private let now: @Sendable () -> Date
    @ObservationIgnored private var started = false
    @ObservationIgnored private var progressWired = false
    @ObservationIgnored private var online = true
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private var soon: Task<Void, Never>?
    @ObservationIgnored private var noteTimer: Task<Void, Never>?
    /// Bumped by `stop()`, so a sync still running when the phone signs out is ignored.
    @ObservationIgnored private var epoch = 0
    /// The server refused this phone's sign-in and a refresh didn't help: `Session` signs out on
    /// this phone and shows Sign In, keeping the phone's data for the same account.
    @ObservationIgnored public var sessionEnded: (@MainActor () async -> Void)?
    /// Asks iOS for time to finish a sync when the screen locks or the app is switched away, so a
    /// first download isn't cut off part way (owner, 2026-10-22). The app turns it on; tests don't.
    @ObservationIgnored public var holdsBackgroundTime = false
    /// Runs after each successful sync (teammates' names).
    @ObservationIgnored public var afterSync: (@MainActor () async -> Void)?
    /// Runs for each voice note whose file just uploaded (asks the server for a transcript).
    @ObservationIgnored public var voiceNoteUploaded: (@MainActor (String) async -> Void)?

    public init(
        store: LocalStore, kv: KeyValue, transport: any SyncTransport, auth: any AuthBackend,
        uploader: (any Uploader)? = nil, media: MediaFiles? = nil,
        pullRetryDelays: [Double] = SyncEngine.pullRetryDelays, now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.store = store
        self.kv = kv
        self.transport = transport
        self.auth = auth
        self.now = now
        self.media = media
        engine = SyncEngine(store: store, transport: transport, pullRetryDelays: pullRetryDelays, now: now)
        uploads = uploader.map {
            UploadQueue(store: store, uploader: $0) { Int64((now().timeIntervalSince1970 * 1000).rounded(.down)) }
        }
        status.lastSyncedAt = kv.get(KVKey.lastSyncedAt).flatMap(Double.init).map { Date(timeIntervalSince1970: $0) }
        status.initialSyncDone = kv.get(KVKey.initialSyncDone) == "1"
        refreshCounts()
    }

    // MARK: - When to sync

    /// Starts syncing now and every minute. Does nothing if already started.
    public func start() {
        guard !started else { return }
        started = true
        syncSoon(0)
        timer = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                if Task.isCancelled { return }
                await self?.syncNow()
            }
        }
    }

    public func stop() {
        started = false
        epoch += 1
        timer?.cancel()
        soon?.cancel()
        timer = nil
        soon = nil
    }

    /// The app came to the foreground.
    public func appBecameActive() {
        if started { syncSoon(0) }
    }

    /// The network came or went (NWPathMonitor on the phone).
    public func networkChanged(online: Bool) {
        let wasOnline = self.online
        self.online = online
        if !online {
            status.phase = .offline
        } else if !wasOnline, started {
            try? uploads?.retryNow()
            syncSoon(0)
        }
    }

    /// Syncs after `seconds`, replacing any sync already waiting.
    public func syncSoon(_ seconds: Double) {
        soon?.cancel()
        soon = Task { [weak self] in
            if seconds > 0 { try? await Task.sleep(for: .seconds(seconds)) }
            if Task.isCancelled { return }
            await self?.syncNow()
        }
    }

    // MARK: - Syncing

    @ObservationIgnored private var lastDownloadRefresh = Date.distantPast

    /// A page of the first download saved: the progress, and every two seconds a re-read, so the
    /// screens fill in while the rest comes down behind the app (owner, 2026-10-21).
    private func downloaded(_ progress: PullProgress) {
        status.download = progress
        let at = now()
        // Nothing has landed before the first page, so that call doesn't start the two seconds:
        // the first page (the company, so the app opens) is read at once.
        if !status.initialSyncDone, !progress.pulled.isEmpty, at.timeIntervalSince(lastDownloadRefresh) >= 2 {
            lastDownloadRefresh = at
            revision += 1
        }
    }

    public func syncNow() async {
        guard online else {
            status.phase = .offline
            return
        }
        if status.phase == .signedOut, await auth.currentSession() == nil { return }
        status.phase = .syncing
        let background = holdsBackgroundTime ? BackgroundTime("Sync") : nil
        defer { background?.end() }
        if !progressWired {
            progressWired = true
            await engine.setProgressHandler { [weak self] progress in
                Task { @MainActor in self?.downloaded(progress) }
            }
        }
        let run = epoch
        var summary = await engine.sync()
        // Stopped meanwhile (signed out): a late answer changes nothing.
        guard run == epoch else { return }
        if summary.authFailed || looksSignedOut(summary.error) {
            // No valid sign-in reached the server (expired, revoked, or no user token at all, which
            // Postgres answers with "permission denied for function sync_pull"). Refresh once and
            // try again; if the refresh is refused, this phone signs out (owner, 2026-10-22).
            switch await renewSignIn() {
            case .renewed:
                summary = await engine.sync()
                guard run == epoch else { return }
            case .offline:
                status.phase = .offline
                status.error = nil
                refreshCounts()
                return
            case .ended:
                summary.authFailed = true
            }
            if summary.authFailed {
                status.phase = .signedOut
                status.error = nil
                refreshCounts()
                await sessionEnded?()
                return
            }
        }
        if let error = summary.error {
            let offline = error.firstMatch(of: Self.networkPattern) != nil
            status.phase = offline ? .offline : .error
            // Plain words only, never the server's message (owner, 2026-10-22).
            status.error = offline ? nil : syncErrorText(error)
        } else {
            let at = now()
            status.lastSyncedAt = at
            kv.set(KVKey.lastSyncedAt, String(at.timeIntervalSince1970))
            status.initialSyncDone = true
            kv.set(KVKey.initialSyncDone, "1")
            status.error = nil
            status.phase = summary.readOnly != nil ? .readOnly : .idle
            await afterSync?()
        }
        if summary.pulled > 0 || summary.pushed > 0 { revision += 1 }
        refreshCounts()
        if summary.error == nil { await runUploads() }
    }

    /// Uploads due files; then sends the "uploaded" marks and asks for transcripts.
    private func runUploads() async {
        guard let uploads, ((try? uploads.waitingCount()) ?? 0) > 0 else { return }
        let result: UploadSummary
        do {
            result = try await uploads.process()
        } catch {
            refreshCounts()
            return
        }
        refreshCounts()
        guard result.uploaded > 0 else { return }
        revision += 1
        if started { syncSoon(0) }  // send the "uploaded" marks
        for id in result.uploadedIds where (try? store.get("media", id))??["kind"] == "audio" {
            await voiceNoteUploaded?(id)
        }
    }

    /// Retries waiting uploads now (Settings button).
    public func retryUploads() {
        try? uploads?.retryNow()
        syncSoon(0)
    }

    enum Renewal { case renewed, offline, ended }

    /// One refresh of the sign-in: renewed, only offline (keep the sign-in), or refused.
    private func renewSignIn() async -> Renewal {
        do {
            try await auth.refresh()
            return .renewed
        } catch {
            let text = String(describing: error)
            if error is URLError || isConnectionError(text) || text.firstMatch(of: Self.networkPattern) != nil {
                return .offline
            }
            return .ended
        }
    }

    /// Errors that mean the phone couldn't reach the server.
    static let networkPattern =
        /(?i)network|fetch|offline|timed? ?out|could not connect|internet connection|NSURLErrorDomain|URLError/

    // MARK: - Local writes

    @discardableResult
    public func insert(_ table: String, companyId: String, _ values: Row) throws -> String {
        let id = try guarded { try store.insert(table, companyId: companyId, values) }
        changed()
        return id
    }

    public func write(_ table: String, id: String, companyId: String, _ values: Row) throws {
        try guarded { try store.write(table, id: id, companyId: companyId, values) }
        changed()
    }

    public func softDelete(_ table: String, _ id: String) throws {
        try guarded { try store.softDelete(table, id) }
        changed()
    }

    /// Several writes as one unit: all saved, or none.
    public func batch<T>(_ body: () throws -> T) throws -> T {
        let result = try guarded { try store.database.transaction(body) }
        changed()
        return result
    }

    /// Saves a capture: the media row and its upload ticket in one transaction, so a file is never
    /// queued without its row or the other way around.
    public func addMedia(_ id: String, companyId: String, _ values: Row, file: UploadJob) throws {
        try guarded {
            try store.database.transaction {
                try store.write("media", id: id, companyId: companyId, values)
                try uploads?.enqueue(file)
            }
        }
        changed()
    }

    /// Saves a signature: the row (already holding its storage path) and its upload ticket.
    public func addSignature(_ id: String, companyId: String, _ values: Row, localPath: String, storagePath: String)
        throws
    {
        var row = values
        row["device_id"] = .string(store.deviceId)
        try guarded {
            try store.database.transaction {
                try store.write("signature", id: id, companyId: companyId, row)
                try uploads?.enqueue(
                    UploadJob(
                        mediaId: id, recordTable: .signature, companyId: companyId, localPath: localPath,
                        storagePath: storagePath, mimeType: "image/svg+xml"))
            }
        }
        changed()
    }

    /// True while a photo, video, voice note or signature image of this job is still waiting to
    /// upload, so a report sent now would miss it (apps/mobile `hasPendingUploads`).
    public func hasPendingUploads(jobId: String) -> Bool {
        let rows = try? store.database.query(
            """
            select count(*) as n from upload_queue q
              join sync_records r on r.table_name = q.record_table and r.id = q.media_id
             where json_extract(r.data, '$.job_id') = ?
            """, [.text(jobId)])
        if case .integer(let n)? = rows?.first?["n"] { return n > 0 }
        return false
    }

    /// True while local edits to this row (or, without an id, this table) are unsent.
    public func hasPendingWrites(_ table: String, _ id: String? = nil) -> Bool {
        let sql =
            "select count(*) as n from sync_outbox where table_name = ? and status = 'pending'"
            + (id != nil ? " and row_id = ?" : "")
        let rows = try? store.database.query(sql, id.map { [.text(table), .text($0)] } ?? [.text(table)])
        if case .integer(let n)? = rows?.first?["n"] { return n > 0 }
        return false
    }

    /// Drops a change the server refused; the server's value comes back on the next sync.
    public func discardProblem(_ seq: Int) throws {
        try store.discardProblem(seq)
        changed()
    }

    /// Removes everything synced from this phone (sign-out). Keeps the device id and clock.
    public func clearLocalData() {
        stop()
        try? store.clearAll()
        media?.deleteAll()
        for key in KVKey.signOutClears { kv.remove(key) }
        status = SyncStatus()
        status.phase = .signedOut
        revision += 1
    }

    // MARK: - Helpers

    private func changed() {
        revision += 1
        refreshCounts()
        if started { syncSoon(2) }
    }

    private func guarded<T>(_ body: () throws -> T) throws -> T {
        do {
            return try body()
        } catch {
            if isStorageFull(error) { status.storageLow = true }
            throw error
        }
    }

    /// What the sync bar shows now: waiting changes and files only once they've waited 8
    /// seconds (owner, 2026-10-20). `status` is the real state (More › Sync).
    public var barStatus: SyncStatus {
        _ = noteTick
        return syncBarStatus(status, now: now())
    }

    /// Keeps `waitingSince` and looks again when a held-back note comes due.
    private func updateWaiting() {
        let since = waitingSince(status, previous: status.waitingSince, now: now())
        if status.waitingSince != since { status.waitingSince = since }
        noteTimer?.cancel()
        guard let due = syncNoteDueAt(status, now: now()) else { return }
        let delay = max(0, due.timeIntervalSince(now()))
        noteTimer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            self?.noteTick += 1
        }
    }

    private func refreshCounts() {
        status.pending = (try? store.pendingCount()) ?? 0
        status.problems = (try? store.problems().count) ?? 0
        // Waiting files, whether all are photos (the bar then says "photos"), and the last error.
        let rows =
            (try? store.database.query(
                """
                select json_extract(r.data, '$.kind') as kind, q.last_error
                from upload_queue q left join sync_records r on r.table_name = 'media' and r.id = q.media_id
                order by q.rowid
                """)) ?? []
        status.uploadsWaiting = rows.count
        status.uploadsAllPhotos = rows.allSatisfy { sqlText($0["kind"]) == "photo" }
        status.lastUploadError = rows.lazy.compactMap { sqlText($0["last_error"]) }.first
        updateWaiting()
    }
}

private func sqlText(_ value: SQLValue?) -> String? {
    if case .text(let text)? = value { return text }
    return nil
}

/// Time iOS gives the app to finish what it started after it leaves the screen (about 30
/// seconds); ended when the work finishes, when iOS says time is up, or when this is let go,
/// whichever comes first. Nothing on other systems.
///
/// The identifier lives in a locked box that the expiration handler holds strongly (not through
/// a weak `self`), so iOS's "time is up" always ends this exact task, even after the owner is
/// gone; a task left running past its time gets the app killed as it closes (0xbada5e47). The
/// handler is made outside the main actor: Swift 6 checks a main-actor closure's thread when it
/// runs, and a check failing there would crash the app at the same moment.
@MainActor final class BackgroundTime {
    private let task = BackgroundTaskBox()

    init(_ name: String) {
        #if canImport(UIKit)
            let task = self.task
            task.set(UIApplication.shared.beginBackgroundTask(withName: name, expirationHandler: Self.expiry(task)))
        #endif
    }

    deinit { task.end() }

    func end() { task.end() }

    #if canImport(UIKit)
        /// iOS's "time is up": ends the task it was made for, on the main thread.
        private nonisolated static func expiry(_ task: BackgroundTaskBox) -> @Sendable () -> Void {
            { task.end() }
        }
    #endif
}

/// One background task's identifier, ended exactly once from any thread.
final class BackgroundTaskBox: @unchecked Sendable {
    private let lock = NSLock()
    #if canImport(UIKit)
        private var id: UIBackgroundTaskIdentifier = .invalid
        private var ended = false

        /// The identifier iOS gave; ended at once if `end()` already ran (time was up first).
        func set(_ id: UIBackgroundTaskIdentifier) {
            lock.lock()
            let endNow = ended
            if !endNow { self.id = id }
            lock.unlock()
            if endNow { Self.endTask(id) }
        }
    #endif

    func end() {
        #if canImport(UIKit)
            lock.lock()
            let id = self.id
            self.id = .invalid
            ended = true
            lock.unlock()
            Self.endTask(id)
        #endif
    }

    #if canImport(UIKit)
        private static func endTask(_ id: UIBackgroundTaskIdentifier) {
            guard id != .invalid else { return }
            if Thread.isMainThread {
                MainActor.assumeIsolated { UIApplication.shared.endBackgroundTask(id) }
            } else {
                DispatchQueue.main.async { MainActor.assumeIsolated { UIApplication.shared.endBackgroundTask(id) } }
            }
        }
    #endif
}
