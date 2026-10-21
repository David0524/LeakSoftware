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
                MapLookups.answered(kv, status: 200)
            } catch let failure as WebAPI.Failure where failure.offline {
                return
            } catch let failure as WebAPI.Failure {
                MapLookups.answered(kv, status: failure.status)
            } catch {}
            kv.setJSON(Self.key, pending.filter { $0 != request })
        }
    }
}

/// Pools on the day's stops that were never looked up on the map (owner, 2026-10-20: pools not
/// on the map): when Today or Schedule shows them, up to 10 at a time are asked for, each at most
/// once while the app runs, through the same queue as an address change (POST /api/locate, in
/// the background; offline, after the next sync). The pins come down with the sync after.
@MainActor
public enum MissingPins {
    private static var asked: Set<String> = []
    public static let batch = 10

    /// The pools to ask for now: on `jobs`, never looked up, not asked for yet; at most `batch`.
    public static func toAsk(_ jobs: [ScheduleJob]) -> [String] {
        var ids: [String] = []
        for j in jobs where j.needsLocate {
            guard let id = j.propertyId, !asked.contains(id), !ids.contains(id) else { continue }
            ids.append(id)
            if ids.count == batch { break }
        }
        return ids
    }

    /// Queues them and, when nothing is waiting to sync, asks the server now.
    public static func find(
        _ jobs: [ScheduleJob], companyId: String, queue: LocateQueue, api: WebAPI, sync: SyncService
    ) {
        // Lookups aren't set up on the server (it answered 503): nothing to ask.
        if sync.kv.get(MapLookups.key) == "off" { return }
        let ids = toAsk(jobs)
        guard !ids.isEmpty else { return }
        asked.formUnion(ids)
        for id in ids { queue.add(LocateRequest(companyId: companyId, propertyId: id)) }
        guard sync.status.pending == 0 else { return }  // the next sync's flush sends them
        Task {
            let waiting = queue.pending.count
            await queue.flush(api)
            if queue.pending.count < waiting { sync.syncSoon(2) }  // bring the new pins down
        }
    }

    /// Forgets what was asked (tests).
    public static func reset() { asked = [] }
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

// MARK: - Not found on the map (owner, 2026-10-20: "we need an indicator for when address
// doesn't register")

/// Whether the server looks addresses up (the website's `routingConfigured`, which the phone
/// can't see): on when the shop has a map location, or once /api/locate answered with anything
/// but 503 ("Address lookup isn't set up"). Until then the warnings stay hidden.
public enum MapLookups {
    static let key = "routing:lookups"

    /// Remembers what /api/locate said: 503 means lookups aren't set up.
    public static func answered(_ kv: KeyValue, status: Int) {
        guard status != 0 else { return }
        kv.set(key, status == 503 ? "off" : "on")
    }

    public static func on(_ kv: KeyValue, company: Row?) -> Bool {
        if kv.get(key) == "off" { return false }
        if company?["latitude"]?.number != nil && company?["longitude"]?.number != nil { return true }
        return kv.get(key) == "on"
    }

    /// For the signed-in shop.
    @MainActor
    public static func on(_ sync: SyncService, companyId: String?) -> Bool {
        on(sync.kv, company: companyId.flatMap { try? sync.store.get("company", $0) })
    }
}

/// `mapStatus` for a synced pool row: found, missing (an address with no map location for it),
/// or nil (no address, or lookups not set up).
public func propertyMapStatus(_ row: Row?, routing: Bool) -> MapStatus? {
    guard let row, let p = decodeProperty(row) else { return nil }
    return mapStatus(p, geocodedAddress: row["geocoded_address"]?.string, routing: routing)
}
