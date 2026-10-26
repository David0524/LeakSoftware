import Foundation
import SundeckCore
import SundeckSync

// Settings › Team › Profiles (owner, 2026-10-20: "owner/admin can add a technician profile for
// each tech/employee. It'll just have their basic info like name, phone, email, address,
// emergency contact, and any notes."): the synced `team_profile` rows, which only owners and
// admins read and write (techs never get them). One per team member (`user_id`), and Add Person
// keeps one for someone who doesn't use the app. Port of the website's settings/team page and
// `saveTeamProfile` in app/actions/settings.ts. (Not `TeamProfile`, the cached teammate names.)

/// A person's profile row.
public struct PersonProfile: Identifiable, Equatable, Sendable {
    public var id: String
    /// The team member it belongs to; nil for someone without the app.
    public var userId: String?
    public var name: String
    public var phone: String?
    public var email: String?
    public var address: String?
    public var emergencyName: String?
    public var emergencyPhone: String?
    public var notes: String?

    public init(_ row: Row) {
        func text(_ key: String) -> String? {
            guard let s = row[key]?.string, !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return nil
            }
            return s
        }
        id = row.id
        userId = text("user_id")
        name = row["name"]?.string ?? ""
        phone = text("phone")
        email = text("email")
        address = text("address")
        emergencyName = text("emergency_name")
        emergencyPhone = text("emergency_phone")
        notes = text("notes")
    }
}

/// One row of the Profiles group: a team member (with their profile, or "Add Details"), or a
/// person without the app ("No app").
public struct ProfileListRow: Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var detail: String?
    public var value: String?
    public var profile: PersonProfile?
    /// The team member a new profile is for.
    public var userId: String?
    /// What a new profile starts with: the member's name and email.
    public var memberName: String?
    public var memberEmail: String?
}

/// The Profiles group's words.
public enum ProfileText {
    public static let title = "Profiles"
    public static let footer =
        "Only owners and admins see these."
    public static let addDetails = "Add Details"
    public static let noApp = "No app"
    public static let addPerson = "Add Person"
    public static let addPersonHint =
        "For someone who works for you without using the app. Invite them above to give them the app."
    public static let emergency = "Emergency contact"
    public static let save = "Save"
    public static let saveNew = "Save Profile"
    public static let delete = "Delete Profile"
    public static let deleteConfirm = "Delete this profile? Their account and jobs stay."
}

/// The shop's profiles, not deleted.
public func personProfiles(_ store: LocalStore, companyId: String) -> [PersonProfile] {
    ((try? store.list("team_profile", companyId: companyId)) ?? []).map(PersonProfile.init)
}

/// The Profiles group: a row per team member (their profile's name and phone, or "Add Details"),
/// then everyone without the app by name, with "No app".
public func profileRows(_ profiles: [PersonProfile], team: [SettingsTeamMember]) -> [ProfileListRow] {
    var byUser: [String: PersonProfile] = [:]
    for p in profiles { if let user = p.userId, byUser[user] == nil { byUser[user] = p } }
    let members = team.map { m in
        let profile = byUser[m.userId]
        return ProfileListRow(
            id: "member-\(m.id)", title: profile?.name ?? m.name, detail: profile?.phone,
            value: profile == nil ? ProfileText.addDetails : nil, profile: profile, userId: m.userId,
            memberName: m.name, memberEmail: m.email)
    }
    let others =
        profiles
        .filter { $0.userId == nil }
        .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        .map { p in
            ProfileListRow(
                id: p.id, title: p.name,
                detail: [p.phone, ProfileText.noApp].compactMap { $0 }.joined(separator: " · "),
                value: nil, profile: p, userId: nil, memberName: nil, memberEmail: nil)
        }
    return members + others
}

/// A profile's form: Name, Phone, Email, Address, the emergency contact's name and phone, and
/// notes.
public struct PersonProfileForm: Equatable, Sendable {
    public var name = ""
    public var phone = ""
    public var email = ""
    public var address = ""
    public var emergencyName = ""
    public var emergencyPhone = ""
    public var notes = ""

    public init() {}

    /// A saved profile, or a new one with the member's name and email.
    public init(profile: PersonProfile?, name: String? = nil, email: String? = nil) {
        self.name = profile?.name ?? name ?? ""
        phone = profile?.phone ?? ""
        self.email = profile?.email ?? email ?? ""
        address = profile?.address ?? ""
        emergencyName = profile?.emergencyName ?? ""
        emergencyPhone = profile?.emergencyPhone ?? ""
        notes = profile?.notes ?? ""
    }

    /// The first field to fix, in the website's words.
    public var error: String? {
        if trim(name).isEmpty { return "Enter a name." }
        let e = trim(email)
        if !e.isEmpty, e.wholeMatch(of: /[^\s@]+@[^\s@]+\.[^\s@]+/) == nil {
            return "Enter an email like name@example.com."
        }
        return nil
    }

    /// The columns the phone writes; blanks are null.
    public var values: Row {
        func optional(_ s: String) -> JSONValue { trim(s).isEmpty ? .null : .string(trim(s)) }
        return [
            "name": .string(trim(name)), "phone": optional(phone), "email": optional(email),
            "address": optional(address), "emergency_name": optional(emergencyName),
            "emergency_phone": optional(emergencyPhone), "notes": optional(notes),
        ]
    }

    private func trim(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }
}

@MainActor
public enum ProfileWrites {
    /// Saves a profile through the sync layer: `id` updates it; otherwise a new one, for the team
    /// member `userId` or (nil) someone without the app. Returns what to say ("Saved.", "Added
    /// Maria.").
    @discardableResult
    public static func save(
        _ sync: SyncService, companyId: String, id: String?, userId: String?, _ form: PersonProfileForm
    ) throws -> String {
        if let id {
            try sync.write("team_profile", id: id, companyId: companyId, form.values)
            return "Saved."
        }
        var values = form.values
        if let userId { values["user_id"] = .string(userId) }
        _ = try sync.insert("team_profile", companyId: companyId, values)
        return "Added \(form.values["name"]?.string ?? form.name)."
    }

    /// Delete Profile: the profile goes; the person's account and jobs stay.
    public static func delete(_ sync: SyncService, id: String) throws { try sync.softDelete("team_profile", id) }
}
