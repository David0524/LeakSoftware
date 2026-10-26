import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

// S6 signatures: the signature screen and the review screen's sign-off, without SwiftUI. Port of
// the behavior of apps/mobile/src/app/(app)/jobs/[id]/signature.tsx and review.tsx.

private let hlc = "1760000000000-0000-srv"

private func text(_ value: SQLValue?) -> String? {
    if case .text(let s) = value { return s }
    return nil
}

/// A signature long enough to count (well over `minInk`).
private let scribble: [SignatureStroke] = [
    [SIMD2(20, 120), SIMD2(60, 90), SIMD2(100, 130), SIMD2(140.25, 95.5)],
    [SIMD2(160, 110)],
]

@MainActor
private struct SignatureBench {
    let bench: CaptureBench
    var sync: SyncService { bench.sync }
    var store: LocalStore { bench.sync.store }

    init(jobType: String = "detection") throws {
        bench = try CaptureBench()
        try seed([
            (
                "customer",
                ["id": "cu1", "company_id": "c1", "name": "Dana Whitfield"]
            ),
            (
                "property",
                [
                    "id": "p1", "company_id": "c1", "customer_id": "cu1", "address_line1": "1 Main St",
                    "city": "Mesa", "state": "AZ", "postal_code": "85201", "has_pool": true, "has_spa": false,
                ]
            ),
            (
                "job",
                [
                    "id": "j1", "company_id": "c1", "property_id": "p1", "type": .string(jobType),
                    "status": "in_progress",
                ]
            ),
        ])
    }

    func seed(_ rows: [(String, JSONValue)]) throws {
        var pulled: [PulledRow] = []
        for (i, (table, row)) in rows.enumerated() {
            guard case .object(let object) = row else { continue }
            pulled.append(PulledRow(table: table, xid: String(i + 10), row: object))
        }
        try store.applyPage(PullPage(rows: pulled, done: true, cursor: [:], serverHLC: hlc))
    }

    /// A checklist of two items (one leaking, one pending unless `allDone`), a finding and a test.
    func seedInspection(allDone: Bool) throws {
        try seed([
            (
                "severity_level",
                [
                    "id": "sev-major", "company_id": "c1", "key": "major", "name": "Major", "color": "#C62F2B",
                    "must_mention": false, "sort_order": 30, "active": true,
                ]
            ),
            (
                "test_type",
                [
                    "id": "tt-pressure", "company_id": "c1", "key": "pressure", "name": "Pressure test",
                    "calculator": "pressure_drop", "sort_order": 10, "schema_version": 1, "active": true,
                    "result_options": ["pass", "fail"], "field_schema": ["fields": []],
                ]
            ),
            component("jc1", "Return 3", 1), component("jc2", "Skimmer", 2),
            result("r1", "jc1", status: "inspected", outcome: "leaking"),
            result("r2", "jc2", status: allDone ? "excluded" : "pending", outcome: nil),
            (
                "finding",
                [
                    "id": "f2", "company_id": "c1", "job_id": "j1", "job_component_id": "jc1",
                    "title": "Return 3 line break", "location_text": "6 ft from the pad", "severity_key": "major",
                    "status": "open",
                ]
            ),
            (
                "finding",
                [
                    "id": "f1", "company_id": "c1", "job_id": "j1", "title": "Cracked tile", "location_text": "",
                    "severity_key": "gone", "status": "open",
                ]
            ),
            (
                "test_result",
                [
                    "id": "t1", "company_id": "c1", "job_id": "j1", "test_type_id": "tt-pressure", "schema_version": 1,
                    "data": [:], "computed": [:], "outcome": "fail", "performed_at": "2026-10-19T16:00:00.000Z",
                ]
            ),
        ])
    }

    func component(_ id: String, _ label: String, _ order: Int) -> (String, JSONValue) {
        (
            "job_component",
            [
                "id": .string(id), "company_id": "c1", "job_id": "j1", "component_type_id": "ct1",
                "instance_number": 1, "label": .string(label), "sort_order": .number(Double(order)),
            ]
        )
    }

    func result(_ id: String, _ componentId: String, status: String, outcome: String?) -> (String, JSONValue) {
        (
            "checklist_item_result",
            [
                "id": .string(id), "company_id": "c1", "job_id": "j1", "job_component_id": .string(componentId),
                "status": .string(status), "outcome": outcome.map(JSONValue.string) ?? .null,
            ]
        )
    }

