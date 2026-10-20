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
        #expect(form.discardTitle == "Discard changes?")
        #expect(form.sheetTitle == "Add Test" && form.submitTitle == "Add Test")
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

        // The row as the website lists it: name, item and time, the calculation, notes, outcome.
        let rows = testRows(s.insp, s.config, now: Date(), timeZone: "America/Phoenix")
        let test = try #require(rows.first)
        #expect(rows.count == 1 && test.id == id && test.name == "Pressure test")
        #expect(test.meta?.hasPrefix("Return 3 · ") == true)
        #expect(test.summary == "Held at 20 PSI in 15 min")
        #expect(test.fields.isEmpty)
        #expect(test.notes == "Held fine")
        #expect(test.outcome == .pass)
    }

    @Test func resultFollowsTheCalculationAndAnotherTestTypeClearsTheForm() throws {
        let s = try Inspection()
        var form = TestForm(type: s.type("tt-pressure"), existing: nil, componentId: "jc1", component: nil)
        #expect(form.resultChoices == [nil, .pass, .fail, .inconclusive])
        #expect(form.resultLabel(nil) == "Not decided")
        form.values = ["line_name": "Return 1", "start_psi": "20", "end_psi": "12", "duration_min": "15"]
        #expect(form.resultLabel(nil) == "Use the calculation (Fail)")
        #expect(form.resultLabel(.inconclusive) == "Unclear")
        form.chosenOutcome = .pass
        form.changeType(s.type("tt-dye"))
        #expect(form.type.id == "tt-dye" && form.values.isEmpty && form.chosenOutcome == nil)
        #expect(form.componentId == "jc1")
        #expect(form.isDirty)
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
        // A test without a calculator lists its recorded fields.
        let listed = try #require(testRows(s.insp, s.config, now: Date(), timeZone: "America/Phoenix").first)
        #expect(listed.name == "Dye test" && listed.summary == nil)
        #expect(
            listed.fields == [
                .init(label: "Location", value: "Skimmer"), .init(label: "Result", value: "No draw"),
            ])

        let existing = try #require(s.insp.tests.first)
        var form = TestForm(type: s.type("tt-dye"), existing: existing, componentId: nil, component: nil)
        #expect(form.values == ["location": "Skimmer", "observation": "No draw", "notes": ""])
        #expect(form.chosenOutcome == .pass)
        #expect(form.discardTitle == "Discard changes?")
        #expect(form.sheetTitle == "Edit Dye test" && form.submitTitle == "Save Test")
        #expect(form.deleteTitle == "Delete this dye test?")
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
        #expect(testRows(s.insp, s.config, now: Date(), timeZone: "America/Phoenix").isEmpty)
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
        #expect(form.navigationTitle == "Add Finding" && form.submitTitle == "Add Finding")
        // Status shows on a new finding too, as on the website.
        #expect(form.showsStatus && form.status == .open)
        #expect(form.pinHint == "Tap where the leak is.")
        #expect(form.pinStatus == "No pin yet.")
        form.title = "  Return 3 line break "
        form.severity = "major"
        form.location = " Deep end "
        form.place(x: 0.123456, y: 1.4)
        #expect(form.pin == DiagramPoint(x: 0.1235, y: 1))
        #expect(form.pinStatus == "Pin placed.")
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
                    id: id, number: 1, title: "Return 3 line break",
                    subtitle: "Major · Return 3 · Open · Pinned on the diagram", location: "Deep end", notes: nil,
                    color: "#C62F2B")
            ])
        #expect(
            findingPins(s.insp, s.config) == [
                DiagramPin(id: id, point: DiagramPoint(x: 0.1235, y: 1), tint: .severity("#C62F2B"), label: "1")
            ])
    }

    @Test func aFindingWithoutAPinLeavesThePinOut() throws {
        let s = try Inspection()
        var form = FindingForm(existing: nil, componentId: nil)
        form.title = "Cracked skimmer throat"
        form.severity = "minor"
        let saved5 = try form.save(s.sync, companyId: "c1", jobId: "j1", existing: nil)
        let id = try #require(saved5)
        let row = try #require(try s.store.get("finding", id))
        #expect(row["pin_x"] == .null)
        #expect(row["pin_y"] == .null)
        #expect(findingRows(s.insp, s.config).first?.subtitle == "Minor · Open")
        #expect(findingPins(s.insp, s.config).isEmpty)
        #expect(pinSummary([]) == "No pins")
    }

    @Test func theEditorShowsOnlyThisFindingsPinAndSavesItsStatus() throws {
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
        #expect(form.navigationTitle == "Edit Finding" && form.submitTitle == "Save Finding")
        #expect(form.discardTitle == "Discard changes?")
        #expect(form.deleteTitle == "Delete “Second”?")
        #expect(findingStatusChoices.map(\.label) == ["Open", "Quoted", "Repaired", "Monitor"])
        let pins = editorPins(s.config, form: form)
        #expect(
            pins == [
                DiagramPin(
                    id: "this", point: DiagramPoint(x: 0.6, y: 0.5), tint: .severity("#C62F2B"), label: "",
                    active: true)
            ])
        #expect(pinSummary(pins) == "This finding’s pin")
        #expect(pinSummary(findingPins(s.insp, s.config)) == "Pin 1, Pin 2")
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
        #expect(shapeNotPickedHint == "Pick one so the diagram matches the pool.")
        // "Has a spa" saves at once too.
        try InspectionWrites.setHasSpa(s.sync, propertyId: "p1", companyId: "c1", hasSpa: false)
        #expect(try s.store.get("property", "p1")?["has_spa"] == false)
    }

    @Test func everyOutlineParses() {
        // A drawn pool (Clear) has no outline.
        #expect(poolDiagram(.custom, false).pool.isEmpty)
        for shape in DiagramShape.allCases where shape != .custom {
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

    /// Mirrored outlines (spaced tokens from `mirrorPath`) draw the same commands, flipped.
    @Test func mirroredOutlinesParseFlipped() {
        let layout = DiagramLayout(mirror: true)
        for shape in DiagramShape.allCases where shape != .custom {
            let plain = parseSVGPath(poolDiagram(shape, false).pool)
            let mirrored = parseSVGPath(poolDiagram(shape, false, layout).pool)
            #expect(mirrored.count == plain.count)
        }
        #expect(
            parseSVGPath(poolDiagram(.grecian, false, layout).pool).prefix(3) == [
                .move(114, 18), .line(26, 18), .line(10, 34),
            ])
    }

    /// The diagram reads property.diagram_layout; a missing or broken one draws the old diagram.
    @Test func theDiagramReadsThePropertysLayout() {
        #expect(diagramLayout(of: nil) == DiagramLayout())
        #expect(diagramLayout(of: ["diagram_layout": .null]) == DiagramLayout())
        #expect(diagramLayout(of: ["diagram_layout": .string("mirror")]) == DiagramLayout())
        let row: Row = [
            "diagram_layout": .object([
                "mirror": .bool(true),
                "spa": .object([
                    "x": .number(0.2), "y": .number(0.8), "size": .string("large"), "shape": .string("square"),
                ]),
            ])
        ]
        let layout = diagramLayout(of: row)
        #expect(layout == DiagramLayout(mirror: true, spa: .init(x: 0.2, y: 0.8, size: .large, shape: .square)))
        let spa = poolDiagram(.oval, true, layout).spa
        #expect(spa.map { [$0.cx, $0.cy, $0.r] } == [32, 80, 17])
        #expect(spa?.square == true)
        // Mirrored without a placed spa: top left instead of top right.
        let corner = poolDiagram(.oval, true, DiagramLayout(mirror: true)).spa
        #expect(corner.map { [$0.cx, $0.cy, $0.r] } == [15, 22, 13])
        #expect(corner?.square == false)
    }
}

