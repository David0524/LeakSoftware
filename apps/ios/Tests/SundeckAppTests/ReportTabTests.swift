import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

// S6: the job's Report tab. What it shows in each state, the template choice, section edits,
// recipients, and the draft, finish and send flows through ReportServer with a stubbed server.

private let hlc = "1760000000000-0000-srv"

/// The website's API stand-in: replies by request path, per test host.
final class StubServer: URLProtocol, @unchecked Sendable {
    struct Reply {
        var status: Int
        var body: JSONValue
    }

    nonisolated(unsafe) static var replies: [String: [String: Reply]] = [:]
    nonisolated(unsafe) static var requests: [String: [(path: String, body: JSONValue)]] = [:]
    static let lock = NSLock()

    static func set(_ host: String, _ path: String, _ status: Int, _ body: JSONValue) {
        lock.withLock { replies[host, default: [:]][path] = Reply(status: status, body: body) }
    }

    static func calls(_ host: String) -> [(path: String, body: JSONValue)] {
        lock.withLock { requests[host] ?? [] }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let host = request.url?.host ?? ""
        let path = request.url?.path ?? ""
        var data = request.httpBody
        if data == nil, let stream = request.httpBodyStream {
            stream.open()
            var bytes = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                bytes.append(buffer, count: n)
            }
            stream.close()
            data = bytes
        }
        let body = data.flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) } ?? .null
        let reply: Reply? = Self.lock.withLock {
            Self.requests[host, default: []].append((path, body))
            return Self.replies[host]?[path]
        }
        let status = reply?.status ?? 404
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: (try? JSONEncoder().encode(reply?.body ?? [:])) ?? Data())
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@MainActor
private struct ReportJob {
    let shell: Shell
    let host = "r\(UUID().uuidString.prefix(8).lowercased()).test"
    var sync: SyncService { shell.sync }
    var store: LocalStore { shell.sync.store }

    init(type: String = "detection", settings: JSONValue = [:], rows extra: [(String, JSONValue)] = []) throws {
        shell = try Shell()
        try shell.seedCompany(userId: "u1", settings: settings)
        let seeded: [(String, JSONValue)] =
            [
                (
                    "customer",
                    [
                        "id": "cu1", "company_id": "c1", "name": "Pat Doe", "email": "pat@home.test",
                        "phone": "(602) 555-0100", "cc_emails": ["spouse@home.test"],
                    ]
                ),
                (
                    "property",
                    [
                        "id": "p1", "company_id": "c1", "customer_id": "cu1", "address_line1": "1 Main St",
                        "has_pool": true,
                    ]
                ),
                (
                    "job",
                    [
                        "id": "j1", "company_id": "c1", "property_id": "p1", "type": .string(type),
                        "status": "in_progress",
                    ]
                ),
                (
                    "report_template",
                    ["id": "rt1", "company_id": "c1", "key": "homeowner", "name": "Homeowner report", "enabled": true]
                ),
                (
                    "report_template",
                    ["id": "rt2", "company_id": "c1", "key": "partner", "name": "Partner report", "enabled": true]
                ),
            ] + extra
        try pull(seeded)
    }

    func pull(_ seeded: [(String, JSONValue)]) throws {
        var rows: [PulledRow] = []
        for (i, (table, row)) in seeded.enumerated() {
            guard case .object(let object) = row else { continue }
            rows.append(PulledRow(table: table, xid: String(i + 10), row: object))
        }
        try store.applyPage(PullPage(rows: rows, done: true, cursor: [:], serverHLC: hlc))
    }

    var job: JobView { try! jobViews(store, companyId: "c1").first { $0.id == "j1" }! }

    func model(online: Bool = true, settings: JSONValue? = nil) -> ReportTabModel {
        ReportTabModel(
            store: store, companyId: "c1", settings: settings, job: job, online: online,
            webURL: URL(string: "https://sundeck.test")!, timeZone: TimeZone(identifier: "UTC")!,
            locale: Locale(identifier: "en_US"), now: parseISODate("2026-10-20T12:00:00Z")!)
    }

    var server: ReportServer {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubServer.self]
        var api = WebAPI(baseURL: URL(string: "https://\(host)")!) { "token" }
        api.session = URLSession(configuration: config)
        return ReportServer(sync: sync, api: api)
    }

    func flow() -> ReportFlow { ReportFlow(sync: sync, companyId: "c1", jobId: "j1") }

    /// Pending local fields for a row, by name.
    func pendingFields(_ table: String, _ id: String) throws -> Set<String> {
        let rows = try store.database.query(
            "select fields from sync_outbox where status = 'pending' and table_name = ? and row_id = ?",
            [.text(table), .text(id)])
        var keys: Set<String> = []
        for row in rows {
            guard case .text(let text)? = row["fields"],
                let value = try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)),
                case .object(let object) = value
            else { continue }
            keys.formUnion(object.keys)
        }
        return keys
    }
}

