import Foundation
import SundeckCore
import SundeckLiveStop
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
            ChecklistModel.tallyText(t, jobType: .detection)
                == "3 not leaking · 1 attention · 2 leaking · 4 not applicable · 5 to do")
        #expect(
            ChecklistModel.tallyText(t, jobType: .repair)
                == "3 not leaking · 1 attention · 2 leaking · 4 not applicable · 5 to do")
        #expect(
            ChecklistModel.tallyText(t, jobType: .maintenance) == "3 done · 1 need attention · 4 skipped · 5 to do")
    }

    @Test func sectionsComeInTheFixedOrderWithItemsByType() throws {
        try setUp(property: try property(spa: true))
        // Sections come in the website's order; a service item added by hand lists last.
        let skim = try #require(config.componentTypes.first { $0.key == "svc_skim" })
        try InspectionWrites.addComponent(
            sync, companyId: Self.company, jobId: Self.job, type: skim, existing: inspection.components)
        let m = model(property: try property(spa: true))
        #expect(m.sections.map(\.section) == [.visual, .plumbing, .bondBeam, .service])
        #expect(m.sections.map(\.title) == ["Visual Leak Inspection", "Plumbing Static Test", "Bond Beam", "Service"])
        let plumbing = try #require(m.sections.first { $0.section == .plumbing })
        #expect(plumbing.items.map(\.component.label) == ["Returns 1", "Returns 2", "Spa jets"])
        // "+ Add" only on the last of a type that repeats.
        #expect(plumbing.items.map(\.addsAnother) == [false, true, false])
        #expect(m.tallyText == "0 not leaking · 0 attention · 0 leaking · 0 not applicable · 7 to do")
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

    @Test func anyItemCanBeRemovedAndACleaningSaysItStaysDue() throws {
        try setUp(property: try property())
        let m = model(property: try property())
        #expect(m.canEdit)
        // Not only items that repeat: a single item has Remove too (owner, 2026-10-19).
        let beam = try row("Bond beam")
        #expect(!beam.type.allowsMultiple && !beam.fromPlan)
        #expect(
            beam.removeConfirm
                == RemoveItemConfirm(
                    title: "Remove Bond beam from the checklist?", message: nil, confirm: "Remove Item"))
        try InspectionWrites.setVerdict(
            sync, companyId: Self.company, jobId: Self.job, componentId: beam.component.id, existing: beam.result,
            verdict: .ok, userId: Self.me)
        let answered = try row("Bond beam")
        let before = sync.revision
        try InspectionWrites.removeComponent(
            sync, companyId: Self.company, component: answered.component, result: answered.result)
        #expect(sync.revision == before + 1)
        #expect(!inspection.components.contains { $0.label == "Bond beam" })
        let results = try sync.store.list("checklist_item_result", jobId: Self.job, includeDeleted: true)
        #expect(results.first { $0.id == answered.result?.id }?["deleted_at"]?.string != nil)

        // Edit opens every section; otherwise a section follows the person's choice.
        let section = try #require(m.sections.first)
        #expect(section.isOpen(folded: true, editing: true))
        #expect(!section.isOpen(folded: true, editing: false) && section.isOpen(folded: false, editing: false))
        #expect(section.isOpen(folded: nil, editing: false) == section.startsOpen)

        // An item a plan's cleaning put on says it goes on the next visit.
        var cleaning = beam
        cleaning.component.planCleaningId = "pc1"
        #expect(cleaning.fromPlan)
        #expect(cleaning.removeConfirm.message == "It’s still due, so it goes on the next visit.")
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

    // MARK: - Section blocks (the website's checklist)

    func tap(_ label: String, _ verdict: Verdict?) throws {
        let item = try row(label)
        try InspectionWrites.setVerdict(
            sync, companyId: Self.company, jobId: Self.job, componentId: item.component.id, existing: item.result,
            verdict: verdict, userId: Self.me)
    }

    func section(_ s: ChecklistSection) throws -> ChecklistSectionRows {
        try #require(model(property: nil).sections.first { $0.section == s })
    }

    @Test func sectionSummariesSayWhatIsLeftOrTheWorstNews() throws {
        try setUp(property: try property())
        var plumbing = try section(.plumbing)
        #expect(plumbing.summary == "2 of 2 to do" && plumbing.summaryTone == .muted && plumbing.startsOpen)
        #expect(plumbing.markRemainingTitle == "Mark 2 Remaining Not Leaking")
        try tap("Returns 1", .ok)
        try tap("Returns 2", .ok)
        plumbing = try section(.plumbing)
        #expect(plumbing.summary == "All clear" && plumbing.summaryTone == .pass && !plumbing.startsOpen)
        #expect(plumbing.markRemainingTitle == nil)
        // Attention alone is the warning color (spec decision 10), leaking wins.
        try tap("Returns 1", .attention)
        #expect(try section(.plumbing).summary == "1 attention")
        #expect(try section(.plumbing).summaryTone == .warning)
        try tap("Returns 2", .leaking)
        #expect(try section(.plumbing).summary == "1 leaking · 1 attention")
        #expect(try section(.plumbing).summaryTone == .fail)
        // Yes/no items are answered No.
        #expect(try section(.visual).markRemainingTitle == "Mark 2 Remaining Not Leaking")
        try tap("Equipment area", .ok)
        #expect(try section(.visual).markRemainingTitle == "Answer 1 Remaining No")
    }

    @Test func theServiceChecklistSaysAllDoneOrNeedsAttention() throws {
        try setUp(.maintenance, property: try property())
        func service() throws -> ChecklistSectionRows {
            try #require(model(.maintenance, property: nil).sections.first)
        }
        #expect(try service().markRemainingTitle == "Mark 1 Remaining Done")
        let skim = try #require(try service().items.first)
        try InspectionWrites.setVerdict(
            sync, companyId: Self.company, jobId: Self.job, componentId: skim.component.id, existing: skim.result,
            verdict: .ok, userId: Self.me)
        #expect(try service().summary == "All done")
        let done = try #require(try service().items.first)
        try InspectionWrites.setVerdict(
            sync, companyId: Self.company, jobId: Self.job, componentId: done.component.id, existing: done.result,
            verdict: .attention, userId: Self.me)
        #expect(try service().summary == "1 needs attention")
        #expect(try service().summaryTone == .warning)
        #expect(try #require(try service().items.first).subline(photos: 0) == "Needs Attention")
    }

    @Test func markRemainingAnswersEveryItemLeftInOneBatch() throws {
        try setUp(property: try property())
        try tap("Returns 1", .leaking)
        let plumbing = try section(.plumbing)
        let before = sync.revision
        try InspectionWrites.markRemaining(
            sync, companyId: Self.company, jobId: Self.job, items: plumbing.items, userId: Self.me)
        #expect(sync.revision == before + 1)
        #expect(try result("Returns 1")["outcome"] == "leaking")
        let r = try result("Returns 2")
        #expect(r["status"] == "inspected" && r["outcome"] == "ok" && r["inspected_by"] == .string(Self.me))
        #expect(try section(.plumbing).toDo.isEmpty)
    }

    // MARK: - One-handed use (owner, 2026-10-20)

    @Test func markRemainingCanBeUndone() throws {
        try setUp(property: try property())
        try tap("Returns 1", .leaking)
        let ids = try InspectionWrites.markRemaining(
            sync, companyId: Self.company, jobId: Self.job, items: try section(.plumbing).items, userId: Self.me)
        // Returns 2 and any other item still to do; never the one already answered.
        let answered = try result("Returns 1").id
        #expect(!ids.isEmpty && !ids.contains(answered))
        let undo = MarkedUndo(resultIds: ids)
        #expect(undo.text == "Marked \(ids.count)")
        let before = sync.revision
        try undo.undo(sync, companyId: Self.company)
        #expect(sync.revision == before + 1)  // one batch
        #expect(try result("Returns 2")["status"] == "pending")
        #expect(try result("Returns 1")["outcome"] == "leaking")
        #expect(try section(.plumbing).toDo.count == ids.count)
    }

    @Test func undoKeepsAnItemAnsweredAgainMeanwhile() throws {
        try setUp(property: try property())
        let ids = try InspectionWrites.markRemaining(
            sync, companyId: Self.company, jobId: Self.job, items: try section(.plumbing).items, userId: Self.me)
        // Within the 5 seconds the tech changes Returns 2 to Leaking, with where.
        try tap("Returns 2", .leaking)
        let item = try row("Returns 2")
        try InspectionWrites.saveWhere(
            sync, companyId: Self.company, jobId: Self.job, componentId: item.component.id, result: item.result,
            draft: "at the elbow")
        let undo = MarkedUndo(resultIds: ids)
        try undo.undo(sync, companyId: Self.company)
        #expect(try result("Returns 2")["outcome"] == "leaking")
        #expect(try result("Returns 2")["location_text"] == "at the elbow")
        #expect(try result("Returns 1")["status"] == "pending")
        // Tapped twice: nothing more is written.
        let pending = try sync.store.pendingCount()
        try undo.undo(sync, companyId: Self.company)
        #expect(try sync.store.pendingCount() == pending)
    }

    @Test func theItemPageSavesAnAnswerChangedThereWhenLeft() throws {
        // Next Item (or back) after choosing an answer: the answer must not be lost.
        try setUp(property: try property())
        let item = try row("Returns 1")
        let form = ComponentForm(
            companyId: Self.company, jobId: Self.job, component: item.component, type: item.type, result: item.result)
        #expect(!form.isDirty)
        #expect(try !form.saveChanges(sync, userId: Self.me))
        form.verdict = .leaking
        #expect(form.isDirty)
        #expect(try form.saveChanges(sync, userId: Self.me))
        #expect(try result("Returns 1")["outcome"] == "leaking")
        #expect(!form.isDirty)
    }

    @Test func notesSavedByThemselvesNeverUndoAnAnswerChangedElsewhere() throws {
        try setUp(property: try property())
        let item = try row("Returns 1")
        let form = ComponentForm(
            companyId: Self.company, jobId: Self.job, component: item.component, type: item.type, result: item.result)
        // The page is open; the answer changes elsewhere (the checklist, another phone).
        try tap("Returns 1", .leaking)
        form.notes = "Dye pulled in"
        try form.saveChanges(sync, userId: Self.me)
        var r = try result("Returns 1")
        #expect(r["outcome"] == "leaking" && r["notes"] == "Dye pulled in")
        // When the page hears of the change, it shows it and keeps what was typed.
        form.notes = "Dye pulled in hard"
        form.refresh(try row("Returns 1").result)
        #expect(form.verdict == .leaking && form.notes == "Dye pulled in hard" && form.isDirty)
        try form.saveChanges(sync, userId: Self.me)
        r = try result("Returns 1")
        #expect(r["outcome"] == "leaking" && r["notes"] == "Dye pulled in hard")
    }

    @Test func whereTypedAgainAfterItWasClearedSaves() throws {
        // Where "deck" saved; Not Leaking clears it; Leaking again and "deck" typed again.
        try setUp(property: try property())
        let item = try row("Returns 1")
        let form = ComponentForm(
            companyId: Self.company, jobId: Self.job, component: item.component, type: item.type, result: item.result)
        form.verdict = .leaking
        form.location = "deck"
        try form.saveChanges(sync, userId: Self.me)
        try tap("Returns 1", .ok)
        form.refresh(try row("Returns 1").result)
        #expect(form.verdict == .ok && form.location == "")
        form.verdict = .leaking
        form.location = "deck"
        try form.saveChanges(sync, userId: Self.me)
        let r = try result("Returns 1")
        #expect(r["outcome"] == "leaking" && r["location_text"] == "deck")
    }

    @Test func tappingTheChosenAnswerAgainClearsIt() throws {
        try setUp(property: try property())
        #expect(try row("Returns 1").verdictAfterTap(.leaking) == .leaking)
        try tap("Returns 1", .leaking)
        let item = try row("Returns 1")
        #expect(item.verdictAfterTap(.leaking) == nil)
        #expect(item.verdictAfterTap(.ok) == .ok)
        #expect(item.options.map(\.label) == ["Not Leaking", "Leaking", "Attention", "N/A"])
    }

    @Test func theItemPageKnowsThePreviousAndNextItem() throws {
        try setUp(property: try property())
        let m = model(property: nil)
        let ids = m.itemIds
        #expect(ids.count > 2)
        #expect(m.neighbors(of: ids[0]).previous == nil && m.neighbors(of: ids[0]).next == ids[1])
        #expect(m.neighbors(of: ids[1]).previous == ids[0] && m.neighbors(of: ids[1]).next == ids[2])
        #expect(m.neighbors(of: ids[ids.count - 1]).next == nil)
        #expect(m.neighbors(of: "nope").previous == nil && m.neighbors(of: "nope").next == nil)
    }

    @Test func addOptionsOfferAnotherOfRepeatingTypesThenMissingOnes() throws {
        try setUp(property: try property(spa: false, poolType: "gunite_plaster"))
        let options = model(property: try property(spa: true)).addOptions
        #expect(options.map(\.label) == ["Another Returns", "If vinyl, is vinyl stretched?", "Spa jets"])
    }

    @Test func theItemLineShowsPhotosMethodAndNotesAndTheVerdictPillItsWord() throws {
        try setUp(property: try property())
        let item = try row("Returns 1")
        #expect(item.verdictLabel == "To Do")
        #expect(item.subline(photos: 0) == nil)
        try InspectionWrites.saveChecklistResult(
            sync, companyId: Self.company, jobId: Self.job, componentId: item.component.id, existing: item.result,
            ["method": "Visual", "notes": "Dye test clean"])
        try tap("Returns 1", .na)
        try InspectionWrites.saveChecklistResult(
            sync, companyId: Self.company, jobId: Self.job, componentId: item.component.id,
            existing: try row("Returns 1").result, ["exclusion_reason": "Covered by deck"])
        let after = try row("Returns 1")
        #expect(after.verdictLabel == "N/A")
        #expect(after.subline(photos: 2) == "2 photos · Visual · Dye test clean")
        #expect(after.subline(photos: 1) == "1 photo · Visual · Dye test clean")
        #expect(after.exclusionText == "Covered by deck")
    }

    @Test func theItemScreenSavesMethodAndAnExclusionReasonOnlyForNA() throws {
        try setUp(property: try property())
        let item = try row("Returns 1")
        let form = ComponentForm(
            companyId: Self.company, jobId: Self.job, component: item.component, type: item.type, result: item.result)
        #expect(form.methodChoices == ["", "Visual"])
        form.verdict = .na
        #expect(form.asksExclusion)
        form.method = "Visual"
        form.exclusionReason = "Covered by deck"
        try form.save(sync, userId: Self.me)
        var r = try result("Returns 1")
        #expect(r["method"] == "Visual" && r["exclusion_reason"] == "Covered by deck")
        form.result = try row("Returns 1").result
        form.verdict = .ok
        try form.save(sync, userId: Self.me)
        r = try result("Returns 1")
        #expect(r["exclusion_reason"] == .null && r["method"] == "Visual")
    }
}

