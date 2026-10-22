import Foundation
import SundeckStorage

/// Small app settings kept in the phone's database (`app_kv`, the same table as the Expo app):
/// the remembered user, the chosen company, sync markers, team names. Port of
/// the KeyValue store in apps/mobile/src/lib/database.ts.
public final class KeyValue: Sendable {
    private let database: Database

    public init(_ database: Database) throws {
        self.database = database
        try database.execute("create table if not exists app_kv (key text primary key, value text not null)")
    }

    public func get(_ key: String) -> String? {
        guard
            case .text(let value)? = try? database.query("select value from app_kv where key = ?", [.text(key)])
                .first?["value"]
        else { return nil }
        return value
    }

    public func set(_ key: String, _ value: String) {
        _ = try? database.query(
            "insert or replace into app_kv (key, value) values (?, ?)", [.text(key), .text(value)])
    }

    public func remove(_ key: String) {
        _ = try? database.query("delete from app_kv where key = ?", [.text(key)])
    }

    public func getJSON<T: Decodable>(_ key: String, as type: T.Type = T.self) -> T? {
        get(key).flatMap { try? JSONDecoder().decode(T.self, from: Data($0.utf8)) }
    }

    public func setJSON<T: Encodable>(_ key: String, _ value: T) {
        if let data = try? JSONEncoder().encode(value) { set(key, String(decoding: data, as: UTF8.self)) }
    }
}

/// The keys, shared with the Expo app's names so S9 can carry them over.
public enum KVKey {
    public static let user = "session:user"
    public static let activeCompany = "active_company"
    public static let lastSyncedAt = "sync:last_synced_at"
    public static let initialSyncDone = "sync:initial_done"
    public static let teamProfiles = "team_profiles"
    public static let gettingStartedHidden = "walkthrough:getting_started_hidden"
    /// The signed-in person's notification choices (More › Notifications), and the stop the
    /// Live Activity is for.
    public static let notificationPrefs = "push:prefs"
    public static let liveStopTarget = "live_stop:target"
    /// The day the tech removed the Live Activity (kept only until the app next comes to the
    /// foreground), and when the current one began.
    public static let liveStopDismissed = "live_stop:dismissed_on"
    public static let liveStopStarted = "live_stop:started_at"

    /// Cleared when someone signs out (the device id and clock stay in the store).
    public static let signOutClears = [
        activeCompany, lastSyncedAt, initialSyncDone, teamProfiles, gettingStartedHidden,
        notificationPrefs, liveStopTarget, liveStopDismissed, liveStopStarted,
        // Search's Recent is the person's own (docs/plans/search-and-activity.md).
        searchRecent,
        // Reports waiting to send go with the person's work (ReportSendQueue, VisitReportQueue).
        "report_send:pending", "report_send:texts", "report_send:failures", "visit_report:pending",
    ]
}