private func report(
    _ id: String, version: Int, status: String, template: String = "homeowner", sections: JSONValue = .null,
    problems: [String] = [], sentAt: JSONValue = .null
) -> (String, JSONValue) {
    (
        "report",
        [
            "id": .string(id), "company_id": "c1", "job_id": "j1", "template_key": .string(template),
            "version": .number(Double(version)), "status": .string(status), "final_sections": sections,
            "ai_draft": ["problems": .array(problems.map { ["message": .string($0)] })], "model": "plain",
            "sent_at": sentAt,
        ]
    )
}

private let twoSections: JSONValue = [
    ["key": "summary", "title": "Summary", "text": "We tested the pool."],
    ["key": "next_steps", "title": "Next steps", "text": "Repair the return line."],
]

private func signature(_ id: String, _ name: String, purpose: String = "inspection_ack", reportId: JSONValue = .null)
    -> (String, JSONValue)
{
    (
        "signature",
        [
            "id": .string(id), "company_id": "c1", "job_id": "j1", "purpose": .string(purpose),
            "signer_name": .string(name), "signed_at": "2026-10-19T14:05:00.000Z", "report_id": reportId,
        ]
    )
}

@Suite @MainActor struct ReportTabStateTests {
    @Test func withNoDraftTheTabOffersWriteDraftAndReview() throws {
        let s = try ReportJob()
        let m = s.model()
        #expect(m.online)
        #expect(m.draft == nil)
        #expect(!m.hasDraftText)
        #expect(m.writeTitle == "Write Draft")
        #expect(m.writeIsPrimary)
        #expect(m.showsReviewBeforeDraft)
        #expect(m.signatures.isEmpty)
        #expect(
            ReportTabModel.noSignatures
                == "None yet. The customer signs at the end of the report: write the draft, then Review with Customer.")
        #expect(m.templateName == "Homeowner report")
        #expect(m.collapsedText == nil)
        #expect(m.viewLatest == nil)
        #expect(m.problemsText == nil)
        #expect(m.finishTitle == nil)
        #expect(m.finishedTitle == nil)
        #expect(m.versions.isEmpty)
        #expect(m.pdfURL() == nil)
    }

    /// A repair's report is the Repair Report (owner, 2026-10-22), as the website.
    @Test func aRepairJobsReportIsTheRepairReport() throws {
        #expect(try ReportJob(type: "repair").model().templateName == "Repair Report")
        #expect(try ReportJob(type: "inspection").model().templateName == "Pool Inspection Report")
    }

    @Test func withoutTheServerTheTabSaysToUseTheWebsite() throws {
        let m = try ReportJob().model(online: false)
        #expect(!m.online)
        #expect(
            ReportTabModel.offlineNotice
                == "This app isn’t connected to the Sundeck Pro server, so reports can’t be written here. Use the office website."
        )
    }

    @Test func aDraftWithProblemsListsThemAndOffersReviewToFinish() throws {
        let s = try ReportJob(rows: [
            report(
                "r2", version: 2, status: "draft", sections: twoSections,
                problems: ["A number isn’t in the tests.", "Name the leak."])
        ])
        let m = s.model()
        #expect(m.hasDraftText)
        #expect(m.writeTitle == "Write the Draft Again")
        #expect(!m.writeIsPrimary)
        #expect(!m.showsReviewBeforeDraft)
        #expect(m.sections.map(\.title) == ["Summary", "Next steps"])
        #expect(m.problemsText == "Check these before sending:\n• A number isn’t in the tests.\n• Name the leak.")
        #expect(m.finishTitle == "Finish version 2")
        #expect(!m.finishesWithSignature)
        #expect(
            m.finishNote
                == "Hand the phone to the customer to read and sign. Signing locks this version."
        )
        #expect(m.collapsedText == "Draft version 2.")
        #expect(ReportTabModel.sendWithoutSignature == "Send Without a Signature")
        #expect(ReportTabModel.sendWithoutSignatureNote == "Sending locks this version.")
    }

    @Test func aSignatureNotYetOnAVersionTurnsTheButtonIntoFinishReport() throws {
        let s = try ReportJob(rows: [
            report("r1", version: 1, status: "draft", sections: twoSections),
            signature("s1", "Pat Doe"),
            signature("s2", "Lee Doe", purpose: "quote_acceptance"),
            signature("s3", "Old Signer", reportId: "r0"),
        ])
        let m = s.model()
        #expect(m.finishesWithSignature)
        #expect(
            m.finishNote
                == "Signed by Pat Doe. Finish the report to lock this version with the signature.")
        #expect(m.signatures.map(\.name) == ["Pat Doe", "Lee Doe", "Old Signer"])
        // The website's schedule format, in the shop's time zone.
        #expect(m.signatures[0].subtitle == "Inspection acknowledged · Mon, Oct 19, 2:05 PM")
        #expect(m.signatures[0].role == nil)
        #expect(m.signatures[1].subtitle.hasPrefix("Quote accepted · "))
        #expect(m.signatures[0].removeTitle == "Remove Pat Doe’s signature?")
        #expect(m.signatures[0].removeLabel == "Remove signature of Pat Doe")
    }

    @Test func sentVersionsAreNewestFirstWithReplacedOnesMarked() throws {
        let s = try ReportJob(rows: [
            report("r1", version: 1, status: "superseded", sections: twoSections, sentAt: "2026-10-17T15:00:00.000Z"),
            report("r3", version: 3, status: "draft", sections: twoSections),
            report("r2", version: 2, status: "sent", sections: twoSections, sentAt: "2026-10-18T15:00:00.000Z"),
            ("share_link", ["id": "l1", "company_id": "c1", "job_id": "j1", "report_id": "r2", "token": "tok2"]),
            ("share_link", ["id": "l0", "company_id": "c1", "job_id": "j1", "report_id": "r1", "token": "tok1"]),
            (
                "share_link",
                [
                    "id": "lx", "company_id": "c1", "job_id": "j1", "report_id": "r1", "token": "old",
                    "revoked_at": "2026-10-18T00:00:00.000Z",
                ]
            ),
        ])
        let m = s.model()
        #expect(m.draft?.id == "r3")
        #expect(m.finished?.id == "r2")
        #expect(m.finishedTitle == "Version 2 is finished")
        #expect(!m.finishedEmailIsPrimary)
        #expect(ReportTabModel.finishedNote == "Send it to the customer, or download the PDF.")
        #expect(
            m.versions.map(\.label) == [
                "Version 2 · Oct 18, 2026, 3:00 PM", "Version 1 · Oct 17, 2026, 3:00 PM · replaced",
            ])
        #expect(m.viewLatest?.id == "r2")
        #expect(m.versions[1].pdfURL?.absoluteString == "https://sundeck.test/r/tok1/pdf")
        #expect(m.versions.map(\.superseded) == [false, true])
        #expect(
            m.versions.map(\.url?.absoluteString) == ["https://sundeck.test/r/tok2", "https://sundeck.test/r/tok1"])
        #expect(m.versions[0].viewLabel == "View version 2")
        #expect(
            m.pdfURL(webURL: URL(string: "https://sundeck.test")!)?.absoluteString == "https://sundeck.test/r/tok2/pdf")
    }

    @Test func aFinishedReportWithNoDraftMakesEmailTheMainAction() throws {
        let s = try ReportJob(rows: [report("r1", version: 1, status: "sent", sections: twoSections)])
        let m = s.model()
        #expect(m.draft == nil)
        #expect(m.finishedEmailIsPrimary)
        #expect(m.writeTitle == "Write Draft")
        #expect(m.versions.map(\.label) == ["Version 1"])
        #expect(m.versions[0].url == nil)
    }

    @Test func theTemplateIsTheHomeownerReportUnlessTheShopTurnedItOff() throws {
        let s = try ReportJob()
        let m = s.model()
        // The partner report is gone from the phone, even where it's on.
        #expect(m.templates.map(\.value) == [.homeowner])
        #expect(m.templates[0].name == "Homeowner report")
        #expect(!m.showsTemplatePicker)
        try s.pull([
            (
                "report_template",
                ["id": "rt1", "company_id": "c1", "key": "homeowner", "name": "Homeowner report", "enabled": false]
            )
        ])
        #expect(s.model().templates.isEmpty)
    }

    @Test func theShopsWorkAuthorizationAddsTheSignButton() throws {
        let s = try ReportJob(type: "maintenance")
        #expect(!s.model().ownSheet)
        let on: JSONValue = ["signature_purposes": ["inspection_ack": true, "work_authorization": true]]
        #expect(s.model(settings: on).ownSheet)
        #expect(ReportTabModel.signWorkAuthorization == "Sign Work Authorization")
    }
}

