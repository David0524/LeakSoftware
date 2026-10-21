import Foundation
import SundeckCore
import SundeckSync

// Start My Day From (owner, 2026-10-21: "Techs/owners need to be able to set if they start their
// day from home or from the shop"; docs/design/2026-10-21-start-from-home.md). Set in More › My
// Profile for yourself, and by owners and admins on a person in Settings › Team. Kept in
// `member_start` (one row per person; none means the shop), which only the person and owners and
// admins get on their phones. Written through the sync layer; a new home address clears its old
// map point in the same write, and the website then looks it up (POST /api/locate with
// `home_user_id`), as a pool's address is.

/// The phone's member_start rows for the shop (those this person can read).
public func memberStarts(_ store: LocalStore, companyId: String) -> [MemberStart] {
    ((try? store.list("member_start", companyId: companyId)) ?? []).compactMap(decodeMemberStart)
}

func decodeMemberStart(_ row: Row) -> MemberStart? {
    guard row["user_id"]?.string != nil else { return nil }
    var row = row
    if row["start_from"]?.string == nil { row["start_from"] = "shop" }
    return try? JSONValue.object(row).decode(MemberStart.self)
}

/// One person's live member_start row (not deleted), or nil.
public func memberStart(_ store: LocalStore, companyId: String, userId: String) -> MemberStart? {
    memberStarts(store, companyId: companyId).first { $0.userId == userId && ($0.deletedAt ?? "").isEmpty }
}

/// The setting as edited: where the day starts, and the home address.
public struct StartFromForm: Equatable, Sendable {
    public var from: RouteStartLabel = .shop
    public var address = ""

    public init(from: RouteStartLabel = .shop, address: String = "") {
        self.from = from
        self.address = address
    }

    public init(_ row: MemberStart?) {
        from = row?.startFrom == "home" ? .home : .shop
        address = row?.homeAddress ?? ""
    }

    /// What the saved row would be with this form, the old map point kept only for the same
    /// address: what `homeMapStatus` reads.
    public func preview(_ saved: MemberStart?, userId: String) -> MemberStart {
        let same = homeLookupAddress(address) == homeLookupAddress(saved?.homeAddress)
        return MemberStart(
            userId: userId, startFrom: from.rawValue, homeAddress: address,
            homeLatitude: same ? saved?.homeLatitude : nil, homeLongitude: same ? saved?.homeLongitude : nil,
            homeGeocodedAddress: same ? saved?.homeGeocodedAddress : nil)
    }
}

/// What the setting shows under it while Home isn't on the map: the pending line, and the
/// not-on-map warning once the address was looked up and not found.
public struct StartFromStatus: Equatable, Sendable {
    /// `StartFromCopy.pending`, or nil when the day starts at the shop or home is on the map.
    public var pending: String?
    /// The address was tried and not found.
    public var notOnMap: Bool

    public init(_ form: StartFromForm, saved: MemberStart?, userId: String) {
        let row = form.preview(saved, userId: userId)
        let missing = homeMapStatus(row) == .missing
        pending = missing ? StartFromCopy.pending : nil
        let address = homeLookupAddress(row.homeAddress)
        notOnMap =
            missing && !address.isEmpty && row.homeLatitude == nil
            && row.homeGeocodedAddress.map(homeLookupAddress) == address
    }
}

@MainActor
public enum StartFromWrites {
    /// Saves the setting for `userId` through the sync layer: their row, or a new one. A changed
    /// address clears the old map point in the same write and queues the lookup. Nothing is
    /// written when nothing changed.
    public static func save(
        _ sync: SyncService, companyId: String, userId: String, _ form: StartFromForm, locate: LocateQueue?
    ) throws {
        let saved = memberStart(sync.store, companyId: companyId, userId: userId)
        let address = form.address.trimmingCharacters(in: .whitespacesAndNewlines)
        var values: Row = [:]
        if (saved?.startFrom ?? "shop") != form.from.rawValue { values["start_from"] = .string(form.from.rawValue) }
        let moved = homeLookupAddress(address) != homeLookupAddress(saved?.homeAddress)
        if moved {
            values["home_address"] = address.isEmpty ? .null : .string(address)
            values["home_latitude"] = .null
            values["home_longitude"] = .null
            values["home_geocoded_address"] = .null
        }
        guard !values.isEmpty else { return }
        if let id = saved?.id {
            try sync.write("member_start", id: id, companyId: companyId, values)
        } else {
            values["user_id"] = .string(userId)
            values["start_from"] = .string(form.from.rawValue)
            _ = try sync.insert("member_start", companyId: companyId, values)
        }
        if moved && !address.isEmpty {
            locate?.add(LocateRequest(companyId: companyId, propertyId: nil, homeUserId: userId))
        }
    }
}
