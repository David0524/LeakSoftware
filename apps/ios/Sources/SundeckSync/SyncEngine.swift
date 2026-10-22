import Foundation
import SundeckCore

/// What one sync did. Port of packages/sync/src/engine.ts.
public struct SyncSummary: Equatable, Sendable {
    public var pushed = 0
    public var rejected = 0
    public var pulled = 0
    public var pending = 0
    public var error: String?
    /// The shop is read-only (its Sundeck Pro subscription isn't paid): changes stay on the
    /// device, unsent, and go up once it is paid. Downloads continue.
    public var readOnly: String?
    /// The server no longer accepts this sign-in. Nothing is lost: changes stay in the outbox
    /// until the user signs in again.
    public var authFailed = false

    public init() {}
}

/// Server code for "this shop is read-only" (supabase/migrations/20261012002100_billing.sql).
public let readOnlyCode = "TL423"

/// Pushes local changes, then pulls server changes. Only one sync runs at a time; calling
/// `sync()` while one is running returns the running one. Failures never lose local data:
/// unsent changes stay in the outbox and the next sync retries them.
public actor SyncEngine {
    private let store: LocalStore
    private let transport: any SyncTransport
    private let pushBatch: Int
    private let pullPage: Int
    private let now: @Sendable () -> Date
    private var running: Task<SyncSummary, Never>?
    /// Told as each page of a first download is applied (`PullProgress`).
    private var onProgress: (@Sendable (PullProgress) -> Void)?

    /// Rows per page on a first download: the most sync_pull allows.
    public static let firstPullPage = 2000
    /// A first download's opening page: enough for the company and the membership.
    public static let openingPullPage = 50

    /// Follows a first download's progress, page by page.
    public func setProgressHandler(_ handler: (@Sendable (PullProgress) -> Void)?) { onProgress = handler }

    /// `pushBatch` is mutations per sync_push call (server limit 500); `pullPage` rows per page;
    /// `now` is the clock for which jobs have aged off phones (tests set it).
    public init(
        store: LocalStore, transport: any SyncTransport, pushBatch: Int = 200, pullPage: Int = 500,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.store = store
        self.transport = transport
        self.pushBatch = min(pushBatch, 500)
        self.pullPage = pullPage
        self.now = now
    }

    public func sync() async -> SyncSummary {
        if let running { return await running.value }
        let task = Task { await self.run() }
        running = task
        let summary = await task.value
        running = nil
        return summary
    }

    private func run() async -> SyncSummary {
        var summary = SyncSummary()
        do {
            try await push(&summary)
            try await pull(&summary)
        } catch {
            summary.error = String(describing: error)
            if error is AuthError { summary.authFailed = true }
        }
        summary.pending = (try? store.pendingCount()) ?? 0
        return summary
    }

    private func push(_ summary: inout SyncSummary) async throws {
        while true {
            let batch = try store.pendingBatch(maxMutations: pushBatch)
            if batch.mutations.isEmpty { return }
            let allSeqs = batch.mutations.flatMap { batch.seqsByMutation[$0.id] ?? [] }

            let response: PushResponse
            do {
                response = try await transport.push(batch.mutations, deviceId: store.deviceId)
            } catch {
                try store.noteFailure(allSeqs, error: String(describing: error))
                throw error
            }

            try store.receiveClock(response.serverHLC)
            var handled = Set<String>()
            var held: [Int] = []
            for result in response.results {
                let seqs = batch.seqsByMutation[result.id] ?? []
                handled.insert(result.id)
                if result.status == .rejected, result.code == readOnlyCode {
                    held += seqs
                    summary.readOnly = result.error ?? "This shop is read-only."
                } else if result.status == .rejected {
                    let message = "\(result.code ?? "") \(result.error ?? "rejected")"
                    try store.reject(seqs, error: message.trimmingCharacters(in: .whitespaces))
                    summary.rejected += 1
                } else {
                    try store.acknowledge(seqs)
                    summary.pushed += 1
                }
            }
            // A response that skipped mutations would loop forever; treat it as a failure.
            let missing = batch.mutations.filter { !handled.contains($0.id) }
            if !missing.isEmpty {
                try store.noteFailure(
                    missing.flatMap { batch.seqsByMutation[$0.id] ?? [] }, error: "no result from server")
                throw SyncFailure("Server returned no result for \(missing.count) change(s)")
            }
            // Read-only: keep these for later (not a conflict) and stop pushing for now.
            if !held.isEmpty {
                try store.noteFailure(held, error: summary.readOnly!)
                return
            }
        }
    }

    private func pull(_ summary: inout SyncSummary) async throws {
        // When what this user may see has changed, start from the beginning and keep only what
        // comes back: newly visible jobs arrive whole, and jobs taken away leave the device.
        let scope = try await transport.scope()
        let last = try store.scope()
        let restart = scope != nil && last != nil && scope != last
        var seen: Set<String>? = restart ? [] : nil
        let cursor: PullCursor = restart ? .object([:]) : try store.cursor()
        // A first download (no cursor yet) or a restart: ask how much there is, for the
        // progress screen (never fails the sync), and take the biggest pages.
        let first = restart || cursor == .object([:])
        // A first download's opening page is small: the company and the membership come first,
        // so the app opens after one quick request while the rest comes down behind it (owner,
        // 2026-10-22: "The initial app downloading screen is still taking way too long"). The
        // count for the progress bar runs alongside it rather than before it.
        let transport = self.transport
        var progress: PullProgress? = nil
        var counting: Task<[String: Int]?, Never>? = nil
        if first {
            counting = Task { (try? await transport.pullCount()) ?? nil }
            progress = PullProgress(totals: nil)
            onProgress?(progress!)
        }
        let size = first ? max(pullPage, Self.firstPullPage) : pullPage
        var page = try await transport.pull(cursor: cursor, pageSize: first ? min(Self.openingPullPage, size) : size)
        while true {
            // The next page is already on its way while this one is saved.
            let next: Task<PullPage, Error>? =
                page.done
                ? nil : Task { [cursor = page.cursor] in try await transport.pull(cursor: cursor, pageSize: size) }
            do {
                try store.applyPage(page)
            } catch {
                next?.cancel()
                throw error
            }
            if seen != nil { for r in page.rows { seen!.insert("\(r.table):\(r.row.id)") } }
            summary.pulled += page.rows.count
            if progress != nil {
                for r in page.rows { progress!.pulled[r.table, default: 0] += 1 }
                progress!.finished = page.done
                onProgress?(progress!)
                if let count = counting {
                    counting = nil
                    progress!.totals = await count.value
                    onProgress?(progress!)
                }
            }
            guard let next else { break }
            page = try await next.value
        }
        // Only after a complete pull: an interrupted one starts over next time.
        if let seen { try store.keepOnly(seen) }
        if let scope { try store.setScope(scope) }
        // Finished jobs leave the phone a week after the server stops sending them.
        let date = now()
        try store.pruneJobs { job in
            guard let dates = try? JSONValue.object(job).decode(JobDates.self) else { return true }
            return jobOnPhones(dates, now: date, extraDays: phoneHistoryMarginDays)
        }
    }
}

public struct SyncFailure: Error, CustomStringConvertible {
    public let description: String
    public init(_ message: String) { description = message }
}

extension JSONValue {
    /// This value decoded as `T`.
    public func decode<T: Decodable>(_ type: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONEncoder().encode(self))
    }
}
