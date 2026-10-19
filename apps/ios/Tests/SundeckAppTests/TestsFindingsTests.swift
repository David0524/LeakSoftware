import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// S4: tests and findings (form state, what the tabs show, what's saved), the pool diagram's
// pins and outlines, and the shape picker.

private let hlc = "1760000000000-0000-srv"

@MainActor
private struct Inspection {
    let shell: Shell
    var sync: SyncService { shell.sync }
    var store: LocalStore { shell.sync.store }

    init() throws {
        shell = try Shell()
        try shell.seedCompany(userId: "u1")
        // The default test types and severities (supabase/migrations/…_company_setup.sql).
        let pressure: JSONValue = [
            "id": "tt-pressure", "company_id": "c1", "key": "pressure", "name": "Pressure test",
            "calculator": "pressure_drop", "sort_order": 10, "schema_version": 1, "active": true,
            "result_options": ["pass", "fail", "inconclusive"],
            "field_schema": [
                "fields": [
                    ["key": "line_name", "label": "Line", "type": "text", "required": true],
                    ["key": "start_psi", "label": "Start pressure", "type": "number", "unit": "PSI", "required": true],
                    ["key": "end_psi", "label": "End pressure", "type": "number", "unit": "PSI", "required": true],
                    ["key": "duration_min", "label": "Duration", "type": "number", "unit": "min", "required": true],
                ]
            ],
        ]
        let dye: JSONValue = [
            "id": "tt-dye", "company_id": "c1", "key": "dye", "name": "Dye test", "calculator": .null,
            "sort_order": 20, "schema_version": 1, "active": true, "result_options": ["pass", "fail", "inconclusive"],
            "field_schema": [
                "fields": [
                    ["key": "location", "label": "Location", "type": "text", "required": true],
                    [
                        "key": "observation", "label": "Result", "type": "select", "required": true,
                        "options": ["No draw", "Dye drawn in (leak)", "Inconclusive"],
                    ],
                    ["key": "notes", "label": "Notes", "type": "textarea"],
                ]
            ],
        ]
        let bucket: JSONValue = [
            "id": "tt-bucket", "company_id": "c1", "key": "bucket", "name": "Bucket / evaporation test",
            "calculator": "bucket_evaporation", "sort_order": 30, "schema_version": 1, "active": true,
            "result_options": ["pass", "fail", "inconclusive"],
            "field_schema": [
                "fields": [
                    [
                        "key": "pool_start_in", "label": "Pool level start", "type": "number", "unit": "in",
                        "required": true,
                    ],
                    [
                        "key": "pool_end_in", "label": "Pool level end", "type": "number", "unit": "in",
                        "required": true,
                    ],
                    [
                        "key": "bucket_start_in", "label": "Bucket level start", "type": "number", "unit": "in",
                        "required": true,
                    ],
                    [
                        "key": "bucket_end_in", "label": "Bucket level end", "type": "number", "unit": "in",
                        "required": true,
                    ],
                    ["key": "duration_hours", "label": "Duration", "type": "number", "unit": "h", "required": true],
                ]
            ],
        ]
        func severity(_ key: String, _ name: String, _ color: String, _ order: Int) -> JSONValue {
            [
                "id": .string("sev-\(key)"), "company_id": "c1", "key": .string(key), "name": .string(name),
                "color": .string(color), "must_mention": false, "sort_order": .number(Double(order)), "active": true,
            ]
        }
        let property: JSONValue = [
            "id": "p1", "company_id": "c1", "customer_id": "cu1", "address_line1": "1 Main St", "has_pool": true,
            "has_spa": true,
        ]
        let job: JSONValue = [
            "id": "j1", "company_id": "c1", "property_id": "p1", "type": "detection", "status": "scheduled",
        ]
        let component: JSONValue = [
            "id": "jc1", "company_id": "c1", "job_id": "j1", "component_type_id": "ct1", "instance_number": 3,
            "label": "Return 3", "sort_order": 301,
        ]
        let seeded: [(String, JSONValue)] = [
            ("test_type", pressure), ("test_type", dye), ("test_type", bucket),
            ("severity_level", severity("minor", "Minor", "#5B6B7A", 10)),
            ("severity_level", severity("major", "Major", "#C62F2B", 30)),
            ("property", property), ("job", job), ("job_component", component),
        ]
        var rows: [PulledRow] = []
        for (i, (table, row)) in seeded.enumerated() {
            guard case .object(let object) = row else { continue }
            rows.append(PulledRow(table: table, xid: String(i + 10), row: object))
        }
        try store.applyPage(PullPage(rows: rows, done: true, cursor: [:], serverHLC: hlc))
    }