@Suite @MainActor struct ReportTabWriteTests {
    @Test func savingAnEditWritesOnlyFinalSections() throws {
        let s = try ReportJob(rows: [report("r1", version: 1, status: "draft", sections: twoSections)])
        let f = s.flow()
        let section = try #require(s.model().sections.first)
        #expect(f.sectionText(section) == "We tested the pool.")
        f.edits["summary"] = "  We pressure tested every line.  "
        #expect(f.sectionText(section) == "  We pressure tested every line.  ")
        f.saveEdits()
        #expect(f.edits.isEmpty)
        #expect(try s.pendingFields("report", "r1") == ["final_sections"])
        let m = s.model()
        #expect(m.sections.map(\.text) == ["We pressure tested every line.", "Repair the return line."])
        #expect(m.sections.map(\.key) == ["summary", "next_steps"])
    }

    @Test func savingByItselfKeepsWhatIsBeingTyped() throws {
        // A pause after "held. ": the saved text is trimmed, but the field keeps the space (and a
        // new line) so the next word isn't run on.
        let s = try ReportJob(rows: [report("r1", version: 1, status: "draft", sections: twoSections)])
        let f = s.flow()
        let section = try #require(s.model().sections.first)
        f.edits["summary"] = "Pressure held. "
        f.saveEdits(keepTyping: true)
        #expect(s.model().sections.first?.text == "Pressure held.")
        #expect(f.sectionText(section) == "Pressure held. ")
        // Saving again with nothing new writes nothing.
        let pending = try s.store.pendingCount()
        f.saveEdits(keepTyping: true)
        f.saveEdits()
        #expect(try s.store.pendingCount() == pending)
        #expect(f.edits.isEmpty)
        // Typed back to what's saved: no write either.
        f.edits["summary"] = "Pressure held."
        f.saveEdits()
        #expect(try s.store.pendingCount() == pending)
    }

