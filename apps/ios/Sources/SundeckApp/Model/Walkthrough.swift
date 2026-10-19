import Foundation
import Observation
import SundeckCore

/// The welcome cards and the one-time tips: which this phone has seen. Port of
/// apps/mobile/src/state/walkthrough.ts (same keys, so S9 carries them over).
@MainActor @Observable
public final class Walkthrough {
    public private(set) var seen: [String]
    public private(set) var launchSeen: Bool
    @ObservationIgnored private let kv: KeyValue

    public init(_ kv: KeyValue) {
        self.kv = kv
        seen = seenTips(kv.getJSON(KVKey.tipsSeen, as: JSONValue.self))
        launchSeen = kv.get(KVKey.launchSeen) == "1"
    }

    /// The tip for a screen, if there is one this person hasn't closed.
    public func tip(screen: String, company: CompanyContext, pkg: TipPackage? = nil) -> Tip? {
        tipFor(platform: .app, screen: screen, role: company.role, services: company.services, seen: seen, pkg: pkg)
    }

    public func dismiss(_ id: String) {
        guard !seen.contains(id) else { return }
        seen.append(id)
        kv.setJSON(KVKey.tipsSeen, seen)
    }

    /// The welcome cards were shown (closing them any way counts).
    public func finishLaunch() {
        launchSeen = true
        kv.set(KVKey.launchSeen, "1")
    }

    /// Settings › Show Tips Again.
    public func reset() {
        seen = []
        launchSeen = false
        kv.remove(KVKey.tipsSeen)
        kv.remove(KVKey.launchSeen)
    }

    /// After sign-out cleared the keys.
    public func reload() {
        seen = seenTips(kv.getJSON(KVKey.tipsSeen, as: JSONValue.self))
        launchSeen = kv.get(KVKey.launchSeen) == "1"
    }
}