    var config: InspectionConfig { InspectionConfig(store, companyId: "c1") }
    var insp: JobInspection { JobInspection(store, jobId: "j1") }
    func type(_ id: String) -> TestType { config.testTypeById[id]! }
}

@Suite @MainActor struct TestFormTests {
    @Test func theFormFollowsTheSchemaWithUnitsInLabelsAndRuns() throws {
        let s = try Inspection()
        let pressure = TestForm(type: s.type("tt-pressure"), existing: nil, componentId: nil, component: nil)
        #expect(pressure.groups.map { $0.map(\.key) } == [["line_name", "start_psi", "end_psi", "duration_min"]])
        #expect(!pressure.componentAlone)
        #expect(TestForm.label(s.type("tt-pressure").fieldSchema.fields[1]) == "Start pressure (PSI)")
        #expect(TestForm.label(s.type("tt-pressure").fieldSchema.fields[0]) == "Line")
        let dye = TestForm(type: s.type("tt-dye"), existing: nil, componentId: nil, component: nil)
        #expect(dye.groups.map { $0.map(\.key) } == [["location", "observation"], ["notes"]])
    }

    @Test func validationGivesInlineErrorsAndDataIsNormalized() throws {
        let s = try Inspection()
        var form = TestForm(type: s.type("tt-pressure"), existing: nil, componentId: nil, component: nil)
        let ok1 = form.validate()
        #expect(!ok1)
        #expect(form.errors["line_name"] == "Enter line.")
        #expect(form.errors["start_psi"] == "Enter start pressure.")
        form.values = ["line_name": "  Main drain ", "start_psi": "abc", "end_psi": "-2", "duration_min": "15"]
        let ok2 = form.validate()
        #expect(!ok2)
        #expect(form.errors == ["start_psi": "Enter a number.", "end_psi": "Can't be negative."])
        form.values["start_psi"] = " 20 "
        form.values["end_psi"] = "19.5"
        let ok3 = form.validate()
        #expect(ok3)
        #expect(
            form.normalizedData == [
                "line_name": .string("Main drain"), "start_psi": .number(20), "end_psi": .number(19.5),
                "duration_min": .number(15),
            ])

