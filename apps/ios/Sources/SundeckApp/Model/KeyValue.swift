import Foundation
import SundeckStorage

/// Small app settings kept in the phone's database (`app_kv`, the same table as the Expo app):
/// the remembered user, the chosen company, sync markers, team names, the tips seen. Port of
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
    public static let tipsSeen = "walkthrough:tips_seen"
    public static let launchSeen = "walkthrough:launch_seen"
    public static let gettingStartedHidden = "walkthrough:getting_started_hidden"
    /// The signed-in person's notification choices (More › Notifications), and the stop the
    /// Live Activity is for.
    public static let notificationPrefs = "push:prefs"
    public static let liveStopTarget = "live_stop:target"

    /// Cleared when someone signs out (the device id and clock stay in the store).
    public static let signOutClears = [
        activeCompany, lastSyncedAt, initialSyncDone, teamProfiles, tipsSeen, launchSeen, gettingStartedHidden,
        notificationPrefs, liveStopTarget,
    ]
}
