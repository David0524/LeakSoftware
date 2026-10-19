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