        var dye = TestForm(type: s.type("tt-dye"), existing: nil, componentId: nil, component: nil)
        dye.values = ["location": "Skimmer", "observation": "Maybe"]
        let ok4 = dye.validate()
        #expect(!ok4)
        #expect(dye.errors["observation"] == "Pick one of the options.")
    }

    @Test func aPressureTestSuggestsAnOutcomeUntilTheTechOverridesIt() throws {
        let s = try Inspection()
        var form = TestForm(type: s.type("tt-pressure"), existing: nil, componentId: nil, component: nil)
        #expect(form.calculation.summary == nil)
        #expect(form.outcome == nil)
        form.values = ["line_name": "Return 1", "start_psi": "20", "end_psi": "12", "duration_min": "15"]
        #expect(form.calculation.summary == "Dropped 8 PSI in 15 min")
        #expect(form.suggestedText == "Suggested: fail")
        #expect(form.outcome == .fail)
        #expect(!form.changedSuggestion)
        form.chosenOutcome = .pass
        #expect(form.outcome == .pass)
        #expect(form.changedSuggestion)
        form.values["end_psi"] = "20"
        #expect(form.calculation.summary == "Held at 20 PSI in 15 min")
        #expect(!form.changedSuggestion)
    }

    @Test func aBucketTestCalculatesTheLossBeyondEvaporation() throws {
        let s = try Inspection()
        var form = TestForm(type: s.type("tt-bucket"), existing: nil, componentId: nil, component: nil)
        form.values = [
            "pool_start_in": "10", "pool_end_in": "9", "bucket_start_in": "10", "bucket_end_in": "9.75",
            "duration_hours": "24",
        ]
        #expect(form.calculation.summary == "0.75 in lost beyond evaporation over 24 h (0.75 in/day)")
        #expect(form.suggestedText == "Suggested: fail")
        #expect(Outcome.inconclusive.label == "Unclear")
    }

    @Test func aNewTestFromAComponentNamesTheLineAndSavesWithPerformedAt() throws {
        let s = try Inspection()
        let component = s.insp.componentById["jc1"]
        var form = TestForm(type: s.type("tt-pressure"), existing: nil, componentId: "jc1", component: component)
        #expect(form.values["line_name"] == "Return 3")
        #expect(form.componentId == "jc1")
        #expect(form.discardTitle == "Discard this test?")
        #expect(!form.isDirty)
        form.values.merge(["start_psi": "20", "end_psi": "20", "duration_min": "15"]) { $1 }
        form.notes = "  Held fine  "
        #expect(form.isDirty)
        let saved1 = try form.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        let id = try #require(saved1)
        let row = try #require(try s.store.get("test_result", id))
        #expect(row["job_id"] == "j1")
        #expect(row["test_type_id"] == "tt-pressure")
        #expect(row["job_component_id"] == "jc1")
        #expect(row["outcome"] == "pass")
        #expect(row["notes"] == "Held fine")
        #expect(row["data"]?["start_psi"] == .number(20))
        #expect(row["computed"]?["drop_psi"] == .number(0))
        #expect(row["performed_at"]?.string != nil)

        let rows = testRows(s.insp, s.config)
        #expect(
            rows == [
                TestRowItem(
                    id: id, title: "Pressure test · Return 3", detail: "Held at 20 PSI in 15 min", outcome: .pass)
            ])
    }

    @Test func anInvalidFormSavesNothing() throws {
        let s = try Inspection()
        var form = TestForm(type: s.type("tt-pressure"), existing: nil, componentId: nil, component: nil)
        let saved8 = try form.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        #expect(saved8 == nil)
        #expect(try s.store.list("test_result").isEmpty)
    }

    @Test func editingATestKeepsItsTimeAndTypeAndRewritesTheRest() throws {
        let s = try Inspection()
        var first = TestForm(type: s.type("tt-dye"), existing: nil, componentId: nil, component: nil)
        first.values = ["location": "Skimmer", "observation": "No draw"]
        first.chosenOutcome = .pass
        let saved2 = try first.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        let id = try #require(saved2)
        let performedAt = try s.store.get("test_result", id)?["performed_at"]
        #expect(testRows(s.insp, s.config).first?.title == "Dye test · Skimmer")
        #expect(testRows(s.insp, s.config).first?.detail == "No draw")

        let existing = try #require(s.insp.tests.first)
        var form = TestForm(type: s.type("tt-dye"), existing: existing, componentId: nil, component: nil)
        #expect(form.values == ["location": "Skimmer", "observation": "No draw", "notes": ""])
        #expect(form.chosenOutcome == .pass)
        #expect(form.discardTitle == "Discard your changes?")
        form.values["observation"] = "Dye drawn in (leak)"
        form.chosenOutcome = .fail
        form.componentId = "jc1"
        let saved9 = try form.save(s.sync, companyId: "c1", jobId: "j1", existing: existing)
        #expect(saved9 == id)
        let row = try #require(try s.store.get("test_result", id))
        #expect(row["performed_at"] == performedAt)
        #expect(row["outcome"] == "fail")
        #expect(row["job_component_id"] == "jc1")
        #expect(row["data"]?["observation"] == "Dye drawn in (leak)")
        #expect(row["notes"] == .null)
        #expect(s.insp.tests.count == 1)
    }

    @Test func deletingATestTakesItOffTheTab() throws {
        let s = try Inspection()
        var form = TestForm(type: s.type("tt-dye"), existing: nil, componentId: nil, component: nil)
        form.values = ["location": "Light niche", "observation": "No draw"]
        let saved3 = try form.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        let id = try #require(saved3)
        try InspectionWrites.delete(s.sync, table: "test_result", id: id, companyId: "c1")
        #expect(s.insp.tests.isEmpty)
        #expect(testRows(s.insp, s.config).isEmpty)
        #expect(try s.store.get("test_result", id)?["deleted_at"]?.string != nil)
    }
}