    func seedDraft(sections: JSONValue = []) throws {
        try seed([
            (
                "report",
                [
                    "id": "rep1", "company_id": "c1", "job_id": "j1", "template_key": "homeowner", "version": 1,
                    "status": "draft", "final_sections": sections, "ai_draft": .null, "model": .null,
                    "sent_at": .null,
                ]
            )
        ])
    }

    func summary(_ settings: JSONValue? = nil) throws -> ReviewSummary {
        try #require(
            ReviewSummary(store, companyId: "c1", companyName: "Demo Leak Co.", settings: settings, jobId: "j1"))
    }

    func signatures() throws -> [Row] { try store.list("signature", jobId: "j1") }
}

/// Records what the review screen asked the server to finish.
@MainActor
private final class FinishCalls {
    var calls: [(String, Bool)] = []
    var failure: String?

    func finish(_ reportId: String, _ away: Bool) async throws {
        calls.append((reportId, away))
        if let failure { throw WebAPI.Failure(description: failure) }
    }
}

@Suite @MainActor struct SignaturePurposeTests {
    @Test func aQuoteIsSignedAsQuoteAcceptanceWhateverTheSettings() {
        let off: JSONValue = ["signature_purposes": ["inspection_ack": false]]
        for settings in [nil, off] {
            let form = SignatureForm(.signature(quoteId: "q1"), settings: settings, customerName: nil)
            #expect(
                form.purposes.map(\.value) == [.quoteAcceptance] && form.purposes.map(\.label) == ["Quote accepted"])
            #expect(form.purpose == .quoteAcceptance && form.heading == "Quote accepted" && !form.showsPicker)
            #expect(form.quoteId == "q1")
        }
    }

    @Test func withoutAQuoteOnlyWorkAuthorizationFromSettings() {
        let on: JSONValue = [
            "signature_purposes": ["inspection_ack": true, "work_authorization": true, "completion": true]
        ]
        let form = SignatureForm(.signature(quoteId: nil), settings: on, customerName: nil)
        #expect(form.purposes.map(\.value) == [.workAuthorization])
        #expect(form.heading == "Work authorized" && form.purpose == .workAuthorization && !form.isOff)
        #expect(form.quoteId == nil)
        // The default (inspection acknowledged only) has nothing for this screen.
        let defaults = SignatureForm(.signature(quoteId: nil), settings: [:], customerName: nil)
        #expect(defaults.isOff && defaults.purpose == nil && defaults.heading == nil)
    }

    @Test func theReviewSignsOffWithEveryPurposeButWorkAuthorization() {
        let on: JSONValue = [
            "signature_purposes": ["inspection_ack": true, "work_authorization": true, "completion": true]
        ]
        let form = SignatureForm(.review, settings: on, customerName: nil)
        #expect(form.purposes.map(\.value) == [.inspectionAck, .completion])
        #expect(form.purposes.map(\.label) == ["Inspection acknowledged", "Work completed"])
        #expect(form.showsPicker && form.pickerLabel == "Signing for" && form.purpose == .inspectionAck)
        #expect(SignatureForm(.review, settings: nil, customerName: nil).purposes.map(\.value) == [.inspectionAck])
        let off: JSONValue = ["signature_purposes": ["inspection_ack": false, "work_authorization": true]]
        #expect(SignatureForm(.review, settings: off, customerName: nil).isOff)
    }
}

@Suite @MainActor struct SignatureValidationTests {
    @Test func theSignatureScreenAsksForAPurposeANameAndInk() {
        let on: JSONValue = ["signature_purposes": ["work_authorization": true]]
        var form = SignatureForm(.signature(quoteId: nil), settings: on, customerName: "Dana Whitfield")
        #expect(form.nameLabel == "Signer’s name" && form.nameText == "Dana Whitfield")
        let valid1 = form.validate()
        #expect(!valid1 && form.error == "Ask them to sign in the box.")
        form.draw([[SIMD2(0, 0), SIMD2(30, 0)]])  // a tap, not a signature
        #expect(form.error == nil && form.canClear)
        #expect(form.problem == "Ask them to sign in the box.")
        form.draw(scribble)
        form.nameText = "   "
        let valid2 = form.validate()
        #expect(!valid2 && form.error == "Enter the signer’s name.")
        form.nameText = " Pat Lee "
        let valid3 = form.validate()
        #expect(form.signer == "Pat Lee" && valid3 && form.error == nil)
        form.purpose = nil
        let valid4 = form.validate()
        #expect(!valid4 && form.error == "Choose what this signature is for.")
        form.clear()
        #expect(form.strokes.isEmpty && !form.canClear)
    }

