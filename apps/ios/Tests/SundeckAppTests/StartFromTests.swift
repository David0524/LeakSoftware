import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// Start My Day From (owner, 2026-10-21; docs/design/2026-10-21-start-from-home.md): saved to
/// member_start through the sync layer, a new address clearing its map point and asking
/// /api/locate, and every route for that person starting at home once it's on the map.
@MainActor @Suite struct StartFromTests {
    let sync: SyncService
    let queue: LocateQueue

    init() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("start-\(UUID()).db").path
        let database = try Database(path: path, key: String(repeating: "7a", count: 32))
        let kv = try KeyValue(database)
        sync = SyncService(
            store: try LocalStore.open(database), kv: kv, transport: FakeTransport(), auth: FakeAuth())
        queue = LocateQueue(kv: kv)
    }

    @Test func savesThroughTheSyncLayerAndAsksForTheMapPoint() throws {
        // The shop, unchanged: nothing written.
        let before = try sync.store.pendingCount()
        try StartFromWrites.save(sync, companyId: "c1", userId: "u1", StartFromForm(), locate: queue)
        #expect(try sync.store.pendingCount() == before)
        #expect(memberStart(sync.store, companyId: "c1", userId: "u1") == nil)

        // Home with an address: a new row (UUIDv7, the person's user_id), and a lookup queued.
        try StartFromWrites.save(
            sync, companyId: "c1", userId: "u1", StartFromForm(from: .home, address: " 4 Elm St, Phoenix, AZ "),
            locate: queue)
        #expect(try sync.store.pendingCount() == before + 1)
        var row = try #require(memberStart(sync.store, companyId: "c1", userId: "u1"))
        #expect(row.startFrom == "home" && row.homeAddress == "4 Elm St, Phoenix, AZ" && row.homeLatitude == nil)
        #expect(queue.pending == [LocateRequest(companyId: "c1", propertyId: nil, homeUserId: "u1")])
        #expect(
            queue.pending[0].body == ["company_id": .string("c1"), "home_user_id": .string("u1")])
        // Until it's found, the day starts at the shop and the setting says so.
        let pending = StartFromStatus(StartFromForm(row), saved: row, userId: "u1")
        #expect(pending.pending == StartFromCopy.pending && !pending.notOnMap)

        // The website found it.
        let id = try #require(row.id)
        try sync.store.write(
            "member_start", id: id, companyId: "c1",
            ["home_latitude": 33.69, "home_longitude": -112.0, "home_geocoded_address": "4 Elm St, Phoenix, AZ"])
        row = try #require(memberStart(sync.store, companyId: "c1", userId: "u1"))
        #expect(StartFromStatus(StartFromForm(row), saved: row, userId: "u1").pending == nil)
        #expect(startFor("u1", [row], shop: LatLng(lat: 33.4, lng: -111.8)).label == .home)

        // A new address clears the old point in the same write.
        try StartFromWrites.save(
            sync, companyId: "c1", userId: "u1", StartFromForm(from: .home, address: "9 Oak Ave, Mesa, AZ"),
            locate: queue)
        row = try #require(memberStart(sync.store, companyId: "c1", userId: "u1"))
        #expect(row.homeLatitude == nil && row.homeLongitude == nil && row.homeGeocodedAddress == nil)
        #expect(homeMapStatus(row) == .missing)

        // Not found: the warning shows with the pending line.
        let tried = MemberStart(
            userId: "u1", startFrom: "home", homeAddress: "9 Oak Ave, Mesa, AZ",
            homeGeocodedAddress: "9 Oak Ave, Mesa, AZ")
        #expect(StartFromStatus(StartFromForm(tried), saved: tried, userId: "u1").notOnMap)

        // Back to the shop: only start_from changes, the address stays.
        try StartFromWrites.save(
            sync, companyId: "c1", userId: "u1", StartFromForm(from: .shop, address: "9 Oak Ave, Mesa, AZ"),
            locate: queue)
        row = try #require(memberStart(sync.store, companyId: "c1", userId: "u1"))
        #expect(row.startFrom == "shop" && row.homeAddress == "9 Oak Ave, Mesa, AZ")
    }
}
