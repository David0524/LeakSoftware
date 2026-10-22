import Foundation
import Observation
import SundeckCore

/// Whether Today's Getting Started card was hidden on this phone (kept on the account too, as on
/// the website). Port of useHidden in apps/mobile/src/features/today/GettingStarted.tsx (same key).
@MainActor @Observable
public final class Walkthrough {
    public private(set) var gettingStartedHidden: Bool
    @ObservationIgnored private let kv: KeyValue

    public init(_ kv: KeyValue) {
        self.kv = kv
        gettingStartedHidden = kv.get(KVKey.gettingStartedHidden) == "1"
    }

    /// Hides or brings back Getting Started on this phone.
    public func setGettingStartedHidden(_ hidden: Bool) {
        gettingStartedHidden = hidden
        if hidden { kv.set(KVKey.gettingStartedHidden, "1") } else { kv.remove(KVKey.gettingStartedHidden) }
    }

    /// After sign-out cleared the keys.
    public func reload() {
        gettingStartedHidden = kv.get(KVKey.gettingStartedHidden) == "1"
    }
}