    @Test func theReviewUsesTheCustomersOwnWords() {
        var form = SignatureForm(.review, settings: nil, customerName: nil)
        #expect(form.nameLabel == "Your name" && form.nameText == "")
        let valid5 = form.validate()
        #expect(!valid5 && form.error == "Enter your name.")
        form.nameText = "Dana"
        let valid6 = form.validate()
        #expect(!valid6 && form.error == "Sign in the box with your finger.")
        form.draw(scribble)
        let valid7 = form.validate()
        #expect(valid7)
        #expect(SignatureForm.rolePlaceholder == "Homeowner, property manager…")
    }

    @Test func theSignerFollowsTheCustomerUntilANameIsTyped() {
        var form = SignatureForm(.review, settings: nil, customerName: "Dana")
        form.customerName = "Dana Whitfield"
        #expect(form.nameText == "Dana Whitfield")
        form.nameText = "Sam"
        form.customerName = "Someone Else"
        #expect(form.nameText == "Sam")
    }
}

@Suite @MainActor struct SaveSignatureTests {
    @Test func aSignatureIsSavedWithItsRowSvgAndUploadTicket() throws {
        let b = try SignatureBench()
        let on: JSONValue = ["signature_purposes": ["work_authorization": true]]
        var form = try #require(SignatureForm.forJob(.signature(quoteId: nil), b.store, jobId: "j1", settings: on))
        #expect(form.nameText == "Dana Whitfield")
        #expect(SignatureForm.forJob(.review, b.store, jobId: "nope", settings: nil) == nil)
        form.role = "  "
        form.draw(scribble)
        let valid8 = form.validate()
        #expect(valid8)
        let id = try form.save(b.sync, companyId: "c1", jobId: "j1", at: Coordinate(latitude: 33.4, longitude: -111.8))

        let row = try #require(try b.store.get("signature", id))
        #expect(row["job_id"] == "j1" && row["quote_id"] == .null && row["purpose"] == "work_authorization")
        #expect(row["signer_name"] == "Dana Whitfield" && row["signer_role"] == .null)
        #expect(row["image_path"] == .string("c1/j1/signature-\(id).svg"))
        #expect(row["latitude"] == .number(33.4) && row["longitude"] == .number(-111.8))
        #expect(row["device_id"] == .string(b.store.deviceId))
        #expect(row["signed_at"]?.string?.hasSuffix("Z") == true)
        #expect(b.sync.hasPendingWrites("signature", id))

        // The drawing, as Expo's signatureSvg writes it, under media/.
        let svg = try String(
            contentsOf: b.bench.root.appendingPathComponent("media/signature-\(id).svg"), encoding: .utf8)
        #expect(svg == (try signatureSvg(scribble)))
        #expect(svg.hasPrefix("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"14 84 152 52\""))
        #expect(svg.contains("<path d=\"M20 120L60 90L100 130L140.3 95.5\"/><path d=\"M160 110l0.1 0\"/>"))

        let queue = try b.bench.queue()
        #expect(queue.count == 1)
        let ticket = try #require(queue.first)
        #expect(text(ticket["media_id"]) == id && text(ticket["record_table"]) == "signature")
        #expect(text(ticket["local_path"]) == "media/signature-\(id).svg")
        #expect(text(ticket["storage_path"]) == "c1/j1/signature-\(id).svg")
        #expect(text(ticket["mime_type"]) == "image/svg+xml" && text(ticket["company_id"]) == "c1")
    }

    @Test func aQuoteAcceptanceKeepsTheQuoteRoleAndNoLocation() throws {
        let b = try SignatureBench()
        var form = try #require(SignatureForm.forJob(.signature(quoteId: "q1"), b.store, jobId: "j1", settings: nil))
        form.nameText = "  Pat Lee "
        form.role = " Property manager "
        form.draw(scribble)
        let id = try form.save(b.sync, companyId: "c1", jobId: "j1", at: nil)
        let row = try #require(try b.store.get("signature", id))
        #expect(row["quote_id"] == "q1" && row["purpose"] == "quote_acceptance")
        #expect(row["signer_name"] == "Pat Lee" && row["signer_role"] == "Property manager")
        #expect(row["latitude"] == .null && row["longitude"] == .null)
    }
}

