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
    private let firstPage: Int
    private let retryDelays: [Double]
    private let sleep: @Sendable (Double) async -> Void
    private let now: @Sendable () -> Date
    private var running: Task<SyncSummary, Never>?
    /// The store's generation when the running sync started.
    private var runningGeneration = 0
    /// Told as each page of a first download is applied (`PullProgress`).
    private var onProgress: (@Sendable (PullProgress) -> Void)?

    /// Rows per page on a first download: the most sync_pull allows.
    public static let firstPullPage = 2000
    /// Seconds before each retry of a pull page that failed on the network (owner, 2026-10-22: the
    /// first download "stops around 40% with 'not connected to the internet'"). After the last the
    /// sync fails, and the next one carries on from the saved cursor.
    public static let pullRetryDelays: [Double] = [1, 3, 8]
    /// A first download's opening page: enough for the company and the membership.
    public static let openingPullPage = 50

    /// Follows a first download's progress, page by page.
    public func setProgressHandler(_ handler: (@Sendable (PullProgress) -> Void)?) { onProgress = handler }

    /// `pushBatch` is mutations per sync_push call (server limit 500); `pullPage` rows per page;
    /// `firstPullPage` rows per page on a first download (tests make it small); `now` is the clock
    /// for which jobs have aged off phones (tests set it); `pullRetryDelays` and `sleep` are how a
    /// pull page that failed on the network is asked for again (tests shorten them).
    public init(
        store: LocalStore, transport: any SyncTransport, pushBatch: Int = 200, pullPage: Int = 500,
        firstPullPage: Int = SyncEngine.firstPullPage, pullRetryDelays: [Double] = SyncEngine.pullRetryDelays,
        sleep: @escaping @Sendable (Double) async -> Void = { try? await Task.sleep(for: .seconds($0)) },
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        retryDelays = pullRetryDelays
        self.sleep = sleep
        self.store = store
        self.transport = transport
        self.pushBatch = min(pushBatch, 500)
        self.pullPage = pullPage
        firstPage = min(firstPullPage, Self.firstPullPage)
        self.now = now
    }

    public func sync() async -> SyncSummary {
        if let running, runningGeneration == store.generation { return await running.value }
        // One running for a sign-in the phone has since cleared saves nothing more: wait for it
        // to stop, then start over for whoever is signed in now (unless another call already has).
        if let running { _ = await running.value }
        if let running, runningGeneration == store.generation { return await running.value }
        let generation = store.generation
        let task = Task { await self.run(generation) }
        running = task
        runningGeneration = generation
        let summary = await task.value
        if running == task { running = nil }
        return summary
    }

    /// Signing out clears the phone (`clearAll`) and may do so while this sync waits on the
    /// server: from then on nothing it brings back is saved (rows, cursor, scope), or the next
    /// sign-in would carry on from the old one's cursor with a partial download.
    private func run(_ generation: Int) async -> SyncSummary {
        var summary = SyncSummary()
        do {
            try await push(&summary, generation)
            try await pull(&summary, generation)
        } catch {
            summary.error = String(describing: error)
            if error is AuthError { summary.authFailed = true }
        }
        summary.pending = (try? store.pendingCount()) ?? 0
        return summary
    }

    private func push(_ summary: inout SyncSummary, _ generation: Int) async throws {
        while true {
            let batch = try store.pendingBatch(maxMutations: pushBatch)
            if batch.mutations.isEmpty { return }
            let allSeqs = batch.mutations.flatMap { batch.seqsByMutation[$0.id] ?? [] }

            let response: PushResponse
            do {
                response = try await transport.push(batch.mutations, deviceId: store.deviceId)
            } catch {
                try store.checkGeneration(generation)
                try store.noteFailure(allSeqs, error: String(describing: error))
                throw error
            }

            try store.checkGeneration(generation)
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

    private func pull(_ summary: inout SyncSummary, _ generation: Int) async throws {
        // When what this user may see has changed, start from the beginning and keep only what
        // comes back: newly visible jobs arrive whole, and jobs taken away leave the device.
        let scope = try await transport.scope()
        try store.checkGeneration(generation)
        let last = try store.scope()
        let restart = scope != nil && last != nil && scope != last
        var seen: Set<String>? = restart ? [] : nil
        let cursor: PullCursor = restart ? .object([:]) : try store.cursor()
        // A first download (no cursor yet, a restart, or one the app was closed during, whose
        // cursor the server marked): ask how much there is, for the progress screen (never fails
        // the sync), and take the biggest pages.
        let first = restart || cursor == .object([:]) || isFirstDownload(cursor)
        // A first download's opening page is small: the company and the membership come first,
        // so the app opens after one quick request while the rest comes down behind it (owner,
        // 2026-10-22: "The initial app downloading screen is still taking way too long"). The
        // count for the progress bar runs alongside it rather than before it.
        let transport = self.transport
        var progress: PullProgress? = nil
        var counting: Task<[String: Int]?, Never>? = nil
        if first {
            counting = Task { (try? await transport.pullCount()) ?? nil }
            // A download picked up again after a failure counts what is already on the phone, so
            // the bar carries on from where it was instead of starting at 0%.
            let already = restart || cursor == .object([:]) ? [:] : try store.liveCounts()
            progress = PullProgress(totals: nil, pulled: already)
            onProgress?(progress!)
        }
        let size = first ? firstPage : pullPage
        let delays = retryDelays
        let sleep = self.sleep
        var page = try await pullWithRetry(
            transport, cursor: cursor, size: first ? min(Self.openingPullPage, size) : size, delays: delays,
            sleep: sleep)
        while true {
            // The next page is already on its way while this one is saved.
            let next: Task<PullPage, Error>? =
                page.done
                ? nil
                : Task { [cursor = page.cursor] in
                    try await pullWithRetry(transport, cursor: cursor, size: size, delays: delays, sleep: sleep)
                }
            do {
                try store.applyPage(page, generation: generation)
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
                    try store.checkGeneration(generation)
                    onProgress?(progress!)
                }
            }
            guard let next else { break }
            page = try await next.value
        }
        try store.checkGeneration(generation)
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

/// One pull page, asked for again after each of `delays` when it fails on the network.
func pullWithRetry(
    _ transport: any SyncTransport, cursor: PullCursor, size: Int, delays: [Double],
    sleep: @Sendable (Double) async -> Void
) async throws -> PullPage {
    var attempt = 0
    while true {
        do {
            return try await transport.pull(cursor: cursor, pageSize: size)
        } catch {
            guard attempt < delays.count, isNetworkFailure(error), !Task.isCancelled else { throw error }
            await sleep(delays[attempt])
            attempt += 1
        }
    }
}

/// Errors that mean the request didn't get through (worth asking again), not a refusal. Port of
/// isNetworkFailure in packages/sync/src/engine.ts.
public func isNetworkFailure(_ error: Error) -> Bool {
    if error is AuthError { return false }
    return String(describing: error).firstMatch(of: networkFailurePattern) != nil
}

nonisolated(unsafe) let networkFailurePattern =
    /(?i)network|fetch|offline|timed? ?out|timeout|could not connect|internet connection|connection (was )?(reset|lost|closed|refused|aborted)|socket|ECONN|ETIMEDOUT|EAI_AGAIN|NSURLErrorDomain|URLError|\b50[234]\b|gateway/

/// The server marks a first download's cursors (`"first": true`,
/// 20261022001900_first_download.sql): it leaves out deleted rows until the download is done.
func isFirstDownload(_ cursor: PullCursor) -> Bool {
    if case .object(let fields) = cursor, fields["first"] == .bool(true) { return true }
    return false
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
