import Foundation

/// A teammate's name. Profiles are per user, not synced rows, so the phone keeps the last list it
/// fetched (`team_profiles`) for offline use. Port of TeamProfile in sync-service.ts.
public struct TeamProfile: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var fullName: String?
    public var email: String?

    public init(id: String, fullName: String?, email: String?) {
        self.id = id
        self.fullName = fullName
        self.email = email
    }

    /// The name, else the email, else "Teammate".
    public var displayName: String {
        if let fullName, !fullName.trimmingCharacters(in: .whitespaces).isEmpty { return fullName }
        if let email, !email.isEmpty { return email }
        return "Teammate"
    }

    enum CodingKeys: String, CodingKey {
        case id, email
        case fullName = "full_name"
    }
}

extension KeyValue {
    /// The cached team.
    public var team: [TeamProfile] { getJSON(KVKey.teamProfiles, as: [TeamProfile].self) ?? [] }

    public func setTeam(_ profiles: [TeamProfile]) { setJSON(KVKey.teamProfiles, profiles) }
}
