import Foundation

/// The sync bar's message. Port of apps/mobile/src/ui/SyncBar.tsx.
public struct SyncBarMessage: Equatable, Sendable {
    public enum Tone: Sendable { case good, working, attention, problem }

    public var text: String
    public var tone: Tone
    /// Tapping it opens Settings.
    public var accessibilityLabel: String { "Sync status: \(text)" }
}

/// What the bar says, or nil when everything is fine (the bar is hidden then). The first match
/// wins, in the Expo app's order.
public func syncBarMessage(_ s: SyncStatus, now: Date = Date()) -> SyncBarMessage? {
    let healthy =
        s.problems == 0 && !s.storageLow && s.lastSyncedAt != nil && s.pending == 0 && s.uploadsWaiting == 0
        && (s.phase == .idle || s.phase == .syncing)
    if healthy { return nil }

    let files = filesText(s.uploadsWaiting, allPhotos: s.uploadsAllPhotos)
    if s.problems > 0 {
        return .init(text: "\(changes(s.problems)) could not be saved · tap for details", tone: .problem)
    }
    if s.storageLow {
        return .init(text: "Phone storage almost full · free up space so new work saves", tone: .problem)
    }
    switch s.phase {
    case .syncing:
        return .init(text: "Syncing…", tone: .working)
    case .offline:
        let waiting = [s.pending > 0 ? changes(s.pending) : nil, s.uploadsWaiting > 0 ? files : nil].compactMap { $0 }
        return .init(
            text: waiting.isEmpty
                ? "Offline · working from this phone" : "Offline · \(waiting.joined(separator: ", ")) on this phone",
            tone: .attention)
    case .signedOut:
        return .init(text: "Sign in again to sync", tone: .attention)
    case .readOnly:
        return .init(
            text: "Read-only: the shop’s Sundeck Pro subscription isn’t paid. \(changes(s.pending)) kept on this phone",
            tone: .attention)
    case .error:
        return .init(text: "Sync failed · will retry", tone: .problem)
    case .idle:
        break
    }
    if s.pending > 0 { return .init(text: "\(changes(s.pending)) waiting to sync", tone: .attention) }
    if s.uploadsWaiting > 0 { return .init(text: "\(files) waiting to upload", tone: .attention) }
    guard let last = s.lastSyncedAt else { return .init(text: "Not synced yet", tone: .attention) }
    return .init(text: "All changes saved to the office · \(ago(last, now))", tone: .good)
}

// MARK: - The "waiting to sync" note's delay

/// How long changes and files wait, without a break, before the bar says so (owner, 2026-10-20:
/// "The 'needs to sync' button should only appear after like 5-10 seconds. Not a good look when
/// it happens instantly and lasts for milliseconds"). It goes away as soon as nothing waits.
/// Offline, problems, a full phone and signing in again still show at once; More › Sync always
/// shows the real state. Port of apps/mobile/src/lib/syncNote.ts.
public let syncNoteDelay: TimeInterval = 8

private func waiting(_ s: SyncStatus) -> Bool { s.pending > 0 || s.uploadsWaiting > 0 }

/// When the current wait started: kept from `previous` while something waits, set to `now`
/// when it starts, nil when nothing waits.
public func waitingSince(_ s: SyncStatus, previous: Date?, now: Date) -> Date? {
    guard waiting(s) else { return nil }
    return previous ?? now
}

/// The status the sync bar shows at `now`: waiting changes and files are left out until they
/// have waited `syncNoteDelay`.
public func syncBarStatus(_ s: SyncStatus, now: Date) -> SyncStatus {
    guard let since = s.waitingSince, now.timeIntervalSince(since) < syncNoteDelay else { return s }
    var held = s
    held.pending = 0
    held.uploadsWaiting = 0
    return held
}

/// When the bar should look again, or nil when nothing is held back.
public func syncNoteDueAt(_ s: SyncStatus, now: Date) -> Date? {
    guard let since = s.waitingSince else { return nil }
    let due = since.addingTimeInterval(syncNoteDelay)
    return due > now ? due : nil
}

private func changes(_ n: Int) -> String { n == 1 ? "1 change" : "\(n) changes" }

private func filesText(_ n: Int, allPhotos: Bool) -> String {
    let photos = n == 1 ? "1 photo" : "\(n) photos"
    return allPhotos ? photos : n == 1 ? "1 photo and recording" : "\(n) photos and recordings"
}

private func ago(_ date: Date, _ now: Date) -> String {
    let seconds = (now.timeIntervalSince(date)).rounded()
    if seconds < 60 { return "just now" }
    if seconds < 3600 { return "\(Int((seconds / 60).rounded())) min ago" }
    return "\(Int((seconds / 3600).rounded())) h ago"
}