    @Test func aSentReportIsNeverEdited() throws {
        let s = try ReportJob(rows: [report("r1", version: 1, status: "sent", sections: twoSections)])
        let f = s.flow()
        f.edits["summary"] = "Changed"
        f.saveEdits()
        #expect(f.edits.isEmpty)
        #expect(try s.pendingFields("report", "r1").isEmpty)
        #expect(s.model().finished?.finalSections?.first?.text == "We tested the pool.")
    }

    @Test func recipientsComeFromTheCustomerAndOtherEmailsAreSavedOnIt() throws {
        let s = try ReportJob()
        let m = s.model()
        let f = s.flow()
        #expect(m.hasCustomer)
        #expect(f.emailText(m) == "pat@home.test")
        #expect(f.otherEmailsText(m) == "spouse@home.test")
        // Unchanged: nothing written.
        f.otherEmails = "spouse@home.test"
        f.saveOtherEmails()
        #expect(try s.pendingFields("customer", "cu1").isEmpty)
        f.otherEmails = "spouse@home.test, not-an-email; agent@realty.test"
        f.saveOtherEmails()
        #expect(f.otherEmails == nil)
        #expect(try s.pendingFields("customer", "cu1") == ["cc_emails"])
        #expect(s.model().customerOtherEmails == "spouse@home.test agent@realty.test")
        f.to = "other@home.test"
        #expect(f.emailText(m) == "other@home.test")
    }

    @Test func removingASignatureTakesItOffTheList() throws {
        let s = try ReportJob(rows: [signature("s1", "Pat Doe")])
        s.flow().removeSignature("s1")
        #expect(s.model().signatures.isEmpty)
        #expect(try s.pendingFields("signature", "s1") == ["deleted_at"])
    }
}

@Suite @MainActor struct ReportTabServerTests {
    /// With the shop's photo rule on (owner, 2026-10-19), Finish Report, Review with Customer and
    /// sending a draft stop with the message (Take Photo shows beside it) until the job has a
    /// photo; a finished version still goes out, as on the website.
    @Test func finishingWaitsForAPoolPhotoWhenTheShopAsks() async throws {
        let settings: JSONValue = ["require_finish_photo": true]
        let s = try ReportJob(
            settings: settings,
            rows: [
                report("r1", version: 1, status: "draft", sections: twoSections),
                report("r0", version: 0, status: "sent", sections: twoSections),
            ])
        try await s.shell.session.signIn(email: "tech@shop.test", password: "right")
        let f = ReportFlow(sync: s.sync, companyId: "c1", jobId: "j1", settings: settings)
        await f.run(.finish, server: s.server)
        #expect(f.error == ReportFlow.Failure(at: .finish, text: finishPhotoMessage) && f.photoNeeded)
        f.to = "pat@home.test"
        await f.run(.email, server: s.server)
        #expect(f.error == ReportFlow.Failure(at: .send, text: finishPhotoMessage) && f.photoNeeded)
        await f.run(.text, reportId: "r1", server: s.server)
        #expect(f.error?.text == finishPhotoMessage)
        #expect(!f.canReview() && f.error == ReportFlow.Failure(at: .finish, text: finishPhotoMessage))
        #expect(StubServer.calls(s.host).isEmpty)

        // A finished version isn't finished again: it sends as it is.
        StubServer.set(
            s.host, "/api/reports/r0/send", 200,
            ["link": "https://sundeck.test/r/tok", "message": "Your report", "emailed": true])
        await f.run(.email, reportId: "r0", server: s.server)
        #expect(f.error == nil && f.message == "Sent to pat@home.test.")

        // A photo taken offline lets it finish.
        try s.sync.write("media", id: "m1", companyId: "c1", ["job_id": "j1", "kind": "photo"])
        #expect(f.canReview() && f.error == nil && !f.photoNeeded)
        StubServer.set(s.host, "/api/reports/r1/finish", 200, ["token": "tok"])
        await f.run(.finish, server: s.server)
        #expect(f.error?.text != finishPhotoMessage)
        #expect(StubServer.calls(s.host).last?.path == "/api/reports/r1/finish")
    }