@Suite @MainActor struct ReviewScreenTests {
    /// "Tests we ran" (owner, 2026-10-19): every test, pass or fail, after What we checked, with
    /// where, the result and a pill; hidden with no tests.
    @Test func theReportListsEveryTestAfterWhatWeChecked() throws {
        let b = try SignatureBench()
        try b.seedInspection(allDone: true)
        try b.seed([
            (
                "test_type",
                [
                    "id": "tt-dye", "company_id": "c1", "key": "dye", "name": "Dye test", "sort_order": 20,
                    "schema_version": 1, "active": true, "result_options": ["pass", "fail", "inconclusive"],
                    "field_schema": [
                        "fields": [
                            ["key": "result", "label": "Result", "type": "text"],
                            ["key": "spots", "label": "Spots", "type": "number"],
                        ]
                    ],
                ]
            ),
            (
                "test_result",
                [
                    "id": "t2", "company_id": "c1", "job_id": "j1", "test_type_id": "tt-dye", "schema_version": 1,
                    "job_component_id": "jc2", "data": ["result": "No draw", "spots": 2], "computed": [:],
                    "outcome": "pass", "performed_at": "2026-10-19T16:10:00.000Z",
                ]
            ),
            (
                "test_result",
                [
                    "id": "t3", "company_id": "c1", "job_id": "j1", "test_type_id": "tt-dye", "schema_version": 1,
                    "data": ["result": "", "spots": 0], "computed": [:], "performed_at": "2026-10-19T16:20:00.000Z",
                ]
            ),
        ])
        try b.seedDraft(sections: [
            ["key": "summary", "title": "Summary", "text": "We found one leak."],
            ["key": "findings", "title": "What we found", "text": "The return line is broken."],
            ["key": "next_steps", "title": "What happens next", "text": "Repair the line."],
        ])
        let s = try b.summary()
        let byId = Dictionary(uniqueKeysWithValues: s.tests.map { ($0.id, $0) })
        #expect(byId["t1"]?.pill == TestOutcomeLabel(label: "Fail", tone: .leaking))
        #expect(byId["t2"]?.place == "Skimmer" && byId["t2"]?.result == "No draw, 2")
        #expect(byId["t2"]?.pill.label == "Pass")
        #expect(byId["t3"]?.pill == TestOutcomeLabel(label: "Recorded", tone: .pending) && byId["t3"]?.result == nil)
        let kinds = s.blocks.map { block -> String in
            switch block {
            case .section(let section): section.key
            case .findings: "findings"
            case .coverage: "coverage"
            case .tests(let title, _, let lines): "tests:\(title):\(lines.count)"
            }
        }
        #expect(kinds == ["summary", "findings", "next_steps", "coverage", "tests:Tests we ran:3"])
        #expect(ReviewSummary.testColumns == ["Test", "Where", "Result", "Outcome"])
        #expect(reportTestResult(nil, ["b": .string("x"), "a": .number(3)]) == "3, x")
    }

    @Test func noTestsNoTestsBlock() throws {
        let b = try SignatureBench()
        let s = try b.summary()
        #expect(s.tests.isEmpty)
        #expect(!s.blocks.contains { if case .tests = $0 { true } else { false } })
        #expect(s.blocks.contains { if case .coverage = $0 { true } else { false } })
    }

    /// A repair's report is about the work (owner, 2026-10-22): the Repair Report, with no
    /// checklist tally, as the website.
    @Test func aRepairIsTheRepairReportWithNoChecklist() throws {
        let b = try SignatureBench(jobType: "repair")
        let s = try b.summary()
        #expect(s.title == "Repair Report")
        #expect(!s.blocks.contains { if case .coverage = $0 { true } else { false } })
    }

