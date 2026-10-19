import Foundation
import SundeckCore
import SundeckSync
import SundeckSyncPostgres
import Testing

/// The M4 sample inspection, offline on one phone and intact on another, built with the Swift
/// rules (planComponents, normalizeTestData, calculate). Port of
/// packages/sync/test/integration/inspection.test.ts.
@Suite(.serialized, .enabled(if: databaseAvailable))
struct InspectionIntegrationTests {
    static let fixture = CompanyFixture()

    @Test func isRecordedOfflineOnOnePhoneAndArrivesIntactOnAnother() async throws {
        let co = try await Self.fixture.get()
        let a = try device("inspA", co.tech)
        let b = try device("inspB", co.owner)
        _ = await a.engine.sync()
        _ = await b.engine.sync()

        let types = try a.store.list("component_type").map { try JSONValue.object($0).decode(ComponentType.self) }
        let testTypes = try a.store.list("test_type").map { try JSONValue.object($0).decode(TestType.self) }
        let typeByKey = Dictionary(types.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        let testByKey = Dictionary(testTypes.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        let now = { JSONValue.string(isoTimestamp(milliseconds: Date().timeIntervalSince1970 * 1000)) }

        // ---- Offline from here ----
        a.transport.offline = true
        let customer = try a.store.insert("customer", companyId: co.id, ["name": "Sample Customer"])
        let property = try a.store.insert(
            "property", companyId: co.id,
            [
                "customer_id": .string(customer), "address_line1": "9 Sample Way", "has_spa": true,
                "diagram_shape": "kidney",
            ])
        let job = try a.store.insert(
            "job", companyId: co.id,
            [
                "property_id": .string(property), "bill_to_customer_id": .string(customer), "status": "in_progress",
                "started_at": now(),
            ])

        // Checklist: the defaults (one of each item), then a second skimmer and three more
        // returns: 2 skimmers, 4 returns.
        let flagsJSON: JSONValue = ["address_line1": "", "has_pool": true, "has_spa": true]
        let flags = try flagsJSON.decode(Property.self)
        var planned = planComponents(types, flags)
        let extra: [(String, Int, String, Int)] = [
            ("skimmer", 2, "Skimmer 2", 1002), ("return", 2, "Return 2", 2002), ("return", 3, "Return 3", 2003),
            ("return", 4, "Return 4", 2004),
        ]
        for (key, instance, label, sort) in extra {
            let json: JSONValue = [
                "component_type_id": .string(typeByKey[key]!.id), "instance_number": .number(Double(instance)),
                "label": .string(label), "sort_order": .number(Double(sort)),
            ]
            planned.append(try json.decode(PlannedComponent.self))
        }
        var compIds: [String: String] = [:]
        var resultIds: [(label: String, id: String)] = []
        try a.store.database.transaction {
            for p in planned {
                let id = try a.store.insert(
                    "job_component", companyId: co.id,
                    [
                        "job_id": .string(job), "component_type_id": .string(p.componentTypeId),
                        "instance_number": .number(Double(p.instanceNumber)), "label": .string(p.label),
                        "sort_order": .number(Double(p.sortOrder)),
                    ])
                compIds[p.label] = id
                resultIds.append(
                    (
                        p.label,
                        try a.store.insert(
                            "checklist_item_result", companyId: co.id,
                            ["job_id": .string(job), "job_component_id": .string(id), "status": "pending"])
                    ))
            }
        }
        #expect(compIds.keys.filter { $0.wholeMatch(of: /Skimmer( \d+)?/) != nil }.count == 2)
        #expect(compIds.keys.filter { $0.wholeMatch(of: /Returns?( \d+)?/) != nil }.count == 4)
        #expect(compIds["Spa"] != nil)

        // Mark everything: main drain excluded with a reason, the rest inspected.
        for (label, rid) in resultIds {
            let excluded: Row = ["status": "excluded", "exclusion_reason": "No diver on site"]
            let method: JSONValue = label == "Structural cracks in pool" ? "Visual" : "Pressure test"
            let inspected: Row = ["status": "inspected", "method": method, "inspected_at": now()]
            try a.store.write(
                "checklist_item_result", id: rid, companyId: co.id, label == "Main drain" ? excluded : inspected)
        }

        // Tests: 5 pressure (Return 3 fails), 1 bucket, 2 dye.
        func addTest(_ key: String, _ label: String?, _ raw: [String: String], _ chosen: Outcome? = nil) throws
            -> String
        {
            let tt = testByKey[key]!
            let data = normalizeTestData(tt.fieldSchema, raw.mapValues { .string($0) })
            let calc = calculate(tt, data)
            let component: JSONValue = label.map { .string(compIds[$0]!) } ?? .null
            let outcome: Outcome = chosen ?? calc.suggested ?? .pass
            var row: Row = ["job_id": .string(job), "job_component_id": component, "test_type_id": .string(tt.id)]
            row["schema_version"] = .number(Double(tt.schemaVersion))
            row["data"] = try json(data)
            row["computed"] = try json(calc.computed)
            // Types without a calculator (dye, listening) use the outcome the tech picks.
            row["outcome"] = .string(outcome.rawValue)
            row["performed_at"] = now()
            return try a.store.insert("test_result", companyId: co.id, row)
        }
        for line in ["Skimmer", "Skimmer 2", "Returns", "Return 2"] {
            _ = try addTest(
                "pressure", line, ["line_name": line, "start_psi": "20", "end_psi": "20", "duration_min": "15"])
        }
        let failing = try addTest(
            "pressure", "Return 3",
            ["line_name": "Return 3", "start_psi": "20", "end_psi": "12", "duration_min": "15"])
        _ = try addTest(
            "bucket", nil,
            [
                "pool_start_in": "10", "pool_end_in": "9.25", "bucket_start_in": "10", "bucket_end_in": "9.94",
                "duration_hours": "24",
            ])
        _ = try addTest(
            "dye", "All light niches and conduits", ["location": "Light niche", "observation": "No draw"])
        _ = try addTest(
            "dye", "Return 3", ["location": "Return 3 fitting", "observation": "Dye drawn in (leak)"], .fail)

        // Findings with pins.
        let f1 = try a.store.insert(
            "finding", companyId: co.id,
            [
                "job_id": .string(job), "job_component_id": .string(compIds["Return 3"]!),
                "title": "Return 3 line break", "severity_key": "major", "pin_x": 0.42, "pin_y": 0.18,
                "status": "open",
            ])
        let f2 = try a.store.insert(
            "finding", companyId: co.id,
            [
                "job_id": .string(job), "job_component_id": .string(compIds["All light niches and conduits"]!),
                "title": "Light niche seal worn", "severity_key": "minor", "pin_x": 0.81, "pin_y": 0.66,
                "status": "monitor",
            ])

        let offline = await a.engine.sync()
        #expect(offline.error == "offline")
        #expect(offline.pending > 30)

        // ---- Back online ----
        a.transport.offline = false
        let online = await a.engine.sync()
        let problems = try a.store.problems()
        #expect(online.rejected == 0, "\(problems)")
        #expect(online.pending == 0)
        _ = await b.engine.sync()

        // Server and both phones agree on every inspection row.
        let tables: [(String, [String])] = [
            ("job_component", Array(compIds.values)), ("checklist_item_result", resultIds.map(\.id)),
            ("finding", [f1, f2]), ("test_result", [failing]),
        ]
        for (table, ids) in tables {
            for id in ids {
                let server = try await testDatabase!.serverRow(table, id)
                #expect(server != nil, "\(table) \(id) on server")
                #expect(try b.localRow(table, id) == server, "\(table) on phone B")
                #expect(try a.localRow(table, id) == server, "\(table) on phone A")
            }
        }

        // What the office will see.
        let comps = try b.store.list("job_component").filter { $0["job_id"] == .string(job) }
        let results = try b.store.list("checklist_item_result").filter { $0["job_id"] == .string(job) }
        #expect(results.count == comps.count)
        #expect(results.filter { $0["status"] == "inspected" }.count == comps.count - 1)
        #expect(results.filter { $0["status"] == "excluded" }.count == 1)
        let tests = try b.store.list("test_result").filter { $0["job_id"] == .string(job) }
        #expect(tests.count == 8)
        #expect(tests.filter { $0["outcome"] == "fail" }.count == 3)  // Return 3 pressure, bucket, Return 3 dye
        #expect(try b.store.get("test_result", failing)?["computed"]?["drop_psi"] == 8)
        let pins = try b.store.list("finding").filter { $0["job_id"] == .string(job) }.map {
            [$0["pin_x"] ?? .null, $0["pin_y"] ?? .null]
        }
        #expect(pins.contains([0.42, 0.18]))
        #expect(pins.contains([0.81, 0.66]))
    }

    @Test func anUnknownVerdictIsRefusedByTheServerNotLost() async throws {
        let co = try await Self.fixture.get()
        let a = try device("inspC", co.tech)
        _ = await a.engine.sync()
        let types = try a.store.list("component_type")
        let customer = try a.store.insert("customer", companyId: co.id, ["name": "Reasonless"])
        let property = try a.store.insert(
            "property", companyId: co.id, ["customer_id": .string(customer), "address_line1": "1 Rule St"])
        let job = try a.store.insert(
            "job", companyId: co.id, ["property_id": .string(property), "status": "in_progress"])
        let comp = try a.store.insert(
            "job_component", companyId: co.id,
            [
                "job_id": .string(job), "component_type_id": .string(types[0].id), "instance_number": 1,
                "label": "Test component",
            ])
        try a.store.insert(
            "checklist_item_result", companyId: co.id,
            ["job_id": .string(job), "job_component_id": .string(comp), "status": "inspected", "outcome": "maybe"])
        let s = await a.engine.sync()
        #expect(s.rejected == 1)
        let problem = try a.store.problems().first
        #expect(problem?.table == "checklist_item_result")
        #expect(problem?.error.contains("23514") == true)
    }
}

private func json<T: Encodable>(_ value: T) throws -> JSONValue {
    try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
}
