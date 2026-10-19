import Foundation
import Observation
import SundeckCore
import SundeckStorage
import SundeckSync

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

    public init() {}
}

/// Syncs the phone's database with the server: right away, when the app comes to the
/// foreground, when the network returns, every minute, and two seconds after each change.
/// Every local write goes through here (row and outbox in one transaction, then a sync soon).
/// Port of apps/mobile/src/lib/sync-service.ts.
@MainActor @Observable
public final class SyncService {
    public private(set) var status = SyncStatus()
    /// Changes whenever local data changes (a write, a pull, a sign-out), so screens re-read.
    public private(set) var revision = 0
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
    @ObservationIgnored private var online = true
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private var soon: Task<Void, Never>?
    /// Runs after each successful sync (teammates' names).
    @ObservationIgnored public var afterSync: (@MainActor () async -> Void)?
    /// Runs for each voice note whose file just uploaded (asks the server for a transcript).
    @ObservationIgnored public var voiceNoteUploaded: (@MainActor (String) async -> Void)?

    public init(
        store: LocalStore, kv: KeyValue, transport: any SyncTransport, auth: any AuthBackend,
        uploader: (any Uploader)? = nil, media: MediaFiles? = nil, now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.store = store
        self.kv = kv
        self.transport = transport
        self.auth = auth
        self.now = now
        self.media = media
        engine = SyncEngine(store: store, transport: transport, now: now)
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

    public func syncNow() async {
        guard online else {
            status.phase = .offline
            return
        }
        if status.phase == .signedOut, await auth.currentSession() == nil { return }
        status.phase = .syncing
        var summary = await engine.sync()
        if summary.authFailed {
            // An expired token: refresh once, then try again.
            if (try? await auth.refresh()) != nil {
                summary = await engine.sync()
            }
            if summary.authFailed {
                status.phase = .signedOut
                refreshCounts()
                return
            }
        }
        if let error = summary.error {
            let offline = error.firstMatch(of: Self.networkPattern) != nil
            status.phase = offline ? .offline : .error
            status.error = offline ? nil : error
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
    }
}

private func sqlText(_ value: SQLValue?) -> String? {
    if case .text(let text)? = value { return text }
    return nil
}