    @Test func theSummaryShowsTheTallyFindingsTestsAndStatement() throws {
        let b = try SignatureBench()
        try b.seedInspection(allDone: false)
        let s = try b.summary()
        #expect(s.title == "Leak Detection Report" && s.customerText == "Dana Whitfield")
        #expect(s.address == "1 Main St, Mesa, AZ 85201")
        #expect(s.tallyText == "1 leaking")
        #expect(s.pendingText == "1 still to do")
        #expect(s.pendingNotice == "1 checklist item is still to do. Finish the checklist, then come back to sign.")
        #expect(!s.showsSignOff && !s.showsButtons)
        // Oldest first; a severity no longer configured and a blank location are left out.
        #expect(s.findings.map(\.title) == ["1. Cracked tile", "2. Return 3 line break"])
        #expect(s.findings.map(\.detail) == ["", "Major · Return 3 · 6 ft from the pad"])
        #expect(s.tests == [ReviewSummary.TestLine(id: "t1", name: "Pressure test", outcome: .fail)])
        // No draft yet: the summary is added later.
        #expect(s.sections.isEmpty && s.draftId == nil)
        #expect(
            ReviewSummary.summaryLater
                == "The written summary is added before the report is sent. Below is what was checked and found today.")
        #expect(
            s.statement(.inspectionAck)
                == "I confirm Demo Leak Co. inspected the pool at 1 Main St, Mesa, AZ 85201 today and explained what they found."
        )
        #expect(
            s.statement(.completion) == "I confirm Demo Leak Co. finished the work at 1 Main St, Mesa, AZ 85201 today.")
        #expect(ReviewSummary(b.store, companyId: "c1", companyName: "X", settings: nil, jobId: "nope") == nil)
    }

    @Test func aDoneChecklistOffersSignAndCustomerNotHereWithTheDraftsSections() throws {
        let b = try SignatureBench()
        try b.seedInspection(allDone: true)
        try b.seedDraft(sections: [
            ["key": "summary", "title": "Summary", "text": "We found one leak."],
            ["key": "next", "title": "Next steps", "text": "  "],
        ])
        let s = try b.summary()
        #expect(s.pendingText == nil && s.pendingNotice == nil && s.showsSignOff && s.showsButtons)
        #expect(s.tallyText == "1 leaking · 1 not applicable")
        #expect(s.sections.map(\.title) == ["Summary"] && s.draftId == "rep1")
        #expect(s.signTitle == "Sign" && s.showsCustomerNotHere)
        #expect(s.purposes.map(\.value) == [.inspectionAck])
        // Signatures off: Finish Report, no pad and no Customer Not Here.
        let off = try b.summary(["signature_purposes": ["inspection_ack": false]])
        #expect(off.signTitle == "Finish Report" && !off.showsSignOff && !off.showsCustomerNotHere && off.showsButtons)
    }

    @Test func aMaintenanceVisitIsAServiceReport() throws {
        let b = try SignatureBench(jobType: "maintenance")
        try b.seedInspection(allDone: true)
        let s = try b.summary()
        #expect(s.title == "Service Report")
        #expect(s.tallyText == "1 skipped")
    }

    @Test func theStatementLeavesOutAMissingAddress() throws {
        let b = try SignatureBench()
        try b.seed([("job", ["id": "j1", "company_id": "c1", "type": "detection", "status": "in_progress"])])
        let s = try b.summary()
        #expect(s.address == "" && s.customerText == "Customer")
        #expect(
            s.statement(.inspectionAck)
                == "I confirm Demo Leak Co. inspected the pool today and explained what they found.")
    }
}

@Suite @MainActor struct ReviewFinishTests {
    fileprivate func run(
        _ b: SignatureBench, _ form: inout SignatureForm, away: Bool, calls: FinishCalls,
        settings: JSONValue? = nil
    ) async throws -> ReviewFinish.Result {
        let summary = try b.summary(settings)
        return await ReviewFinish.run(
            &form, customerAway: away, summary: summary, sync: b.sync, companyId: "c1", jobId: "j1",
            location: { Coordinate(latitude: 1, longitude: 2) }, finish: calls.finish)
    }

    @Test func customerNotHereFinishesTheDraftWithoutASignature() async throws {
        let b = try SignatureBench()
        try b.seedInspection(allDone: true)
        try b.seedDraft()
        let calls = FinishCalls()
        var form = SignatureForm(.review, settings: nil, customerName: "Dana Whitfield")
        #expect(try await run(b, &form, away: true, calls: calls) == .back)
        #expect(calls.calls.map(\.0) == ["rep1"] && calls.calls.map(\.1) == [true])
        #expect(try b.signatures().isEmpty && form.error == nil)
    }

