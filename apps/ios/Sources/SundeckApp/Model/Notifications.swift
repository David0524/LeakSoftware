import Foundation
import Observation
import SundeckCore
import SundeckLiveStop

// Notifications on the iPhone (owner, 2026-10-19; docs/plans/live-activities-and-notifications.md):
// the phone's push token on the server, what a tapped notification opens, and More ›
// Notifications. The website sends the pushes (Apple's service) and keeps each person's choices.

/// Where a tapped notification or a Live Activity link goes in the app.
public enum AppLink: Equatable, Sendable {
    case job(String)
    case conversation(String)
    /// A Live Activity button (owner, 2026-10-20): Today, on that stop, doing On My Way or Mark
    /// Complete there (with its Undo).
    case stop(String, LiveStopAction)
    /// The start-of-day notification (owner, 2026-10-22): the first stop's job from Today, or
    /// Today alone when that job is gone.
    case dayStart(String)

    /// From a push's custom data: `{"job": id}` or `{"conversation": id}` (website notify-events).
    public init?(push userInfo: [AnyHashable: Any]) {
        if userInfo["kind"] as? String == "day", let id = userInfo["job"] as? String, !id.isEmpty {
            self = .dayStart(id)
        } else if let id = userInfo["job"] as? String, !id.isEmpty {
            self = .job(id)
        } else if let id = userInfo["conversation"] as? String, !id.isEmpty {
            self = .conversation(id)
        } else {
            return nil
        }
    }

    /// From `sundeckpro://job/<id>` (the Live Activity's Open Job), or with an action after it.
    public init?(url: URL) {
        guard let id = LiveStopLink.jobId(url) else { return nil }
        if let action = LiveStopLink.action(url) {
            self = .stop(id, action)
        } else {
            self = .job(id)
        }
    }
}

/// An APNs device token as the hex the server stores.
public func pushTokenHex(_ token: Data) -> String { token.map { String(format: "%02x", $0) }.joined() }

/// Words for asking to send notifications (shown once, before iOS's own prompt).
public enum NotificationAskText {
    public static let title = "Turn On Notifications?"
    public static let message =
        "Sundeck Pro can tell you when a customer texts, a job is given to you or moved, a quote is accepted, a payment comes in, or a report is signed. Choose which in More › Notifications."
    public static let allow = "Turn On Notifications"
    public static let later = "Not Now"
}

/// This phone's push token on the server (POST and DELETE /api/push/devices). The token is kept
/// on the phone; it's sent again on the next launch when the phone was offline, or when someone
/// else signs in.
@MainActor
public final class PushRegistration {
    private let kv: KeyValue
    static let tokenKey = "push:token"
    static let registeredKey = "push:registered_for"
    static let askedKey = "push:asked"
    public static let app = "iPhone app"

    public init(kv: KeyValue) { self.kv = kv }

    public var token: String? { kv.get(Self.tokenKey) }

    /// Whether the short explanation before iOS's prompt was shown on this phone.
    public var asked: Bool {
        get { kv.get(Self.askedKey) == "1" }
        set { if newValue { kv.set(Self.askedKey, "1") } else { kv.remove(Self.askedKey) } }
    }

    /// iOS gave this phone a token: keep it, and file it for the signed-in person.
    public func received(_ token: Data, api: WebAPI, userId: String?) async {
        let hex = pushTokenHex(token)
        if kv.get(Self.tokenKey) != hex {
            kv.set(Self.tokenKey, hex)
            kv.remove(Self.registeredKey)
        }
        await registerIfNeeded(api: api, userId: userId)
    }

    /// Files the token for `userId` unless it already is (offline: tried again next launch).
    public func registerIfNeeded(api: WebAPI, userId: String?) async {
        guard let userId, let token, kv.get(Self.registeredKey) != userId else { return }
        let body: JSONValue = ["service": "apns", "token": .string(token), "app": .string(Self.app)]
        if (try? await api.post("api/push/devices", body)) != nil { kv.set(Self.registeredKey, userId) }
    }

    /// Signing out: this phone stops getting the person's notifications.
    public func unregister(api: WebAPI) async {
        defer { kv.remove(Self.registeredKey) }
        guard let token, kv.get(Self.registeredKey) != nil else { return }
        _ = try? await api.send("DELETE", "api/push/devices", ["service": "apns", "token": .string(token)])
    }
}

/// More › Notifications (website more/notifications): a switch per kind, on unless turned off,
/// read from GET /api/push/preferences and saved with PUT as each one changes.
@MainActor @Observable
public final class NotificationPrefsForm {
    public static let title = "Notifications"
    public static let rowDetail = "Texts, new jobs, quotes, payments, reports, and Live Activity"
    public static let systemOff = "Notifications are off for Sundeck Pro in the iPhone's Settings."
    public static let openSettings = "Open Settings"
    static let cacheKey = KVKey.notificationPrefs

    private let kv: KeyValue
    public private(set) var prefs: JSONValue
    public private(set) var loading = false
    public private(set) var error: String?

    public init(kv: KeyValue) {
        self.kv = kv
        prefs = kv.getJSON(Self.cacheKey, as: JSONValue.self) ?? [:]
    }

    public func isOn(_ kind: NotificationKind) -> Bool { notificationOn(prefs, kind) }

    /// More's row value: "On", "Some" or "Off".
    public static func summary(_ prefs: JSONValue?) -> String {
        let on = notificationKinds.map { notificationOn(prefs, $0.key) }
        return on.allSatisfy { $0 } ? "On" : on.contains(true) ? "Some" : "Off"
    }

    public var summary: String { Self.summary(prefs) }

    /// Whether the server's copy was read (More's row keeps the phone's copy otherwise).
    public private(set) var loaded = false

    public func load(_ api: WebAPI) async {
        loading = true
        defer { loading = false }
        do {
            let reply = try await api.get("api/push/preferences")
            if let p = reply["prefs"], case .object = p { remember(p) }
            loaded = true
        } catch {
            // Offline: the phone's copy shows; saving a change says if it can't go through.
        }
    }

    /// Turns a kind on or off, shown at once and saved; on failure it goes back and says why.
    public func set(_ kind: NotificationKind, _ on: Bool, api: WebAPI) async {
        await set(key: kind.rawValue, on, api: api)
    }

    /// The weekly summary email (owners and admins; owner, 2026-10-22): on for owners and off
    /// for admins until they choose.
    public func isWeeklyOn(role: String?) -> Bool { weeklySummaryOn(prefs, role: role) }

    public func setWeekly(_ on: Bool, api: WebAPI) async {
        await set(key: WeeklySummaryPref.key, on, api: api)
    }

    private func set(key: String, _ on: Bool, api: WebAPI) async {
        let before = prefs
        var next: [String: JSONValue] = [:]
        if case .object(let current) = prefs { next = current }
        next[key] = .bool(on)
        prefs = .object(next)
        do {
            let reply = try await api.send("PUT", "api/push/preferences", ["prefs": .object(next)])
            if let p = reply["prefs"], case .object = p { remember(p) } else { remember(.object(next)) }
            error = nil
        } catch {
            prefs = before
            self.error = userMessage(error)
        }
    }

    private func remember(_ p: JSONValue) {
        prefs = p
        kv.setJSON(Self.cacheKey, p)
    }

    /// The cached choices, for More's row before the screen loads them.
    public static func cached(_ kv: KeyValue) -> JSONValue? { kv.getJSON(cacheKey, as: JSONValue.self) }
}
