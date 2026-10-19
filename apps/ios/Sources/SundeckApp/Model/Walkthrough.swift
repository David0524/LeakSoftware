import Foundation
import Observation
import SundeckCore

/// The welcome cards and the one-time tips: which this phone has seen. Port of
/// apps/mobile/src/state/walkthrough.ts (same keys, so S9 carries them over).
@MainActor @Observable
public final class Walkthrough {
    public private(set) var seen: [String]
    public private(set) var launchSeen: Bool
    /// Today's Getting Started card was hidden (kept on the account too, as on the website).
    public private(set) var gettingStartedHidden: Bool
    @ObservationIgnored private let kv: KeyValue

    public init(_ kv: KeyValue) {
        self.kv = kv
        seen = seenTips(kv.getJSON(KVKey.tipsSeen, as: JSONValue.self))
        launchSeen = kv.get(KVKey.launchSeen) == "1"
        gettingStartedHidden = kv.get(KVKey.gettingStartedHidden) == "1"
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

    /// Hides or brings back Getting Started on this phone.
    public func setGettingStartedHidden(_ hidden: Bool) {
        gettingStartedHidden = hidden
        if hidden { kv.set(KVKey.gettingStartedHidden, "1") } else { kv.remove(KVKey.gettingStartedHidden) }
    }

    /// Settings › Show Tips Again (Getting Started comes back too, as on the website).
    public func reset() {
        seen = []
        launchSeen = false
        gettingStartedHidden = false
        kv.remove(KVKey.tipsSeen)
        kv.remove(KVKey.launchSeen)
        kv.remove(KVKey.gettingStartedHidden)
    }

    /// After sign-out cleared the keys.
    public func reload() {
        seen = seenTips(kv.getJSON(KVKey.tipsSeen, as: JSONValue.self))
        launchSeen = kv.get(KVKey.launchSeen) == "1"
        gettingStartedHidden = kv.get(KVKey.gettingStartedHidden) == "1"
    }
}
