import Foundation
import Observation
import SundeckCore

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// Usage for the Admin portal (owner, 2026-10-22: screen time and how people use the app, per
/// person): the screen open and for how long, only while the app is in front, plus errors
/// people hit. Sent to the website's POST /api/usage every minute and when the app goes to the
/// background; kept for the next try without signal. Port of apps/mobile/src/data/usage.ts;
/// the rules are packages/core usage.ts.
@MainActor
public final class UsageRecorder {
    public struct Event: Equatable, Sendable {
        public var kind: String
        public var screen: String
        public var ms: Int
        public var detail: String?
        public var at: Date
        public var session: String
    }

    /// The app's one recorder.
    public static let shared = UsageRecorder(platform: "ios", version: appVersion())

    /// "1.4.0 (52)": the version and build, to see who runs an old one.
    public nonisolated static func appVersion(_ bundle: Bundle = .main) -> String {
        let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return build.map { "\(version) (\($0))" } ?? version
    }

    /// After this long away, the next use is a new session (core SESSION_GAP_MS).
    public static let sessionGap: TimeInterval = 30 * 60

    public let platform: String
    public let version: String
    private let now: () -> Date
    public private(set) var pending: [Event] = []
    private var screen: String?
    private var since: Date?
    private var sessionId = uuidv7()
    private var lastActive = Date.distantPast

    public init(platform: String, version: String, now: @escaping () -> Date = Date.init) {
        self.platform = platform
        self.version = version
        self.now = now
    }

    private func session(_ at: Date) -> String {
        if at.timeIntervalSince(lastActive) > Self.sessionGap { sessionId = uuidv7(now: at) }
        lastActive = at
        return sessionId
    }

    private func close(_ at: Date) {
        if let screen, let since {
            let ms = Int(at.timeIntervalSince(since) * 1000)
            if ms >= 500 {
                pending.append(Event(kind: "screen", screen: screen, ms: ms, detail: nil, at: at, session: session(at)))
            }
        }
        since = nil
    }

    /// The screen changed: its path in the website's words ("/jobs/:id", "/today").
    public func screenChanged(_ path: String, foreground: Bool = true) {
        let at = now()
        guard path != screen else { return }
        close(at)
        screen = path
        if foreground {
            since = at
            _ = session(at)
        }
    }

    /// The app went to the background or came back.
    public func foreground(_ active: Bool) {
        let at = now()
        if active {
            if screen != nil, since == nil { since = at }
            _ = session(at)
        } else {
            close(at)
        }
    }

    /// An error someone hit on the current screen.
    public func error(_ detail: String) {
        let at = now()
        pending.append(
            Event(
                kind: "error", screen: screen ?? "/", ms: 0, detail: String(detail.prefix(200)), at: at,
                session: session(at)))
    }

    /// The request's body: the platform, version, shop and up to 200 events.
    public func body(companyId: String?, events: ArraySlice<Event>) -> JSONValue {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var body: [String: JSONValue] = [
            "platform": .string(platform), "version": .string(version),
            "events": .array(
                events.map { e in
                    var o: [String: JSONValue] = [
                        "kind": .string(e.kind), "screen": .string(e.screen), "ms": .number(Double(e.ms)),
                        "at": .string(iso.string(from: e.at)), "session": .string(e.session),
                    ]
                    if let d = e.detail { o["detail"] = .string(d) }
                    return .object(o)
                }),
        ]
        if let companyId { body["company_id"] = .string(companyId) }
        return .object(body)
    }

    /// Sends what's waiting; what couldn't be sent stays (the most recent 1,000).
    public func flush(_ api: WebAPI, companyId: String?) async {
        guard !pending.isEmpty else { return }
        let batch = pending.prefix(200)
        do {
            _ = try await api.post("api/usage", body(companyId: companyId, events: batch))
            pending.removeFirst(batch.count)
        } catch let failure as WebAPI.Failure where !failure.tryAgainLater {
            // Refused for good (a 4xx other than sign-in): sending it again won't help.
            pending.removeFirst(batch.count)
        } catch {
            if pending.count > 1000 { pending.removeFirst(pending.count - 1000) }
        }
    }
}