    @Test func writingTheDraftSaysHowManyThingsToCheck() async throws {
        let s = try ReportJob()
        try await s.shell.session.signIn(email: "tech@shop.test", password: "right")
        StubServer.set(
            s.host, "/api/jobs/j1/reports", 200, ["reportId": "r1", "problems": [["message": "Name the leak."]]])
        // The server's draft comes down with the sync after the call.
        let (_, row) = report("r1", version: 1, status: "draft", sections: twoSections, problems: ["Name the leak."])
        guard case .object(let object) = row else { return }
        s.shell.transport.rows = [PulledRow(table: "report", xid: "99", row: object)]
        let f = s.flow()
        #expect(!f.writeNeedsConfirmation)
        await f.run(.draft, server: s.server)
        #expect(f.busy == nil)
        #expect(f.error == nil)
        #expect(f.message == "Draft written. 1 thing to check below.")
        #expect(StubServer.calls(s.host).first?.body == ["template": "homeowner"])
        #expect(s.model().hasDraftText)
        #expect(f.writeNeedsConfirmation)

        StubServer.set(s.host, "/api/jobs/j1/reports", 200, ["reportId": "r1", "problems": []])
        await f.run(.draft, server: s.server)
        #expect(f.message == "Draft written. Read it over and edit anything before sending.")
    }

    @Test func aServerErrorShowsByTheButtonThatCausedIt() async throws {
        let s = try ReportJob()
        StubServer.set(s.host, "/api/jobs/j1/reports", 400, ["error": "Add a test or finding first."])
        let f = s.flow()
        await f.run(.draft, server: s.server)
        #expect(f.error == ReportFlow.Failure(at: .draft, text: "Add a test or finding first."))
        #expect(f.message == nil)
        StubServer.set(s.host, "/api/jobs/j1/reports", 500, [:])
        await f.run(.draft, server: s.server)
        #expect(f.error?.text == "The server said 500.")
    }

    @Test func sendingWithEditsNotOnTheServerYetSaysSo() async throws {
        let s = try ReportJob(rows: [report("r1", version: 1, status: "draft", sections: twoSections)])
        // No signal: the edit stays in the outbox.
        s.shell.transport.failure = WebAPI.Failure(description: "The network connection was lost.")
        let f = s.flow()
        f.edits["summary"] = "Edited"
        await f.run(.email, server: s.server)
        #expect(
            f.error
                == ReportFlow.Failure(
                    at: .send, text: "Your edits haven’t reached the server yet. Try again with signal."))
        #expect(StubServer.calls(s.host).isEmpty)
        #expect(try s.pendingFields("report", "r1") == ["final_sections"])
    }

    @Test func sendingByEmailNeedsAnAddressAndThenSaysWhereItWent() async throws {
        let s = try ReportJob(rows: [report("r1", version: 1, status: "draft", sections: twoSections)])
        try await s.shell.session.signIn(email: "tech@shop.test", password: "right")
        StubServer.set(
            s.host, "/api/reports/r1/send", 200,
            [
                "link": "https://sundeck.test/r/tok", "message": "Your report: https://sundeck.test/r/tok",
                "emailed": true,
            ])
        let f = s.flow()
        f.to = "nobody"
        await f.run(.email, server: s.server)
        #expect(f.error == ReportFlow.Failure(at: .send, text: "Enter the customer’s email."))
        f.to = " pat@home.test "
        await f.run(.email, server: s.server)
        #expect(f.error == nil)
        #expect(f.message == "Sent to pat@home.test.")
        #expect(StubServer.calls(s.host).last?.body == ["channel": "email", "to": "pat@home.test"])
    }

    @Test func sendingByTextOpensTheShareSheetThenSaysSent() async throws {
        let s = try ReportJob(rows: [report("r1", version: 1, status: "sent", sections: twoSections)])
        try await s.shell.session.signIn(email: "tech@shop.test", password: "right")
        StubServer.set(
            s.host, "/api/reports/r1/send", 200,
            [
                "link": "https://sundeck.test/r/tok", "message": "Demo Leak Co.: https://sundeck.test/r/tok",
                "emailed": false,
            ])
        let f = s.flow()
        await f.run(.text, reportId: "r1", server: s.server)
        #expect(f.share == "Demo Leak Co.: https://sundeck.test/r/tok")
        #expect(f.message == nil)
        #expect(StubServer.calls(s.host).last?.body == ["channel": "sms_device", "to": "(602) 555-0100"])
        f.shareFinished()
        #expect(f.share == nil)
        #expect(f.message == "Report sent.")
    }

    @Test func finishingNeedsTheSignatureOnTheServerFirst() async throws {
        let s = try ReportJob(rows: [
            report("r1", version: 1, status: "draft", sections: twoSections), signature("s1", "Pat Doe"),
        ])
        s.shell.transport.failure = WebAPI.Failure(description: "The network connection was lost.")
        let f = s.flow()
        f.removeSignature("s1")  // a signature write still on the phone
        await f.run(.finish, server: s.server)
        #expect(
            f.error?.text
                == "The signature or your edits haven’t reached the server yet. Finish when you have signal.")
        #expect(f.error?.at == .finish)

        let ok = try ReportJob(rows: [report("r1", version: 1, status: "draft", sections: twoSections)])
        try await ok.shell.session.signIn(email: "tech@shop.test", password: "right")
        StubServer.set(ok.host, "/api/reports/r1/finish", 200, ["token": "tok"])
        let g = ok.flow()
        await g.run(.finish, server: ok.server)
        #expect(g.error == nil)
        #expect(g.message == "Report finished. Send it to the customer below.")
        #expect(StubServer.calls(ok.host).last?.body == ["customerAway": false])
    }
}