/// Edit Pool Shape (owner, 2026-10-19; website pool-shape-editor.tsx and actions/diagram.ts).
@Suite @MainActor struct PoolShapeFormTests {
    @Test func theTilesAreTwoRowsOfFive() {
        #expect(
            PoolShapeTile.all.map(\.label) == [
                "Rectangle", "Oval", "Kidney", "L-shape", "Roman", "Grecian", "Draw", "Clear", "Landmarks", "Figure 8",
            ])
        #expect(!DiagramShape.tiles.contains(.freeform) && !DiagramShape.tiles.contains(.custom))
        var form = PoolShapeForm(property: ["id": "p1", "has_spa": false])
        form.tapShape(.oval)
        #expect(form.shape == .oval)
        form.tapShape(.oval)
        #expect(form.shape == nil)
    }

    @Test func aPlainPoolWritesOnlyCentered() throws {
        let form = PoolShapeForm(property: ["id": "p1", "has_spa": false])
        #expect(form.shape == nil && !form.hasSpa && !form.mirror && form.spa == nil)
        #expect(form.layout == DiagramLayout(centered: true) && form.layoutJSON == ["centered": true])
        #expect(form.spaNow == nil && form.drawingLabel == "Pool drawing")
    }

    @Test func theSpaIsReshapedMovedAndResizedOnTheDrawing() throws {
        var form = PoolShapeForm(property: ["id": "p1", "diagram_shape": "kidney", "has_spa": true])
        // The default spa sits in the corner and writes nothing until it's touched.
        #expect(form.spaNow == PlacedSpa(x: 145.0 / 160, y: 0.22, r: 13, shape: .round))
        #expect(form.layoutJSON == ["centered": true])
        form.mirror = true
        #expect(form.layoutJSON == ["centered": true, "mirror": true])
        #expect(form.spaNow?.x == 15.0 / 160)
        // A tap on the spa makes it square, where it's drawn now.
        #expect(form.onSpa(x: 15.0 / 160, y: 0.22) && !form.onSpa(x: 0.5, y: 0.5))
        form.toggleSpaShape()
        #expect(
            form.layoutJSON == [
                "centered": true, "mirror": true,
                "spa": ["x": 0.09375, "y": 0.22, "size": "medium", "shape": "square", "r": 13],
            ])
        // Drag it, then drag its corner handle; the size written is the nearest preset.
        form.moveSpa(x: 0.85, y: 0.2)
        let handle = (x: 0.85 + 13 * 0.71 / 160, y: 0.2 + 13 * 0.71 / 100)
        #expect(form.onHandle(x: handle.x, y: handle.y))
        form.resizeSpa(toX: 0.85 + 17 / 160, y: 0.2)
        #expect(form.spa == PlacedSpa(x: 0.85, y: 0.2, r: 17, shape: .square))
        #expect(form.layout.spa?.size == .large && form.layout.spa?.r == 17)
        #expect(form.diagram.spa.map { [$0.cx, $0.cy, $0.r] } == [136, 20, 17])
        // A pinch is kept within 7 to 28.
        form.setSpaR(40)
        #expect(form.spa?.r == 28)
        form.setSpaR(3)
        #expect(form.spa?.r == 7 && form.layout.spa?.size == .small)
        #expect(form.drawingLabel == "Pool drawing, Spa, square, size 7")
        // VoiceOver's moves: 2% a step, clamped.
        for _ in 0..<20 { form.nudge(dx: PoolShapeForm.step, dy: -PoolShapeForm.step) }
        #expect(form.spa?.x == 1 && form.spa?.y == 0)
        // No spa: none in the layout.
        form.hasSpa = false
        #expect(form.layoutJSON == ["centered": true, "mirror": true] && form.spaNow == nil)
    }

    @Test func drawingAndLandmarksGoInTheLayout() throws {
        var form = PoolShapeForm(property: ["id": "p1", "diagram_shape": "oval", "has_spa": false])
        form.draw(.line, [(0.1, 0.2), (0.9, 0.8)])
        form.draw(.circle, [(0.5, 0.5), (0.505, 0.5)])  // too small to see
        form.draw(.pen, [(0.1, 0.1), (0.2, 0.3), (0.3, 0.3)])
        #expect(form.drawing.count == 2)
        form.undo()
        #expect(form.drawing == [.line(x1: 0.1, y1: 0.2, x2: 0.9, y2: 0.8)])
        form.placeLandmark(.tree, x: 0.05, y: 0.05)
        form.placeLandmark(.house, x: 0.5, y: 0.9)
        #expect(form.landmarkAt(x: 0.05, y: 0.05) == 0 && form.landmarkAt(x: 0.5, y: 0.5) == nil)
        form.moveLandmark(1, x: 0.6, y: 0.95)
        #expect(
            form.layoutJSON == [
                "centered": true,
                "drawing": [["type": "line", "x1": 0.1, "y1": 0.2, "x2": 0.9, "y2": 0.8]],
                "landmarks": [["kind": "tree", "x": 0.05, "y": 0.05], ["kind": "house", "x": 0.6, "y": 0.95]],
            ])
        #expect(form.diagram.drawing == ["M16 20 L144 80"])
        #expect(form.diagram.landmarks.map(\.cx) == [10, 96])
        // Selected: a tap on it again flips it, its corner resizes it, its X deletes it.
        form.flipLandmark(1)
        form.setLandmarkSize(1, 60)
        #expect(form.landmarks[1].flip == true && form.landmarks[1].s == 44)
        let house = form.diagram.landmarks[1]
        #expect(form.onLandmarkDelete(1, x: (house.cx + 22) / 160, y: (house.cy - 22) / 100))
        #expect(form.onLandmarkHandle(1, x: (house.cx + 22) / 160, y: (house.cy + 22) / 100))
        form.resizeLandmark(1, toX: (house.cx + 8) / 160, y: house.cy / 100)
        #expect(form.landmarks[1].s == 16 && form.landmarkSizeAt(1) == 16 && form.landmarkSizeAt(0) == 20)
        #expect(
            form.layoutJSON["landmarks"]
                == [
                    ["kind": "tree", "x": 0.05, "y": 0.05],
                    ["kind": "house", "x": 0.6, "y": 0.95, "s": 16, "flip": true],
                ])
        form.flipLandmark(1)
        #expect(form.landmarks[1].flip == nil)
        #expect(form.drawingLabel == "Pool drawing, 2 landmarks, 1 drawn")
        form.removeLandmark(0)
        #expect(form.landmarks.map(\.kind) == [.house])
        #expect(PoolShapeForm.placingHint(.tree) == "Tap the drawing to put the tree there.")
        #expect(PoolShapeForm.deleteTitle(.house) == "Delete House")
        // At most 30 landmarks.
        for _ in 0..<40 { form.placeLandmark(.rock, x: 0.5, y: 0.5) }
        #expect(form.landmarks.count == landmarksMax)
    }

    /// Pools are drawn centered (owner, 2026-10-20): a pool saved before opens moved right 10,
    /// with its spa, landmarks and drawing moved along, and its tiles draw centered.
    @Test func anOlderPoolOpensCenteredWithWhatsPlacedOnIt() throws {
        let property: Row = [
            "id": "p1", "diagram_shape": "rectangle", "has_spa": true,
            "diagram_layout": [
                "spa": ["x": 0.8, "y": 0.2, "size": "medium", "shape": "round", "r": 13],
                "landmarks": [["kind": "tree", "x": 0.1, "y": 0.5]],
                "drawing": [["type": "line", "x1": 0.1, "y1": 0.2, "x2": 0.5, "y2": 0.8]],
            ],
        ]
        // Untouched, it still draws where it was until it's saved.
        #expect(poolDiagram(.rectangle, true, diagramLayout(of: property)).pool.hasPrefix("M16 18"))
        let form = PoolShapeForm(property: property)
        #expect(form.spa?.x == 0.8625 && form.landmarks.first?.x == 0.1625)
        #expect(form.drawing == [.line(x1: 0.1625, y1: 0.2, x2: 0.5625, y2: 0.8)])
        #expect(form.diagram.pool.hasPrefix("M 26 18 H 134") && form.layout.centered == true)
        #expect(form.layoutJSON["centered"] == true)
        #expect(poolDiagram(.rectangle, false, DiagramLayout(centered: true)).pool.hasPrefix("M 26 18 H 134"))
    }

    @Test func clearEmptiesTheDiagram() throws {
        var form = PoolShapeForm(property: ["id": "p1", "diagram_shape": "kidney", "has_spa": true])
        form.mirror = true
        form.toggleSpaShape()
        form.draw(.line, [(0.1, 0.2), (0.9, 0.8)])
        form.placeLandmark(.steps, x: 0.3, y: 0.3)
        form.clear()
        #expect(form.shape == .custom && !form.hasSpa && !form.mirror && form.spa == nil)
        #expect(form.drawing.isEmpty && form.landmarks.isEmpty && form.layoutJSON == ["centered": true])
        #expect(form.diagram.pool.isEmpty)
        #expect(PoolShapeForm.clearTitle == "Clear the pool diagram?" && PoolShapeForm.clearButton == "Clear Diagram")
    }

    @Test func savingWritesShapeSpaAndLayoutThroughSync() throws {
        let s = try Inspection()
        let before = try s.store.pendingCount()
        var form = PoolShapeForm(property: try s.store.get("property", "p1"))
        form.shape = .figureEight
        form.hasSpa = true
        form.mirror = true
        form.moveSpa(x: 0.2, y: 0.8)
        form.setSpaR(17.25)
        form.draw(.circle, [(0.2, 0.2), (0.4, 0.6)])
        form.placeLandmark(.waterfall, x: 0.9, y: 0.1)
        try InspectionWrites.savePoolShape(s.sync, propertyId: "p1", companyId: "c1", form)
        let row = try #require(try s.store.get("property", "p1"))
        #expect(row["diagram_shape"] == "figure_eight" && row["has_spa"] == true)
        #expect(
            row["diagram_layout"] == [
                "centered": true, "mirror": true,
                "spa": ["x": 0.2, "y": 0.8, "size": "large", "shape": "round", "r": 17.3],
                "drawing": [["type": "circle", "cx": 0.3, "cy": 0.4, "rx": 0.1, "ry": 0.2]],
                "landmarks": [["kind": "waterfall", "x": 0.9, "y": 0.1]],
            ])
        #expect(try s.store.pendingCount() == before + 1)
        // What the diagram then draws, and the sheet reopens to the same choices.
        #expect(diagramLayout(of: row) == form.layout)
        #expect(PoolShapeForm(property: row) == form)
        // A cleared pool writes the drawn shape and only that it's centered.
        var plain = PoolShapeForm(property: row)
        plain.clear()
        try InspectionWrites.savePoolShape(s.sync, propertyId: "p1", companyId: "c1", plain)
        let cleared = try #require(try s.store.get("property", "p1"))
        #expect(
            cleared["diagram_shape"] == "custom" && cleared["has_spa"] == false
                && cleared["diagram_layout"] == ["centered": true])
        #expect(PoolShapeForm.title == "Pool Shape" && PoolShapeForm.save == "Save Pool Shape")
        #expect(PoolShapeForm.mirrorLabel == "Mirror (flip left to right)")
    }
}

