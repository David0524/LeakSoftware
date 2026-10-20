import Foundation
import SundeckCore
import SundeckSync

// Address changes find the map pin again (owner, 2026-10-19): when a pool's or the shop's
// address is edited on the phone, the old coordinates are cleared in the same write, and once
// the change has reached the server, POST /api/locate finds the pin (and so the drive times)
// for the new address. Offline, the request waits for the next sync.

/// The address columns of a property or the company row.
public let addressColumns = ["address_line1", "address_line2", "city", "state", "postal_code"]

/// `values` with the map location cleared when they change the address from `before`'s:
/// latitude, longitude and geocoded_address, and a pool's location_source. `moved` says whether.
public func clearingLocation(_ values: Row, before: Row?, shop: Bool = false) -> (values: Row, moved: Bool) {
    let norm = { (v: JSONValue?) -> String in (v?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
    let moved = addressColumns.contains { k in values[k] != nil && norm(values[k]) != norm(before?[k]) }
    guard moved else { return (values, false) }
    var out = values
    out["latitude"] = .null
    out["longitude"] = .null
    out["geocoded_address"] = .null
    if !shop { out["location_source"] = .null }
    return (out, true)
}

/// A pin to find: a pool (`propertyId`), or the shop.
public struct LocateRequest: Codable, Equatable, Sendable {
    public var companyId: String
    public var propertyId: String?

    public init(companyId: String, propertyId: String?) {
        self.companyId = companyId
        self.propertyId = propertyId
    }

    var body: JSONValue {
        propertyId.map { ["company_id": .string(companyId), "property_id": .string($0)] }
            ?? ["company_id": .string(companyId), "shop": true]
    }
}

/// The pins waiting to be found, kept on the phone until the server has looked.
@MainActor
public final class LocateQueue {
    private let kv: KeyValue
    static let key = "locate:pending"

    public init(kv: KeyValue) { self.kv = kv }

    public var pending: [LocateRequest] { kv.getJSON(Self.key, as: [LocateRequest].self) ?? [] }

    public func add(_ request: LocateRequest) {
        var list = pending.filter { $0 != request }
        list.append(request)
        kv.setJSON(Self.key, list)
    }

    /// Asks the server for each (after a sync has sent the new address). Offline ones wait; any
    /// other answer, found or not, is final.
    public func flush(_ api: WebAPI) async {
        for request in pending {
            do {
                _ = try await api.post("api/locate", request.body)
            } catch let failure as WebAPI.Failure where failure.offline {
                return
            } catch {}
            kv.setJSON(Self.key, pending.filter { $0 != request })
        }
    }
}

extension CustomerWrites {
    /// Saves Pool Details; a new address clears the old pin and queues finding the new one.
    @MainActor
    public static func savePool(
        _ sync: SyncService, companyId: String, propertyId: String, _ values: Row, locate: LocateQueue?
    ) throws {
        let before = try? sync.store.get("property", propertyId)
        let (row, moved) = clearingLocation(values, before: before)
        try sync.write("property", id: propertyId, companyId: companyId, row)
        if moved { locate?.add(LocateRequest(companyId: companyId, propertyId: propertyId)) }
    }
}
