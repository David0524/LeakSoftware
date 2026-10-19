import SundeckCore
import SundeckStorage
import Testing

@testable import SundeckSync

/// Port of packages/sync/test/nested-transaction.test.ts. The nesting lives in
/// `Database.transaction` (savepoints below the outer BEGIN); LocalStore writes run inside the
/// caller's transaction, for example "create customer, property, and job" as one unit.
@Suite struct NestedTransactionTests {
    let c = testCompany

    @Test func commitsNestedWorkTogether() throws {
        let store = try LocalStore.open(memoryDatabase())
        try store.database.transaction {
            try store.insert("customer", companyId: c, ["name": .string("a")])
            try store.insert("property", companyId: c, ["address_line1": .string("1 St")])
        }
        #expect(try store.pendingCount() == 2)
    }

    @Test func rollsBackEverythingWhenTheOuterUnitFails() throws {
        let store = try LocalStore.open(memoryDatabase())
        let error = #expect(throws: TestError.self) {
            try store.database.transaction {
                try store.insert("customer", companyId: c, ["name": .string("a")])
                throw TestError("boom")
            }
        }
        #expect(error?.description == "boom")
        #expect(try store.list("customer").isEmpty)
        #expect(try store.pendingCount() == 0)
    }

    @Test func anInnerFailureCaughtByTheCallerKeepsTheOuterWork() throws {
        let store = try LocalStore.open(memoryDatabase())
        try store.database.transaction {
            try store.insert("customer", companyId: c, ["name": .string("kept")])
            do {
                try store.database.transaction {
                    try store.insert("customer", companyId: c, ["name": .string("dropped")])
                    throw TestError("inner")
                }
            } catch {
                // ignored on purpose
            }
        }
        #expect(try store.list("customer").map { $0["name"] } == [.string("kept")])
    }

    @Test func clearAllRemovesDataButKeepsTheDeviceIdentity() throws {
        let store = try LocalStore.open(memoryDatabase(), deviceId: "keepme")
        try store.insert("customer", companyId: c, ["name": .string("a")])
        try store.clearAll()
        #expect(try store.list("customer", includeDeleted: true).isEmpty)
        #expect(try store.pendingCount() == 0)
        #expect(store.deviceId == "keepme")
    }
}