/// Mark Up on the pool diagram (owner, 2026-10-19): `job.diagram_markup`, as a photo's markup.
@Suite @MainActor struct DiagramMarkupTests {
    @Test func markupSavesOnTheJobThroughSyncAndReadsBack() throws {
        let s = try Inspection()
        let jobId = try #require(try s.store.list("job").first?.id)
        #expect(jobDiagramMarkup(try s.store.get("job", jobId)).isEmpty)
        #expect(diagramMarkupButton([]) == "Mark Up")
        let before = try s.store.pendingCount()
        // Drawn with the same tools as a photo: a pen stroke and an arrow, on 800 x 500.
        var draft = MarkupDraft(saved: [], width: 800, height: 500)
        draft.release(stroke: (0...30).map { MarkupPoint(x: 0.2 + Double($0) * 0.01, y: 0.4) })
        draft.tool = .arrow
        draft.release(from: MarkupPoint(x: 0.7, y: 0.2), to: MarkupPoint(x: 0.5, y: 0.5))
        try InspectionWrites.setDiagramMarkup(s.sync, jobId: jobId, companyId: "c1", draft.markup)
        let row = try #require(try s.store.get("job", jobId))
        #expect(row["diagram_markup"]?["version"] == 1)
        #expect(row["diagram_markup"]?["shapes"]?.array?.map { $0["type"] } == ["pen", "arrow"])
        #expect(try s.store.pendingCount() == before + 1)
        let shapes = jobDiagramMarkup(row)
        #expect(shapes == draft.shapes)
        #expect(diagramMarkupButton(shapes) == "Edit Markup")
        // The editor reopens with it, and Clear All then Save clears the column.
        var again = MarkupDraft(saved: shapes, width: 800, height: 500)
        #expect(again.shapes == shapes)
        again.clearAll()
        try InspectionWrites.setDiagramMarkup(s.sync, jobId: jobId, companyId: "c1", again.markup)
        #expect(try s.store.get("job", jobId)?["diagram_markup"] == .null)
        #expect(jobDiagramMarkup(try s.store.get("job", jobId)).isEmpty)
    }

    @Test func addPhotoOnANewTestSavesItFirstAndKeepsEditing() throws {
        let s = try Inspection()
        var form = TestForm(type: s.type("tt-pressure"), existing: nil, componentId: nil, component: nil)
        // The same checks as Save: nothing saved while a field needs fixing.
        #expect(try form.save(s.sync, companyId: "c1", jobId: "j1", existing: nil) == nil)
        form.values.merge(["line_name": "Main drain", "start_psi": "20", "end_psi": "18", "duration_min": "15"]) {
            $1
        }
        let id = try #require(try form.save(s.sync, companyId: "c1", jobId: "j1", existing: nil))
        form.markSaved(id)
        #expect(!form.isNew && form.existingId == id && !form.isDirty)
        #expect(form.submitTitle == "Save Test" && form.sheetTitle == "Edit Pressure test")

        var finding = FindingForm(existing: nil, componentId: nil)
        finding.markSaved("f1")
        #expect(finding.navigationTitle == "Edit Finding" && finding.submitTitle == "Save Finding")
        #expect(!finding.isDirty)
    }
}
