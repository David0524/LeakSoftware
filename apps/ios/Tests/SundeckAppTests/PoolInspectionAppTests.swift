import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// Pool Inspection on the phone (2026-10-20): New Job, the checklist's sections, gates and answers
/// (every write through the sync layer), the job page's counts and From the Customer, the
/// signature screen, and Settings › Checklist Components. Behavior of the website's
/// new-job-form.tsx, inspection-checklist.tsx and jobs/[id]/page.tsx.
@MainActor @Suite struct PoolInspectionAppTests {
    static let company = "00000000-0000-4000-8000-0000000000c1"
    static let me = "00000000-0000-4000-8000-0000000000a1"

    static let questions: JSONValue = [
        ["key": "reason", "label": "Why they called", "type": "text"],
        [
            "key": "features", "label": "Features that apply", "type": "multi",
            "options": ["Spa", "Waterfall", "Solar"], "job_types": ["inspection"],
        ],
        [
            "key": "heater", "label": "Heater", "type": "single", "options": ["Gas", "Heat pump"],
            "job_types": ["inspection"],
        ],
    ]

    let sync: SyncService

    init() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("insp-\(UUID()).db").path
        let database = try Database(path: path, key: String(repeating: "6a", count: 32))
        let store = try LocalStore.open(database)
        sync = SyncService(store: store, kv: try KeyValue(database), transport: FakeTransport(), auth: FakeAuth())
        try seed()
    }

    func seed() throws {
        func question(
            _ n: Int, _ name: String, section: String, group: JSONValue = .null, answer: String = "choice",
            options: JSONValue = .null, notice: JSONValue = .null, sort: Int
        ) -> Row {
            [
                "id": .string("00000000-0000-4000-8000-0000000001\(n)"), "company_id": .string(Self.company),
                "deleted_at": nil, "key": .string("insp_\(n)"), "name": .string(name), "section": .string(section),
                "answer": .string(answer), "job_type": "inspection", "group_label": group, "options": options,
                "notice": notice, "applies_to_pool_type": nil, "on_schedule": false, "allows_multiple": false,
                "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": .number(Double(sort)),
                "active": true,
            ]
        }
        let yesNo: JSONValue = [["label": "Yes", "flag": "ok"], ["label": "No", "flag": "attention"]]
        let gate: JSONValue = [["label": "Yes"], ["label": "No", "fold": true]]
        let leak: JSONValue = [
            ["label": "Leaking", "flag": "leaking"], ["label": "Not Leaking", "flag": "ok"],
            ["label": "N/A", "flag": "na"],
        ]
        let rows: [Row] = [
            question(10, "Is solar present?", section: "insp_equipment", group: "Solar", options: gate, sort: 10),
            question(11, "Is solar working?", section: "insp_equipment", group: "Solar", options: yesNo, sort: 11),
            question(12, "Does solar leak?", section: "insp_equipment", group: "Solar", options: leak, sort: 12),
            question(
                13, "Is the system accessible?", section: "insp_equipment", group: "Filtration System",
                options: yesNo, notice: "FOR ANY UNKNOWN GAS ISSUES - ALWAYS REFER TO A LICENSED GAS COMPANY",
                sort: 20),
            question(
                14, "Parts that leak", section: "insp_visual", answer: "multi",
                options: [["label": "Pool main drain"], ["label": "Pool skimmer"], ["label": "Spa drain"]], sort: 30),
            question(15, "Heater make", section: "insp_heaters", answer: "text", sort: 40),
            // A leak detection item: never on an inspection.
            [
                "id": "00000000-0000-4000-8000-000000000199", "company_id": .string(Self.company), "deleted_at": nil,
                "key": "skimmer", "name": "Skimmer", "section": "plumbing", "answer": "leak", "job_type": nil,
                "on_schedule": false, "allows_multiple": false, "default_count": 1, "applies_to": "pool",
                "methods": ["Visual"], "sort_order": 5, "active": true,
            ],
        ]
        let prices: [Row] = [
            [
                "id": "00000000-0000-4000-8000-000000000201", "company_id": .string(Self.company), "deleted_at": nil,
                "name": "Pool inspection", "category": "Inspection", "unit": "each", "price_cents": 29500,
                "taxable": false, "sort_order": 10, "active": true,
            ]
        ]
        try sync.store.applyPage(
            PullPage(
                rows: rows.map { PulledRow(table: "component_type", xid: "1", row: $0) }
                    + prices.map { PulledRow(table: "price_book_item", xid: "1", row: $0) },
                done: true, cursor: [:], serverHLC: "1800000000000-0000-server"))
    }

    func form(services: String = "leak") -> NewJobForm {
        NewJobForm(
            sync: sync,
            company: CompanyContext(
                id: Self.company, name: "Desert Leak", timeZone: "America/Phoenix",
                settings: ["services": .string(services), "intake_questions": Self.questions], role: "owner"),
            userId: Self.me, now: { Date(timeIntervalSince1970: 1_800_000_000) })
    }

    /// Books an inspection and returns its id.
    func book() throws -> String {
        let f = form()
        f.jobType = .inspection
        f.jobTypeChanged()
        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        f.when = .notYet
        return try f.save()
    }

    var config: InspectionConfig { InspectionConfig(sync.store, companyId: Self.company) }

    func checklist(_ jobId: String) -> InspectionChecklist {
        InspectionChecklist(config: config, inspection: JobInspection(sync.store, jobId: jobId))
    }

    func question(_ jobId: String, _ name: String) throws -> InspectionQuestionRow {
        try #require(checklist(jobId).sections.flatMap(\.questions).first { $0.label == name })
    }

    func answer(_ jobId: String, _ name: String, _ value: InspectionValue?) throws {
        try InspectionWrites.setAnswer(
            sync, companyId: Self.company, jobId: jobId, question: try question(jobId, name), value: value,
            userId: Self.me)
    }

    // MARK: - New Job

    @Test func newJobOffersPoolInspectionWithItsPriceAndQuestions() throws {
        let f = form()
        #expect(f.jobTypes.map(\.label) == ["Leak Detection", "Pool Inspection", "Repair"])
        #expect(f.questions.map(\.key) == ["reason"])
        f.setAnswer("reason", "Leaking")
        f.jobType = .inspection
        f.jobTypeChanged()
        #expect(f.fee == "295.00")
        #expect(f.feeLabel == "Price ($)")
        #expect(f.showsBooking && f.gallonsInBooking && !f.gallonsInPool)
        #expect(f.questions.map(\.key) == ["features", "heater"])
        f.setPicked("features", "Solar", true)
        f.setAnswer("heater", "Gas")
        // A price typed first stays.
        let g = form()
        g.fee = "350"
        g.jobType = .inspection
        g.jobTypeChanged()
        #expect(g.fee == "350")

        f.input.customerName = "Maria"
        f.input.addressLine1 = "1 Main St"
        f.when = .notYet
        let job = try #require(try sync.store.get("job", f.save()))
        #expect(job["type"] == "inspection")
        #expect(job["fee_cents"] == 29500)
        // Only the inspection's own questions are kept.
        #expect(job["intake"] == ["features": ["Solar"], "heater": "Gas"])
        // Its checklist is the inspection's, ready offline.
        let labels = try sync.store.list("job_component", jobId: job.id).compactMap { $0["label"]?.string }
        #expect(
            Set(labels) == [
                "Is solar present?", "Is solar working?", "Does solar leak?",
                "Is the system accessible?", "Parts that leak", "Heater make",
            ])
        #expect(try sync.store.pendingCount() > 0)
    }

    @Test func poolShopsDoNotOfferIt() {
        #expect(!form(services: "pool").jobTypes.contains { $0.value == .inspection })
        #expect(
            form(services: "both").jobTypes.map(\.label) == [
                "Leak Detection", "Pool Inspection", "Pool Service", "Repair",
            ])
    }

    // MARK: - Checklist

    @Test func sectionsGroupsNoticesAndProgress() throws {
        let jobId = try book()
        let c = checklist(jobId)
        #expect(c.sections.map(\.title) == ["Equipment", "Heaters", "Visual Leak Inspection"])
        let equipment = try #require(c.sections.first)
        #expect(equipment.startsOpen && !c.sections[1].startsOpen)
        #expect(equipment.questions.map(\.header) == ["Solar", nil, nil, "Filtration System"])
        #expect(equipment.questions[3].notice?.hasPrefix("FOR ANY UNKNOWN GAS ISSUES") == true)
        #expect(equipment.progressText == "0 of 4 answered")
        #expect(c.tallyText == "0 of 6 answered · 0 need attention · 0 leaking")
        let model = ChecklistModel(
            config: config, inspection: JobInspection(sync.store, jobId: jobId), jobType: .inspection, property: nil)
        #expect(model.sections.isEmpty && model.canEdit)
        #expect(model.tallyText == c.tallyText)
        // Leak items aren't offered on an inspection.
        #expect(model.missing.isEmpty)
    }

    @Test func aGateFoldsItsGroupAndTheCountsLeaveItOut() throws {
        let jobId = try book()
        #expect(jobChecklistToDo(sync.store, jobId: jobId) == 6)
        let before = try sync.store.pendingCount()
        try answer(jobId, "Is solar present?", .text("No"))
        #expect(try sync.store.pendingCount() == before + 1)
        var c = checklist(jobId)
        let equipment = c.sections[0]
        #expect(equipment.questions.map(\.label) == ["Is solar present?", "Is the system accessible?"])
        #expect(equipment.questions[0].foldedText == "Not present: 2 questions folded away.")
        #expect(equipment.progressText == "1 of 2 answered")
        #expect(c.progress.toDo == 3)
        #expect(jobChecklistToDo(sync.store, jobId: jobId) == 3)
        #expect(
            checklistToDo(config: config, inspection: JobInspection(sync.store, jobId: jobId), jobType: .inspection)
                == 3)

        // Yes opens them all again.
        try answer(jobId, "Is solar present?", .text("Yes"))
        c = checklist(jobId)
        #expect(c.sections[0].questions.count == 4)
    }

    @Test func answersSetTheOutcomeFromTheOption() throws {
        let jobId = try book()
        try answer(jobId, "Is solar present?", .text("Yes"))
        try answer(jobId, "Does solar leak?", .text("Leaking"))
        try answer(jobId, "Is solar working?", .text("No"))
        var q = try question(jobId, "Does solar leak?")
        #expect(q.result?.status == .inspected && q.result?.outcome == .leaking)
        #expect(q.result?.value == "Leaking" && q.result?.inspectedBy == Self.me)
        #expect(q.answerText == "Leaking")
        let leakOption = try #require(q.options.first)
        #expect(q.isChosen(leakOption))
        // Tapping the chosen answer again puts it back to do.
        #expect(q.valueAfterTapping(leakOption) == nil)
        try answer(jobId, "Does solar leak?", q.valueAfterTapping(leakOption))
        q = try question(jobId, "Does solar leak?")
        #expect(q.result?.status == .pending && q.result?.value == nil && q.answerText == "To do")

        try answer(jobId, "Does solar leak?", .text("N/A"))
        #expect(try question(jobId, "Does solar leak?").result?.status == .excluded)

        let equipment = checklist(jobId).sections[0]
        #expect(equipment.progressText == "3 of 4 answered")
        #expect(equipment.progressTone == .warning)

        // Several choices toggle in the options' order.
        var parts = try question(jobId, "Parts that leak")
        try answer(jobId, "Parts that leak", parts.valueAfterTapping(parts.options[2]))
        parts = try question(jobId, "Parts that leak")
        try answer(jobId, "Parts that leak", parts.valueAfterTapping(parts.options[0]))
        parts = try question(jobId, "Parts that leak")
        #expect(parts.value == .list(["Pool main drain", "Spa drain"]))
        #expect(parts.answerText == "Pool main drain, Spa drain")
    }

    @Test func textAndDescribeSaveOnlyWhenChanged() throws {
        let jobId = try book()
        let heater = try question(jobId, "Heater make")
        try InspectionWrites.saveTextAnswer(
            sync, companyId: Self.company, jobId: jobId, question: heater, draft: "  Pentair 400k ", userId: Self.me)
        var q = try question(jobId, "Heater make")
        #expect(q.result?.value == "Pentair 400k" && q.result?.status == .inspected)
        let before = sync.revision
        try InspectionWrites.saveTextAnswer(
            sync, companyId: Self.company, jobId: jobId, question: q, draft: "Pentair 400k", userId: Self.me)
        #expect(sync.revision == before)

        try InspectionWrites.saveNotes(sync, companyId: Self.company, jobId: jobId, question: q, draft: " Rusty ")
        q = try question(jobId, "Heater make")
        #expect(q.notes == "Rusty")
        let again = sync.revision
        try InspectionWrites.saveNotes(sync, companyId: Self.company, jobId: jobId, question: q, draft: "Rusty")
        #expect(sync.revision == again)
        try InspectionWrites.saveNotes(sync, companyId: Self.company, jobId: jobId, question: q, draft: "  ")
        #expect(try question(jobId, "Heater make").result?.notes == nil)
    }

    // MARK: - Job page, report, and labels

    @Test func theJobPageShowsOnlyThisJobTypesQuestionsAndItsNames() throws {
        let settings: JSONValue = ["intake_questions": Self.questions]
        let intake: JSONValue = ["reason": "Dropping", "features": ["Spa", "Solar"], "heater": "Gas"]
        #expect(
            intakeAnswers(settings: settings, intake: intake, jobType: .inspection).map(\.answer) == [
                "Spa, Solar", "Gas",
            ])
        #expect(intakeAnswers(settings: settings, intake: intake, jobType: .detection).map(\.answer) == ["Dropping"])
        #expect(jobTypeLabel(JobType.inspection) == "Pool inspection")
        #expect(customerJobTypeLabel(.inspection) == "Pool inspection")
        #expect(jobFeeLabel(.inspection) == "Price")
    }

    @Test func signingDoesNotWaitForUnansweredQuestions() throws {
        let jobId = try book()
        try answer(jobId, "Is solar present?", .text("No"))
        try answer(jobId, "Is the system accessible?", .text("No"))
        try answer(jobId, "Parts that leak", .list(["Spa drain"]))
        let form = try #require(
            ReviewSummary(sync.store, companyId: Self.company, companyName: "Desert Leak", settings: nil, jobId: jobId))
        #expect(form.title == "Pool Inspection Report")
        // The report lists what was answered, so a question left open doesn't hold up signing.
        #expect(form.pending == 1 && form.pendingText == "1 still to do")
        #expect(form.pendingNotice == nil && form.showsButtons)
        #expect(form.tallyText == "3 of 4 answered · 1 need attention · 0 leaking")
        try InspectionWrites.saveTextAnswer(
            sync, companyId: Self.company, jobId: jobId, question: try question(jobId, "Heater make"), draft: "Gas",
            userId: Self.me)
        let done = try #require(
            ReviewSummary(sync.store, companyId: Self.company, companyName: "Desert Leak", settings: nil, jobId: jobId))
        #expect(done.pending == 0 && done.showsButtons)
    }

    // MARK: - Settings

    @Test func settingsListsPoolInspectionsBySection() throws {
        #expect(ChecklistList.lists(.leak) == [.leak, .inspection])
        #expect(ChecklistList.lists(.both).map(\.label) == ["Pool Visits", "Leak Inspections", "Pool Inspections"])
        let groups = componentGroups(sync.store, companyId: Self.company, list: .inspection)
        #expect(groups.map(\.title) == ["Equipment", "Heaters", "Visual Leak Inspection"])
        #expect(groups[0].items.first?.detail == "Solar · One choice")
        #expect(groups[2].items.first?.detail == "Several choices")
        let leak = componentGroups(sync.store, companyId: Self.company, list: .leak)
        #expect(leak.flatMap(\.items).map(\.name) == ["Skimmer"])
        #expect(
            settingsSubtitle(.components, services: .leak, list: .inspection)
                == "Every question of a pool inspection. Changes apply to new jobs; jobs already started keep their checklist."
        )
    }

    @Test func aQuestionsFormSavesItsChoicesAsOptions() throws {
        let item = try #require(componentGroups(sync.store, companyId: Self.company, list: .inspection)[0].items.first)
        var form = InspectionQuestionForm(item.row)
        #expect(form.options == "Yes\nNo (folds the group)")
        #expect(form.answerLabel == "One choice" && form.section == .inspEquipment && form.group == "Solar")
        form.options = "Yes"
        #expect(form.error == "Enter at least two choices.")
        form.options = "Yes\nNo (needs attention, folds the group)\n\nYes"
        form.notice = "  "
        #expect(form.error == nil)
        try ConfigWrites.saveInspectionQuestion(sync, companyId: Self.company, id: item.id, form)
        let row = try #require(try sync.store.get("component_type", item.id))
        #expect(row["options"] == [["label": "Yes"], ["label": "No", "flag": "attention", "fold": true]])
        #expect(row["notice"] == .null)
    }
}
