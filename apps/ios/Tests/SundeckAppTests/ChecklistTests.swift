import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// The Checklist tab and the checklist item screen, without SwiftUI. Port of the behavior of
/// apps/mobile/src/features/inspection/ChecklistTab.tsx and jobs/[id]/component/[componentId].tsx.
@MainActor @Suite struct ChecklistTests {
    static let company = "00000000-0000-4000-8000-0000000000c1"
    static let me = "00000000-0000-4000-8000-0000000000a1"
    static let job = "00000000-0000-4000-8000-000000000501"

    let sync: SyncService

    init() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("checklist-\(UUID()).db").path
        let database = try Database(path: path, key: String(repeating: "5e", count: 32))
        let store = try LocalStore.open(database)
        sync = SyncService(store: store, kv: try KeyValue(database), transport: FakeTransport(), auth: FakeAuth())
        try seedConfig()
    }

    /// Item and test types as the server sends them (fields from supabase/seed.sql).
    func seedConfig() throws {
        func componentType(
            _ n: Int, _ key: String, _ name: String, section: String, answer: String = "leak",
            jobType: JSONValue = .null, poolType: JSONValue = .null, multiple: Bool = false, count: Int = 1,
            appliesTo: String, sort: Int
        ) -> Row {
            [
                "id": .string("00000000-0000-4000-8000-00000000010\(n)"), "company_id": .string(Self.company),
                "deleted_at": nil, "key": .string(key), "name": .string(name), "section": .string(section),
                "answer": .string(answer), "job_type": jobType, "applies_to_pool_type": poolType,
                "on_schedule": false, "allows_multiple": .bool(multiple), "default_count": .number(Double(count)),
                "applies_to": .string(appliesTo), "methods": ["Visual"], "sort_order": .number(Double(sort)),
                "active": true,
            ]
        }
        let types = [
            // Listed out of order: the checklist sorts by section, then sort_order.
            componentType(
                3, "return", "Returns", section: "plumbing", multiple: true, count: 2, appliesTo: "pool", sort: 100),
            componentType(1, "equipment_area", "Equipment area", section: "visual", appliesTo: "both", sort: 10),
            componentType(
                2, "vinyl_stretched", "If vinyl, is vinyl stretched?", section: "visual", answer: "yes_no",
                poolType: "vinyl", appliesTo: "pool", sort: 40),
            componentType(4, "spa", "Spa jets", section: "plumbing", appliesTo: "spa", sort: 210),
            componentType(6, "bond_beam", "Bond beam", section: "bond_beam", appliesTo: "pool", sort: 300),
            componentType(
                5, "svc_skim", "Skim surface", section: "service", answer: "done", jobType: "maintenance",
                appliesTo: "both", sort: 500),
        ]
        let tests: [Row] = [
            [
                "id": "00000000-0000-4000-8000-000000000601", "company_id": .string(Self.company), "deleted_at": nil,
                "key": "pressure", "name": "Pressure Test", "field_schema": ["fields": []], "schema_version": 1,
                "calculator": "pressure_drop", "result_options": ["pass", "fail"], "sort_order": 10, "active": true,
            ]
        ]
        try sync.store.applyPage(
            PullPage(
                rows: types.map { PulledRow(table: "component_type", xid: "1", row: $0) }
                    + tests.map { PulledRow(table: "test_type", xid: "1", row: $0) },
                done: true, cursor: [:], serverHLC: "1800000000000-0000-server"))
    }

    func property(spa: Bool = false, poolType: JSONValue = .null) throws -> Property {
        let row: JSONValue = [
            "address_line1": "1 Main St", "has_pool": true, "has_spa": .bool(spa), "pool_type": poolType,
        ]
        return try row.decode(Property.self)
    }

    var config: InspectionConfig { InspectionConfig(sync.store, companyId: Self.company) }
    var inspection: JobInspection { JobInspection(sync.store, jobId: Self.job) }

    func model(_ jobType: JobType = .detection, property: Property?) -> ChecklistModel {
        ChecklistModel(config: config, inspection: inspection, jobType: jobType, property: property)
    }

    func setUp(_ jobType: JobType = .detection, property: Property? = nil) throws {
        try InspectionWrites.createChecklist(
            sync, companyId: Self.company, jobId: Self.job, types: config.componentTypes,
            property: ChecklistModel.planningProperty(property), jobType: jobType)
    }

    func row(_ label: String) throws -> ChecklistItemRow {
        try #require(model(property: nil).sections.flatMap(\.items).first { $0.component.label == label })
    }

    func result(_ label: String) throws -> Row {
        let component = try #require(inspection.components.first { $0.label == label })
        return try #require(
            try sync.store.list("checklist_item_result", jobId: Self.job).first {
                $0["job_component_id"] == .string(component.id)
            })
    }

    // MARK: - Set up

    @Test func setUpMakesTheLeakChecklistInOneBatch() throws {
        #expect(model(property: nil).isEmpty)
        let before = sync.revision
        try setUp(property: try property(spa: false, poolType: "gunite_plaster"))
        #expect(sync.revision == before + 1)
        let m = model(property: nil)
        #expect(!m.isEmpty)
        // No spa, not vinyl, no maintenance items; Returns starts with two.
        #expect(
            m.sections.flatMap(\.items).map(\.component.label) == [
                "Equipment area", "Returns 1", "Returns 2", "Bond beam",
            ])
        #expect(inspection.results.count == 4)
        #expect(inspection.results.allSatisfy { $0.status == .pending })
    }

    @Test func setUpWithoutTheAddressPlansAPoolWithoutASpa() throws {
        try setUp(property: nil)
        let labels = inspection.components.map(\.label)
        #expect(labels.contains("If vinyl, is vinyl stretched?"))
        #expect(!labels.contains("Spa jets"))
    }

    @Test func setUpMakesTheServiceChecklistForMaintenance() throws {
        try setUp(.maintenance, property: try property())
        let m = model(.maintenance, property: try property())
        #expect(m.sections.map(\.section) == [.service])
        let item = try #require(m.sections.first?.items.first)
        #expect(item.component.label == "Skim surface")
        #expect(item.isCheck && !item.isDone)
        // Leak items aren't offered on a visit.
        #expect(m.missing.isEmpty)
    }

    // MARK: - One-tap verdicts

    @Test func oneTapVerdictsWriteTheRightFields() throws {
        try setUp(property: try property())
        let returns = try row("Returns 1")
        #expect(returns.verdict == nil && !returns.needsWhere)
        #expect(returns.options.map(\.label) == ["Not Leaking", "Leaking", "Attention", "N/A"])

        func tap(_ label: String, _ verdict: Verdict?) throws {
            let item = try row(label)
            try InspectionWrites.setVerdict(
                sync, companyId: Self.company, jobId: Self.job, componentId: item.component.id, existing: item.result,
                verdict: verdict, userId: Self.me)
        }

        try tap("Returns 1", .leaking)
        var r = try result("Returns 1")
        #expect(r["status"] == "inspected" && r["outcome"] == "leaking" && r["inspected_by"] == .string(Self.me))
        #expect(try row("Returns 1").needsWhere)

        // "Where" saves on leaving the field, only when it changed.
        let before = sync.revision
        try InspectionWrites.saveWhere(
            sync, companyId: Self.company, jobId: Self.job, componentId: try row("Returns 1").component.id,
            result: try row("Returns 1").result, draft: "")
        #expect(sync.revision == before)
        try InspectionWrites.saveWhere(
            sync, companyId: Self.company, jobId: Self.job, componentId: try row("Returns 1").component.id,
            result: try row("Returns 1").result, draft: "  2 ft from skimmer ")
        #expect(try result("Returns 1")["location_text"] == "2 ft from skimmer")

        // Attention keeps where; Not Leaking, N/A and clearing remove it.
        try tap("Returns 1", .attention)
        #expect(try result("Returns 1")["location_text"] == "2 ft from skimmer")
        try tap("Returns 1", .ok)
        r = try result("Returns 1")
        #expect(r["outcome"] == "ok" && r["location_text"] == .null)

        try InspectionWrites.saveWhere(
            sync, companyId: Self.company, jobId: Self.job, componentId: try row("Returns 1").component.id,
            result: try row("Returns 1").result, draft: "valve")
        try tap("Returns 1", .na)
        r = try result("Returns 1")
        #expect(r["status"] == "excluded" && r["outcome"] == .null && r["location_text"] == .null)
        try tap("Returns 1", nil)
        r = try result("Returns 1")
        #expect(r["status"] == "pending" && r["inspected_at"] == .null && r["inspected_by"] == .null)

        // Yes/no items never ask where.
        try tap("If vinyl, is vinyl stretched?", .attention)
        let vinyl = try row("If vinyl, is vinyl stretched?")
        #expect(vinyl.verdict == .attention && !vinyl.needsWhere)
        #expect(vinyl.options.map(\.label) == ["No", "Yes", "N/A"])
    }

    @Test func theDoneCheckTogglesAMaintenanceItem() throws {
        try setUp(.maintenance, property: try property())
        func item() throws -> ChecklistItemRow {
            try #require(model(.maintenance, property: nil).sections.first?.items.first)
        }
        let skim = try item()
        try InspectionWrites.setVerdict(
            sync, companyId: Self.company, jobId: Self.job, componentId: skim.component.id, existing: skim.result,
            verdict: skim.isDone ? nil : .ok, userId: Self.me)
        #expect(try item().isDone)
        #expect(model(.maintenance, property: nil).tallyText == "1 done · 0 need attention · 0 skipped · 0 to do")
        let done = try item()
        try InspectionWrites.setVerdict(
            sync, companyId: Self.company, jobId: Self.job, componentId: done.component.id, existing: done.result,
            verdict: done.isDone ? nil : .ok, userId: Self.me)
        #expect(try !item().isDone)
    }

    // MARK: - Tally, sections, Add an item

    @Test func tallyTextUsesLeakOrMaintenanceWords() throws {
        let counts: JSONValue = ["pass": 3, "attention": 1, "leaking": 2, "notApplicable": 4, "pending": 5]
        let t = try counts.decode(ChecklistTally.self)
        #expect(
            ChecklistModel.tallyText(t, jobType: .detection) == "3 pass · 1 attention · 2 leaking · 4 N/A · 5 to do")
        #expect(ChecklistModel.tallyText(t, jobType: .repair) == "3 pass · 1 attention · 2 leaking · 4 N/A · 5 to do")
        #expect(
            ChecklistModel.tallyText(t, jobType: .maintenance) == "3 done · 1 need attention · 4 skipped · 5 to do")
    }

    @Test func sectionsComeInTheFixedOrderWithItemsByType() throws {
        try setUp(property: try property(spa: true))
        // A service item added by hand still lists first.
        let skim = try #require(config.componentTypes.first { $0.key == "svc_skim" })
        try InspectionWrites.addComponent(
            sync, companyId: Self.company, jobId: Self.job, type: skim, existing: inspection.components)
        let m = model(property: try property(spa: true))
        #expect(m.sections.map(\.section) == [.service, .visual, .plumbing, .bondBeam])
        #expect(m.sections.map(\.title) == ["Service", "Visual Leak Inspection", "Plumbing Static Test", "Bond Beam"])
        let plumbing = try #require(m.sections.first { $0.section == .plumbing })
        #expect(plumbing.items.map(\.component.label) == ["Returns 1", "Returns 2", "Spa jets"])
        // "+ Add" only on the last of a type that repeats.
        #expect(plumbing.items.map(\.addsAnother) == [false, true, false])
        #expect(m.tallyText == "0 pass · 0 attention · 0 leaking · 0 N/A · 7 to do")
    }

    @Test func addAnItemListsMissingTypesForThisJobAndPool() throws {
        try setUp(property: try property(spa: false, poolType: "gunite_plaster"))
        // Every applicable leak item is on the job; spa, vinyl and service items aren't offered.
        #expect(model(property: try property(spa: false, poolType: "gunite_plaster")).missing.isEmpty)
        // With a spa, the spa item is offered; vinyl checks need a vinyl (or unknown) pool.
        #expect(
            model(property: try property(spa: true)).missing.map(\.name) == [
                "If vinyl, is vinyl stretched?", "Spa jets",
            ])
        // Without the property on this phone, every leak item not on the job is offered.
        #expect(model(property: nil).missing.map(\.key) == ["vinyl_stretched", "spa"])
    }

    @Test func addingAndRemovingAnItemIsOneBatchOfSoftDeletes() throws {
        try setUp(property: try property())
        let returns = try #require(config.componentTypes.first { $0.key == "return" })
        var before = sync.revision
        try InspectionWrites.addComponent(
            sync, companyId: Self.company, jobId: Self.job, type: returns, existing: inspection.components)
        #expect(sync.revision == before + 1)
        let added = try row("Returns 3")
        #expect(added.result?.status == .pending)

        before = sync.revision
        try InspectionWrites.removeComponent(
            sync, companyId: Self.company, component: added.component, result: added.result)
        #expect(sync.revision == before + 1)
        #expect(!inspection.components.contains { $0.label == "Returns 3" })
        let all = try sync.store.list("job_component", jobId: Self.job, includeDeleted: true)
        let gone = try #require(all.first { $0.id == added.component.id })
        #expect(gone["deleted_at"]?.string != nil)
        let results = try sync.store.list("checklist_item_result", jobId: Self.job, includeDeleted: true)
        let goneResult = try #require(results.first { $0.id == added.result?.id })
        #expect(goneResult["deleted_at"]?.string != nil)
        // The next one added after a removal takes the next number.
        #expect(nextInstance(returns, inspection.components).label == "Returns 3")
        // Removing the only bond beam puts it back in "Add an item".
        let beam = try row("Bond beam")
        try InspectionWrites.removeComponent(
            sync, companyId: Self.company, component: beam.component, result: beam.result)
        #expect(model(property: try property()).missing.map(\.key).contains("bond_beam"))
    }

    // MARK: - The item's screen

    @Test func componentScreenSavesItsFormOnlyOnSave() throws {
        try setUp(property: try property())
        let item = try row("Returns 1")
        let form = ComponentForm(
            companyId: Self.company, jobId: Self.job, component: item.component, type: item.type, result: item.result)
        #expect(form.verdict == nil && form.location == "" && form.notes == "")
        #expect(form.options.map(\.label) == ["Not Leaking", "Leaking", "Attention", "N/A"])

        form.verdict = .leaking
        #expect(form.needsWhere)
        form.location = " at the elbow "
        form.notes = " Dye pulled in "
        // Nothing is written until Save.
        #expect(try result("Returns 1")["status"] == "pending")

        let before = sync.revision
        try form.save(sync, userId: Self.me)
        #expect(sync.revision == before + 1)
        var r = try result("Returns 1")
        #expect(r["status"] == "inspected" && r["outcome"] == "leaking")
        #expect(r["location_text"] == "at the elbow" && r["notes"] == "Dye pulled in")
        #expect(r["inspected_by"] == .string(Self.me))
        #expect(try sync.store.list("checklist_item_result", jobId: Self.job).count == 5)

        // Reopened, it shows what was saved; Not Leaking drops where, blank notes clear.
        let again = try row("Returns 1")
        let form2 = ComponentForm(
            companyId: Self.company, jobId: Self.job, component: again.component, type: again.type,
            result: again.result)
        #expect(form2.verdict == .leaking && form2.location == "at the elbow" && form2.notes == "Dye pulled in")
        form2.verdict = .ok
        #expect(!form2.needsWhere)
        form2.notes = "  "
        try form2.save(sync, userId: Self.me)
        r = try result("Returns 1")
        #expect(r["outcome"] == "ok" && r["location_text"] == .null && r["notes"] == .null)
    }

    @Test func componentScreenMakesAResultWhenTheItemHasNone() throws {
        let component = try sync.store.insert(
            "job_component", companyId: Self.company,
            [
                "job_id": .string(Self.job), "component_type_id": "00000000-0000-4000-8000-000000000101",
                "instance_number": 1, "label": "Equipment area", "sort_order": 1001,
            ])
        let jc = try #require(inspection.componentById[component])
        let type = try #require(config.componentTypeById[jc.componentTypeId])
        let form = ComponentForm(companyId: Self.company, jobId: Self.job, component: jc, type: type, result: nil)
        form.verdict = .na
        try form.save(sync, userId: Self.me)
        let r = try result("Equipment area")
        #expect(r["status"] == "excluded" && r["job_id"] == .string(Self.job))
    }
}