@Suite @MainActor struct FindingFormTests {
    @Test func aFindingNeedsATitleAndASeverity() throws {
        let s = try Inspection()
        var form = FindingForm(existing: nil, componentId: nil)
        #expect(form.severity == "")
        let ok5 = form.validate()
        #expect(!ok5)
        #expect(form.errors["title"] == "Describe the finding, like \"Return 3 line break\".")
        #expect(form.errors["severity_key"] == "Pick a severity.")
        let saved10 = try form.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        #expect(saved10 == nil)
        #expect(try s.store.list("finding").isEmpty)
    }

    @Test func aNewFindingSavesWithARoundedPin() throws {
        let s = try Inspection()
        var form = FindingForm(existing: nil, componentId: "jc1")
        #expect(form.navigationTitle == "New Finding")
        #expect(!form.showsStatus)
        #expect(form.pinHint == "Tap where the leak is.")
        form.title = "  Return 3 line break "
        form.severity = "major"
        form.location = " Deep end "
        form.place(x: 0.123456, y: 1.4)
        #expect(form.pin == DiagramPoint(x: 0.1235, y: 1))
        #expect(form.pinHint == "Tap again to move the pin.")
        let saved4 = try form.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        let id = try #require(saved4)
        let row = try #require(try s.store.get("finding", id))
        #expect(row["title"] == "Return 3 line break")
        #expect(row["severity_key"] == "major")
        #expect(row["location_text"] == "Deep end")
        #expect(row["job_component_id"] == "jc1")
        #expect(row["pin_x"] == .number(0.1235))
        #expect(row["pin_y"] == .number(1))
        #expect(row["status"] == "open")
        #expect(row["notes"] == .null)

        #expect(
            findingRows(s.insp, s.config) == [
                FindingRowItem(
                    id: id, number: 1, title: "Return 3 line break", subtitle: "Major · Return 3 · Deep end",
                    color: "#C62F2B")
            ])
        #expect(
            findingPins(s.insp, s.config) == [
                DiagramPin(id: id, point: DiagramPoint(x: 0.1235, y: 1), tint: .severity("#C62F2B"), label: "1")
            ])
    }

    @Test func aFindingWithoutAPinSaysNotPinned() throws {
        let s = try Inspection()
        var form = FindingForm(existing: nil, componentId: nil)
        form.title = "Cracked skimmer throat"
        form.severity = "minor"
        let saved5 = try form.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        let id = try #require(saved5)
        let row = try #require(try s.store.get("finding", id))
        #expect(row["pin_x"] == .null)
        #expect(row["pin_y"] == .null)
        #expect(findingRows(s.insp, s.config).first?.subtitle == "Minor · Not pinned")
        #expect(findingPins(s.insp, s.config).isEmpty)
        #expect(pinSummary([]) == "No pins")
    }

    @Test func statusIsEditedOnExistingFindingsOnlyAndOtherPinsAreGrey() throws {
        let s = try Inspection()
        var a = FindingForm(existing: nil, componentId: nil)
        a.title = "First"
        a.severity = "minor"
        a.place(x: 0.2, y: 0.3)
        let saved6 = try a.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        let first = try #require(saved6)
        var b = FindingForm(existing: nil, componentId: nil)
        b.title = "Second"
        b.severity = "major"
        b.place(x: 0.6, y: 0.5)
        let saved7 = try b.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        let second = try #require(saved7)

        let existing = try #require(s.insp.findings.first { $0.id == second })
        var form = FindingForm(existing: existing, componentId: nil)
        #expect(form.showsStatus)
        #expect(form.navigationTitle == "Finding")
        #expect(form.discardTitle == "Discard your changes?")
        #expect(findingStatusChoices.map(\.label) == ["Open", "Monitor", "Quoted", "Repaired"])
        let pins = editorPins(s.insp, s.config, form: form)
        #expect(
            pins == [
                DiagramPin(id: first, point: DiagramPoint(x: 0.2, y: 0.3), tint: .other, label: ""),
                DiagramPin(
                    id: "this", point: DiagramPoint(x: 0.6, y: 0.5), tint: .severity("#C62F2B"), label: "!",
                    active: true),
            ])
        #expect(pinSummary(pins) == "Another finding’s pin, This finding’s pin")
        form.status = .repaired
        form.pin = nil
        #expect(form.isDirty)
        let saved11 = try form.save(s.sync, companyId: "c1", jobId: "j1", existing: existing)
        #expect(saved11 == second)
        let row = try #require(try s.store.get("finding", second))
        #expect(row["status"] == "repaired")
        #expect(row["pin_x"] == .null)
        #expect(findingRows(s.insp, s.config).map(\.number) == [1, 2])

        try InspectionWrites.delete(s.sync, table: "finding", id: first, companyId: "c1")
        #expect(s.insp.findings.map(\.id) == [second])
    }

    @Test func severityColorsComeFromTheirHex() throws {
        let red = try #require(hexRGB("#C62F2B"))
        #expect(red.red == 198.0 / 255)
        #expect(red.green == 47.0 / 255)
        #expect(red.blue == 43.0 / 255)
        let white = try #require(hexRGB("#fff"))
        #expect(white.red == 1 && white.green == 1 && white.blue == 1)
        #expect(hexRGB("red") == nil)
    }
}