    @Test func customerNotHereNeedsTheDraftAndSaysWhyItCouldNotFinish() async throws {
        let b = try SignatureBench()
        try b.seedInspection(allDone: true)
        let calls = FinishCalls()
        var form = SignatureForm(.review, settings: nil, customerName: nil)
        #expect(try await run(b, &form, away: true, calls: calls) == .stay)
        #expect(form.error == "Write the draft first, then finish it here." && calls.calls.isEmpty)

        try b.seedDraft()
        calls.failure = "No connection. Try again when you have signal."
        #expect(try await run(b, &form, away: true, calls: calls) == .stay)
        #expect(form.error == "No connection. Try again when you have signal.")
        #expect(try b.signatures().isEmpty)
    }

    @Test func signingSavesFirstThenFinishesOrGoesBackWhenOffline() async throws {
        let b = try SignatureBench()
        try b.seedInspection(allDone: true)
        let calls = FinishCalls()
        var form = SignatureForm(.review, settings: nil, customerName: "Dana Whitfield")

        // Not signed: nothing saved.
        #expect(try await run(b, &form, away: false, calls: calls) == .stay)
        #expect(try form.error == "Sign in the box with your finger." && b.signatures().isEmpty)

        // Before the draft exists: kept on the phone, finished from the Report tab later.
        form.draw(scribble)
        #expect(try await run(b, &form, away: false, calls: calls) == .back)
        #expect(calls.calls.isEmpty)
        let first = try #require(try b.signatures().first)
        #expect(first["purpose"] == "inspection_ack" && first["signer_name"] == "Dana Whitfield")
        #expect(first["quote_id"] == .null && first["latitude"] == .number(1) && first["longitude"] == .number(2))

        // With the draft but no signal: still goes back, signed.
        try b.seedDraft()
        calls.failure = "The signature or your edits haven’t reached the server yet. Finish when you have signal."
        #expect(try await run(b, &form, away: false, calls: calls) == .back)
        #expect(try calls.calls.map(\.1) == [false] && b.signatures().count == 2 && form.error == nil)

        // Online: finished.
        calls.failure = nil
        #expect(try await run(b, &form, away: false, calls: calls) == .back)
        #expect(try calls.calls.count == 2 && b.signatures().count == 3)
    }

    @Test func withSignaturesOffFinishReportSavesNoSignature() async throws {
        let b = try SignatureBench()
        try b.seedInspection(allDone: true)
        try b.seedDraft()
        let calls = FinishCalls()
        let off: JSONValue = ["signature_purposes": ["inspection_ack": false]]
        var form = SignatureForm(.review, settings: off, customerName: nil)
        #expect(try await run(b, &form, away: false, calls: calls, settings: off) == .back)
        #expect(try calls.calls.map(\.1) == [false] && b.signatures().isEmpty)
    }
}

/// "Require a pool photo to finish a job" at the sign-off (owner, 2026-10-19).
@Suite @MainActor struct ReviewFinishPhotoTests {
    @Test func theSignOffStopsBeforeSavingUntilTheJobHasAPhoto() async throws {
        let b = try SignatureBench()
        try b.seedInspection(allDone: true)
        try b.seedDraft()
        let calls = FinishCalls()
        let settings: JSONValue = ["require_finish_photo": true]
        var form = SignatureForm(.review, settings: nil, customerName: "Dana Whitfield")
        form.draw(scribble)
        let summary = try b.summary()
        let block = finishPhotoBlock(b.store, settings: settings, jobId: "j1")
        #expect(block == "Take a photo of the pool before finishing this job.")
        for away in [false, true] {
            let result = await ReviewFinish.run(
                &form, customerAway: away, summary: summary, sync: b.sync, companyId: "c1", jobId: "j1",
                photoBlock: block, location: { nil }, finish: calls.finish)
            #expect(result == .stay)
            #expect(form.error == finishPhotoMessage)
        }
        // Nothing saved or sent: the customer signs once, after the photo.
        #expect(try b.signatures().isEmpty && calls.calls.isEmpty)

        // A photo taken on this phone (still waiting to upload) clears it.
        try b.sync.write("media", id: "m1", companyId: "c1", ["job_id": "j1", "kind": "photo"])
        #expect(finishPhotoBlock(b.store, settings: settings, jobId: "j1") == nil)
        let result = await ReviewFinish.run(
            &form, customerAway: false, summary: summary, sync: b.sync, companyId: "c1", jobId: "j1",
            photoBlock: finishPhotoBlock(b.store, settings: settings, jobId: "j1"), location: { nil },
            finish: calls.finish)
        #expect(result == .back && calls.calls.map(\.0) == ["rep1"])
        #expect(try b.signatures().count == 1)
    }
}