/// Saved reports (owner, 2026-10-20) and the step list while a report waits on the server.
@Suite @MainActor struct SavedReportTests {
    private let saved: [(String, JSONValue)] = [
        (
            "saved_report",
            [
                "id": "sr1", "company_id": "c1", "name": "No leak found", "sort_order": 2,
                "sections": ["summary": "We found no leak.", "next_steps": "Repair the return line."],
            ]
        ),
        (
            "saved_report",
            ["id": "sr0", "company_id": "c1", "name": "Return line", "sort_order": 1, "sections": ["findings": "x"]]
        ),
    ]

    @Test func useSavedReportFillsTheSectionsAndAsksFirst() throws {
        let s = try ReportJob(rows: saved + [report("r1", version: 1, status: "draft", sections: twoSections)])
        let list = savedReports(s.store, companyId: "c1")
        #expect(list.map(\.id) == ["sr0", "sr1"])
        #expect(list[1].detail == "Summary, What happens next")
        let f = s.flow()
        // Summary has its own different text: asked about; next_steps already says the same.
        #expect(f.savedReportReplaces(list[1]) == ["Summary"])
        #expect(replaceSavedReportQuestion(f.savedReportReplaces(list[1])) == "Replace the text in Summary?")
        f.useSavedReport(list[1])
        #expect(f.message == "Used “No leak found”. Read it over before sending.")
        let sections = try #require(jobReports(s.store, jobId: "j1").first?.finalSections)
        #expect(sections.map(\.text) == ["We found no leak.", "Repair the return line."])
        #expect(try s.pendingFields("report", "r1") == ["final_sections"])
        // A saved report with nothing for this draft's sections changes nothing.
        #expect(f.savedReportReplaces(list[0]).isEmpty)
    }

    @Test func saveAsSavedReportAndEditThem() throws {
        let s = try ReportJob(rows: saved + [report("r1", version: 1, status: "draft", sections: twoSections)])
        let f = s.flow()
        #expect(throws: WebAPI.Failure(description: "Enter a name.")) { try f.saveAsSavedReport(name: "  ") }
        f.edits["summary"] = "  Pressure held.  "
        try f.saveAsSavedReport(name: " Pressure held ")
        #expect(f.message == "Saved as “Pressure held”.")
        let made = try #require(savedReports(s.store, companyId: "c1").last)
        #expect(made.name == "Pressure held" && made.sortOrder == 3)
        #expect(made.sections == ["summary": "Pressure held.", "next_steps": "Repair the return line."])
        try SavedReportWrites.save(
            s.sync, companyId: "c1", id: made.id, name: "Held", sections: ["summary": "", "findings": " New. "])
        #expect(savedReports(s.store, companyId: "c1").last?.sections == ["findings": "New."])
        try SavedReportWrites.delete(s.sync, id: made.id)
        #expect(savedReports(s.store, companyId: "c1").map(\.id) == ["sr0", "sr1"])
        #expect(savedReportNameProblem(String(repeating: "a", count: 81)) != nil)
    }

    @Test func waitingOnTheServerShowsSteps() async throws {
        let s = try ReportJob()
        try await s.shell.session.signIn(email: "tech@shop.test", password: "right")
        StubServer.set(s.host, "/api/jobs/j1/reports", 200, ["reportId": "r9", "problems": []])
        var server = s.server
        var seen: [Int] = []
        server.onStep = { seen.append($0) }
        _ = try await server.writeDraft(jobId: "j1", template: .homeowner)
        #expect(seen == [0, 1, 2])
        #expect(ReportProgress.steps(.draft) == ["Saving your work", "Writing the report", "Getting it ready"])
        #expect(ReportProgress.spoken(ReportProgress.steps(.draft), 1) == "Writing the report, step 2 of 3")
        let f = s.flow()
        await f.run(.draft, server: s.server)
        #expect(f.busy == nil && f.step == 0 && f.error == nil)
    }
}