/// Filter and salt cell cleanings on a visit (owner, 2026-10-19), from the visit's own checklist
/// items (`job_component.plan_cleaning_id`); phones don't sync `plan_cleaning`.
@MainActor @Suite struct VisitCleaningTests {
    @Test func cleaningsOnTheChecklistShowWithTheirIconAndToday() throws {
        let shell = try Shell()
        try shell.seedCompany(userId: "u1")
        func type(_ id: String, _ key: String, _ name: String) -> PulledRow {
            PulledRow(
                table: "component_type", xid: "1",
                row: [
                    "id": .string(id), "company_id": "c1", "key": .string(key), "name": .string(name),
                    "section": "service", "answer": "done", "job_type": "maintenance", "applies_to": "both",
                    "on_schedule": false, "allows_multiple": false, "default_count": 1, "methods": [],
                    "sort_order": 500, "active": true,
                ])
        }
        func item(_ id: String, _ typeId: String, _ label: String, cleaning: JSONValue, sort: Int) -> PulledRow {
            PulledRow(
                table: "job_component", xid: "1",
                row: [
                    "id": .string(id), "company_id": "c1", "job_id": "v1", "component_type_id": .string(typeId),
                    "instance_number": 1, "label": .string(label), "sort_order": .number(Double(sort)),
                    "plan_cleaning_id": cleaning,
                ])
        }
        try shell.sync.store.applyPage(
            PullPage(
                rows: [
                    type("t1", "svc_filter_clean", "Clean filter"), type("t2", "svc_salt_clean", "Clean salt cell"),
                    type("t3", "svc_skim", "Skim surface"), type("t4", "svc_tile", "Brush tile"),
                    PulledRow(
                        table: "job", xid: "1",
                        row: ["id": "v1", "company_id": "c1", "type": "maintenance", "status": "scheduled"]),
                    item("c1", "t1", "Clean filter", cleaning: "pc1", sort: 1),
                    item("c2", "t2", "Clean salt cell", cleaning: "pc2", sort: 2),
                    item("c3", "t3", "Skim surface", cleaning: .null, sort: 3),
                    item("c4", "t4", "Brush tile", cleaning: "pc3", sort: 4),
                ], done: true, cursor: [:], serverHLC: "1800000000000-0000-server"))
        let found = visitCleanings(
            JobInspection(shell.sync.store, jobId: "v1"), InspectionConfig(shell.sync.store, companyId: "c1"),
            day: "2026-10-19")
        #expect(found.map(\.name) == ["Clean filter", "Clean salt cell", "Brush tile"])
        #expect(found.map(\.kind) == [.filter, .saltCell, .other])
        #expect(found.allSatisfy { $0.due.label == "Due today" && $0.due.soon })
        // Today: just the icon and how soon; VoiceOver reads the name (owner, 2026-10-19).
        #expect(found.map(CleaningText.short) == ["Today", "Today", "Today"])
        #expect(
            found.map(CleaningText.spoken) == [
                "Clean filter due today", "Clean salt cell due today", "Brush tile due today",
            ])
        #expect(!found.contains(where: CleaningText.isOverdue))
        var late = found[0]
        late.due = try #require(cleaningCountdown("2026-10-12", "2026-10-19"))
        #expect(CleaningText.isOverdue(late) && CleaningText.short(late) == "Overdue")
        #expect(CleaningText.spoken(late) == "Clean filter overdue")
        #expect(CleaningText.accessSpoken("Gate code 4417") == "Access: Gate code 4417")
        #expect(CleaningText.title == "Regular cleanings")
        #expect(CleaningText.onVisit == "On this visit’s checklist" && CleaningText.today == "Today")
        // A visit with no cleanings on its checklist shows none.
        #expect(
            visitCleanings(
                JobInspection(shell.sync.store, jobId: "nope"), InspectionConfig(shell.sync.store, companyId: "c1"),
                day: "2026-10-19"
            ).isEmpty)
    }

    /// Plan cleanings sync to phones (owner, 2026-10-19): Today's pills, the visit's Regular
    /// cleanings and the customer's Maintenance lines read them as the website does.
    @Test func planCleaningsShowOnTodayTheVisitAndTheCustomer() throws {
        let shell = try Shell()
        try shell.seedCompany(userId: "u1")
        func type(_ id: String, _ key: String, _ name: String, sort: Int) -> PulledRow {
            PulledRow(
                table: "component_type", xid: "1",
                row: [
                    "id": .string(id), "company_id": "c1", "key": .string(key), "name": .string(name),
                    "section": "service", "answer": "done", "job_type": "maintenance", "applies_to": "both",
                    "on_schedule": true, "allows_multiple": false, "default_count": 1, "methods": [],
                    "sort_order": .number(Double(sort)), "active": true,
                ])
        }
        func cleaning(
            _ id: String, _ typeId: String, months: Int, due: String, last: JSONValue = .null,
            price: JSONValue = .null
        ) -> PulledRow {
            PulledRow(
                table: "plan_cleaning", xid: "1",
                row: [
                    "id": .string(id), "company_id": "c1", "service_plan_id": "sp1",
                    "component_type_id": .string(typeId), "every_months": .number(Double(months)),
                    "next_due": .string(due), "last_done_on": last, "price_cents": price,
                ])
        }
        try shell.sync.store.applyPage(
            PullPage(
                rows: [
                    type("t1", "svc_filter_clean", "Clean filter", sort: 540),
                    type("t2", "svc_salt_clean", "Clean salt cell", sort: 545),
                    type("t3", "svc_filter_replace", "Replace filter", sort: 547),
                    cleaning("pc1", "t1", months: 3, due: "2026-10-19", price: 4000),
                    cleaning("pc2", "t2", months: 6, due: "2026-10-23"),
                    cleaning("pc3", "t3", months: 12, due: "2026-11-30", last: "2026-02-19"),
                    PulledRow(
                        table: "job", xid: "1",
                        row: [
                            "id": "v1", "company_id": "c1", "type": "maintenance", "status": "scheduled",
                            "service_plan_id": "sp1", "plan_date": "2026-10-19",
                        ]),
                    PulledRow(
                        table: "job_component", xid: "1",
                        row: [
                            "id": "jc1", "company_id": "c1", "job_id": "v1", "component_type_id": "t1",
                            "instance_number": 1, "label": "Clean filter", "sort_order": 1, "plan_cleaning_id": "pc1",
                        ]),
                ], done: true, cursor: [:], serverHLC: "1800000000000-0000-server"))
        let store = shell.sync.store
        let rows = planCleanings(store, companyId: "c1", planIds: ["sp1"])
        #expect(rows.map(\.name) == ["Clean filter", "Clean salt cell", "Replace filter"])
        #expect(rows.map(\.kind) == [.filter, .saltCell, .filterReplace])

        // Today: only the cleanings on the visit's checklist, just the icon and how soon.
        let today = stopCleanings(rows, onVisit: ["pc1"], visitDay: "2026-10-19")
        #expect(today.map(CleaningText.short) == ["Today"])
        #expect(today.map(CleaningText.spoken) == ["Clean filter due today"])
        #expect(stopCleanings(rows, onVisit: [], visitDay: "2026-10-19").isEmpty)
        // Schedule: the checklist's plan cleanings, by visit.
        let scheduled = scheduledCleanings(store, companyId: "c1", jobIds: ["v1", "other"])
        #expect(scheduled == ["v1": [ScheduledCleaning(name: "Clean filter", kind: .filter)]])

        // The visit's Regular cleanings: on this visit, or cadence and next; a replace filter's age.
        let job = try #require(try store.get("job", "v1"))
        let box = visitRegularCleanings(
            store, companyId: "c1", job: job, JobInspection(store, jobId: "v1"),
            InspectionConfig(store, companyId: "c1"), day: "2026-10-19")
        #expect(
            box.map(\.detail) == [
                "On this visit’s checklist", "Every 6 months · next Fri, Oct 23",
                "Every year · next Mon, Nov 30 · Filter 8 months old",
            ])
        #expect(box.map(\.value) == ["Today", "Due in 4 days", "In 6 weeks"])
        #expect(box.map(\.soon) == [true, true, false])

        // Customer › Maintenance: summary, countdown, the day, and the filter's age.
        let lines = rows.map { PlanCleaningLine($0, today: "2026-10-19") }
        #expect(
            lines.map(\.text) == [
                "Clean filter every 3 months · $40.00 each · Due today",
                "Clean salt cell every 6 months · Due in 4 days (Fri, Oct 23)",
                "Replace filter every year · In 6 weeks (Mon, Nov 30) · Filter 8 months old",
            ])
        #expect(lines.map(\.soon) == [true, true, false])
        let plans = customerPlans(
            [
                [
                    "id": "sp1", "property_id": "p1", "customer_id": "cu1", "starts_on": "2026-10-19",
                    "interval_weeks": 1, "weekdays": nil, "monthly": false, "visit_time": nil, "duration_minutes": 30,
                    "price_cents": nil, "ends_on": nil, "paused": false, "notes": nil,
                ]
            ], propertyId: "p1", jobs: [], names: [:], today: "2026-10-19", cleanings: rows)
        #expect(plans.first?.cleanings.map(\.id) == ["pc1", "pc2", "pc3"])

        // Before a plan's cleanings reach the phone, the checklist's stand in.
        let bare = regularCleanings(
            fromChecklist: [
                VisitCleaning(
                    id: "x", name: "Clean filter", kind: .filter,
                    due: CleaningCountdown(days: 0, weeks: 0, soon: true, label: "Due today"))
            ])
        #expect(bare.map(\.detail) == ["On this visit’s checklist"] && bare.map(\.value) == ["Today"])
    }

    @Test func theIconsDrawTheWebsitesPaths() {
        #expect(CleaningGlyph.of(.filter).rects == [[6, 3, 12, 18, 3]])
        #expect(CleaningGlyph.of(.saltCell).rects == [[2.5, 8, 19, 8, 4]])
        #expect(CleaningGlyph.of(.filterReplace).rects == [[9, 6, 10, 15, 2.5]])
        for kind in [CleaningKind.filter, .filterReplace, .saltCell, .other] {
            for d in CleaningGlyph.of(kind).paths {
                let commands = svgCommands(d)
                #expect(commands.count >= 4, "\(kind) \(d)")
            }
        }
        // The salt cell's spark ends at (11, 15); the repeat arrows are arcs, read as curves.
        #expect(svgCommands("m13 9.5-2.5 3h3L11 15").last == .line(SVGPoint(11, 15)))
        #expect(svgCommands(CleaningGlyph.of(.other).paths[0]).contains { if case .curve = $0 { true } else { false } })
    }

}