@Suite @MainActor struct PoolDiagramTests {
    @Test func theShapePickerWritesAtOnceAndTappingThePickedShapeClearsIt() throws {
        let s = try Inspection()
        #expect(diagramShape(of: try s.store.get("property", "p1")) == nil)
        let picked = shapeAfterTap(current: nil, tapped: .kidney)
        try InspectionWrites.setDiagramShape(s.sync, propertyId: "p1", companyId: "c1", shape: picked)
        #expect(try s.store.get("property", "p1")?["diagram_shape"] == "kidney")
        #expect(diagramShape(of: try s.store.get("property", "p1")) == .kidney)
        #expect(try s.store.pendingCount() > 0)
        let cleared = shapeAfterTap(current: .kidney, tapped: .kidney)
        #expect(cleared == nil)
        try InspectionWrites.setDiagramShape(s.sync, propertyId: "p1", companyId: "c1", shape: cleared)
        #expect(try s.store.get("property", "p1")?["diagram_shape"] == .null)
        #expect(shapeAfterTap(current: .kidney, tapped: .oval) == .oval)
    }

    @Test func everyOutlineParses() {
        for shape in DiagramShape.allCases {
            let commands = parseSVGPath(poolDiagram(shape, false).pool)
            #expect(commands.first.map { if case .move = $0 { true } else { false } } == true)
            #expect(commands.last == .close)
            #expect(commands.count > 4)
        }
        #expect(
            parseSVGPath("M16 18 H124 Q130 18 130 24 V76 Z") == [
                .move(16, 18), .line(124, 18), .quad(130, 18, 130, 24), .line(130, 76), .close,
            ])
        #expect(parseSVGPath("M70 15 C102 15 130 30 130 50") == [.move(70, 15), .cubic(102, 15, 130, 30, 130, 50)])
        #expect(parseSVGPath("m10 10 l5-5 h2 z") == [.move(10, 10), .line(15, 5), .line(17, 5), .close])
    }
}