/// Finish Report and the sends without signal (owner, 2026-10-20): kept on the phone, run once
/// the signal is back.
@Suite @MainActor struct ReportSendQueueTests {
    func api(_ host: String, offline: Bool = false) -> WebAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [offline ? NoConnection.self : StubServer.self]
        var api = WebAPI(baseURL: URL(string: "https://\(host)")!) { "token" }
        api.session = URLSession(configuration: config)
        return api
    }

    @Test func offlineFinishAndSendsWaitOnThePhone() async throws {
        let s = try ReportJob(rows: [
            report("r1", version: 1, status: "draft", sections: twoSections), signature("s1", "Pat Doe"),
        ])
        let queue = ReportSendQueue(kv: s.sync.kv)
        s.sync.networkChanged(online: false)
        let f = ReportFlow(sync: s.sync, companyId: "c1", jobId: "j1", sends: queue)
        // Still checked on the phone first.
        f.to = "nobody"
        await f.run(.email, server: s.server)
        #expect(f.error == ReportFlow.Failure(at: .send, text: "Enter the customer’s email."))
        f.to = "pat@home.test"
        await f.run(.email, server: s.server)
        #expect(f.error == nil && f.message == ReportSendText.willSend)
        await f.run(.text, reportId: "r1", server: s.server)
        await f.run(.finish, server: s.server)
        #expect(f.message == "Will send when you’re back online.")
        #expect(StubServer.calls(s.host).isEmpty)
        #expect(
            queue.pending(jobId: "j1") == [
                ReportSendRequest(jobId: "j1", reportId: "r1", action: .email, to: "pat@home.test"),
                ReportSendRequest(jobId: "j1", reportId: "r1", action: .text, to: "(602) 555-0100"),
                ReportSendRequest(jobId: "j1", reportId: "r1", action: .finish, to: nil),
            ])
        // Tapped again: the request is replaced, not doubled.
        await f.run(.email, server: s.server)
        #expect(queue.pending.count == 3)

        // Still offline: nothing goes.
        await queue.flush(api(s.host, offline: true))
        #expect(queue.pending.count == 3)

        // Back online: each runs once, in order (the email tapped again went last); the text's
        // message waits for the tech to send.
        StubServer.set(s.host, "/api/reports/r1/finish", 200, ["token": "tok"])
        StubServer.set(
            s.host, "/api/reports/r1/send", 200, ["message": "Shop: https://sundeck.test/r/tok", "emailed": false])
        await queue.flush(api(s.host))
        #expect(queue.pending.isEmpty)
        #expect(
            StubServer.calls(s.host).map(\.path) == [
                "/api/reports/r1/send", "/api/reports/r1/finish", "/api/reports/r1/send",
            ])
        #expect(queue.readyText(jobId: "j1") == "Shop: https://sundeck.test/r/tok")
        #expect(queue.takeReadyText(jobId: "j1") == "Shop: https://sundeck.test/r/tok")
        #expect(queue.readyText(jobId: "j1") == nil)
        #expect(queue.failure(jobId: "j1") == nil)
    }

    @Test func aRefusedRequestIsDroppedAndSaysWhy() async throws {
        let s = try ReportJob(rows: [report("r1", version: 1, status: "sent", sections: twoSections)])
        let queue = ReportSendQueue(kv: s.sync.kv)
        queue.add(ReportSendRequest(jobId: "j1", reportId: "r1", action: .email, to: "pat@home.test"))
        StubServer.set(s.host, "/api/reports/r1/send", 409, ["error": "This report was replaced."])
        await queue.flush(api(s.host))
        #expect(queue.pending.isEmpty && queue.failure(jobId: "j1") != nil)
        // Online, the flow sends straight away as before.
        let f = ReportFlow(sync: s.sync, companyId: "c1", jobId: "j1", sends: queue)
        #expect(f.sends != nil)
    }

    @Test func sendingOnlineForgetsTheSameRequestQueuedOffline() async throws {
        // Send tapped offline (queued); signal back, Send tapped again: one email, not two.
        let s = try ReportJob(rows: [report("r1", version: 1, status: "draft", sections: twoSections)])
        let queue = ReportSendQueue(kv: s.sync.kv)
        s.sync.networkChanged(online: false)
        let f = ReportFlow(sync: s.sync, companyId: "c1", jobId: "j1", sends: queue)
        f.to = "pat@home.test"
        await f.run(.email, server: s.server)
        await f.run(.finish, server: s.server)
        #expect(queue.pending.count == 2)
        s.sync.networkChanged(online: true)
        await s.sync.syncNow()
        #expect(s.sync.status.phase != .offline)
        StubServer.set(s.host, "/api/reports/r1/send", 200, ["message": "Your report", "emailed": true])
        await f.run(.email, server: s.server)
        #expect(f.error == nil && f.message == "Sent to pat@home.test.")
        // The email went; the queued finish of the same report is a different request and stays.
        #expect(queue.pending == [ReportSendRequest(jobId: "j1", reportId: "r1", action: .finish, to: nil)])
        StubServer.set(s.host, "/api/reports/r1/finish", 200, ["token": "tok"])
        await f.run(.finish, server: s.server)
        #expect(queue.pending.isEmpty)
    }

    @Test func aSendWaitsWhileTheJobsPhotosAreUploading() async throws {
        // Online, but a photo of the job is still uploading: the report would miss it, so the
        // send waits on the phone (apps/mobile UploadsPendingError).
        let s = try ReportJob(rows: [report("r1", version: 1, status: "sent", sections: twoSections)])
        try s.sync.write("media", id: "m1", companyId: "c1", ["job_id": "j1", "kind": "photo"])
        _ = try s.store.database.query(
            "insert into upload_queue (media_id, company_id, local_path, storage_path, mime_type, record_table) values ('m1', 'c1', 'media/m1.jpg', 'c1/j1/m1.jpg', 'image/jpeg', 'media')"
        )
        #expect(s.sync.hasPendingUploads(jobId: "j1") && !s.sync.hasPendingUploads(jobId: "j2"))
        let queue = ReportSendQueue(kv: s.sync.kv)
        let f = ReportFlow(sync: s.sync, companyId: "c1", jobId: "j1", sends: queue)
        f.to = "pat@home.test"
        StubServer.set(s.host, "/api/reports/r1/send", 200, ["emailed": true])
        await f.run(.email, reportId: "r1", server: s.server)
        #expect(f.error == nil && f.message == "Will send when the photos finish uploading.")
        #expect(queue.pending == [ReportSendRequest(jobId: "j1", reportId: "r1", action: .email, to: "pat@home.test")])
        #expect(StubServer.calls(s.host).isEmpty)
        // The queue waits for them too, then goes once they're up.
        await queue.flush(api(s.host)) { s.sync.hasPendingUploads(jobId: $0) }
        #expect(queue.pending.count == 1 && StubServer.calls(s.host).isEmpty)
        let visits = VisitReportQueue(kv: s.sync.kv)
        visits.add("j1")
        await visits.flush(api(s.host)) { s.sync.hasPendingUploads(jobId: $0) }
        #expect(visits.pending == ["j1"])
        _ = try s.store.database.query("delete from upload_queue")
        await queue.flush(api(s.host)) { s.sync.hasPendingUploads(jobId: $0) }
        #expect(queue.pending.isEmpty && StubServer.calls(s.host).count == 1)
    }

    @Test func aQueuedTextWaitsWhileTheAppIsInTheBackground() async throws {
        // The phone sends the text itself; run in the background it would count as sent with
        // nobody there to send it.
        let s = try ReportJob(rows: [report("r1", version: 1, status: "sent", sections: twoSections)])
        let queue = ReportSendQueue(kv: s.sync.kv)
        let text = ReportSendRequest(jobId: "j1", reportId: "r1", action: .text, to: "(602) 555-0100")
        let mail = ReportSendRequest(jobId: "j1", reportId: "r1", action: .email, to: "pat@home.test")
        queue.add(text)
        queue.add(mail)
        StubServer.set(s.host, "/api/reports/r1/send", 200, ["message": "Your report", "emailed": true])
        await queue.flush(api(s.host), canText: false)
        #expect(queue.pending == [text])
        #expect(StubServer.calls(s.host).map { $0.body["channel"] } == ["email"])
        await queue.flush(api(s.host), canText: true)
        #expect(queue.pending.isEmpty && queue.readyText(jobId: "j1") == "Your report")
    }
}

/// Wrap-Up's finish list read from the phone's database (owner, 2026-10-22).
@Suite @MainActor struct WrapUpInputTests {
    @Test func theListReadsTheReportSignaturesQuotesAndInvoices() throws {
        var sent = report("r1", version: 1, status: "sent", sections: twoSections, sentAt: "2026-10-19T15:00:00Z")
        if case .object(var row) = sent.1 {
            row["data_snapshot"] = ["sign_off": ["unsigned_reason": "Customer not present"]]
            sent.1 = .object(row)
        }
        let s = try ReportJob(rows: [
            sent,
            signature("s1", "Pat Doe", purpose: "work_authorization"),
            (
                "quote",
                [
                    "id": "q1", "company_id": "c1", "job_id": "j1", "number": 1006, "status": "accepted",
                    "subtotal_cents": 125000, "discount_cents": 0, "tax_cents": 0, "total_cents": 125000,
                    "deposit_cents": 31250,
                ]
            ),
            (
                "payment",
                [
                    "id": "pay1", "company_id": "c1", "quote_id": "q1", "amount_cents": 31250, "method": "card",
                    "status": "succeeded",
                ]
            ),
        ])
        let input = wrapUpInput(store: s.store, companyId: "c1", settings: nil, job: s.job)
        #expect(input.customer == "Pat Doe")
        #expect(input.sentVersion == 1 && !input.hasDraft)
        #expect(input.unsignedReason == "Customer not present")
        // Work authorization is signed before the work: not the report's sign-off.
        #expect(input.signers.isEmpty)
        let list = wrapUp(input)
        #expect(
            list.rows.map(\.detail) == [
                "Sent · version 1", "Accepted · deposit paid", "Not signed: customer not present", "Not started",
            ])
        #expect(list.subtitle == "Pat Doe · 3 of 4 done")
        #expect(list.next?.action == "Send Invoice")
    }
}
