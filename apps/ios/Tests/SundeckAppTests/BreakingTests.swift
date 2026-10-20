import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

// Edge cases found by trying to break the one-handed work (2026-10-20): the offline report
// queue, sign-out, typed money, and what autosave shows while typing.

@Suite @MainActor struct ReportQueueEdgeTests {
    let shell: Shell
    let host = "q\(UUID().uuidString.prefix(8).lowercased()).test"
    var kv: KeyValue { shell.sync.kv }

    init() throws { shell = try Shell() }

    var api: WebAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubServer.self]
        var api = WebAPI(baseURL: URL(string: "https://\(host)")!) { "token" }
        api.session = URLSession(configuration: config)
        return api
    }

    let email = ReportSendRequest(jobId: "j1", reportId: "r1", action: .email, to: "pat@home.test")

    @Test func twoFlushesAtOnceSendOnce() async {
        // Two syncs finishing together (pull to refresh while a scheduled one runs) both flush.
        let queue = ReportSendQueue(kv: kv)
        queue.add(email)
        StubServer.set(host, "/api/reports/r1/send", 200, ["emailed": true])
        async let a: Void = queue.flush(api)
        async let b: Void = queue.flush(api)
        _ = await (a, b)
        #expect(StubServer.calls(host).count == 1)
        #expect(queue.pending.isEmpty)
    }

    @Test func aServerFaultOrExpiredSignInWaitsForTheNextSync() async {
        // The shipping app keeps these (apps/mobile tryAgainLater): 401, 408, 429 and 5xx.
        for status in [401, 408, 429, 500, 503] {
            let queue = ReportSendQueue(kv: kv)
            queue.add(email)
            StubServer.set(host, "/api/reports/r1/send", status, ["error": "Busy"])
            await queue.flush(api)
            #expect(queue.pending == [email], "status \(status)")
            #expect(queue.failure(jobId: "j1") == nil, "status \(status)")
        }
        // A refusal is still final.
        let queue = ReportSendQueue(kv: kv)
        StubServer.set(host, "/api/reports/r1/send", 400, ["error": "This report was replaced."])
        await queue.flush(api)
        #expect(queue.pending.isEmpty && queue.failure(jobId: "j1") == "This report was replaced.")
    }

    @Test func noSignInOnThePhoneWaits() async {
        let queue = ReportSendQueue(kv: kv)
        queue.add(email)
        var signedOut = api
        signedOut.accessToken = { nil }
        await queue.flush(signedOut)
        #expect(queue.pending == [email])
    }

    @Test func automaticVisitReportsWaitOnAServerFaultAndRunOnce() async {
        let visits = VisitReportQueue(kv: kv)
        visits.add("j1")
        StubServer.set(host, "/api/jobs/j1/visit-report", 502, [:])
        await visits.flush(api)
        #expect(visits.pending == ["j1"])
        StubServer.set(host, "/api/jobs/j1/visit-report", 200, ["skipped": true])
        async let a: Void = visits.flush(api)
        async let b: Void = visits.flush(api)
        _ = await (a, b)
        #expect(visits.pending.isEmpty)
        #expect(StubServer.calls(host).filter { $0.path == "/api/jobs/j1/visit-report" }.count == 2)
    }

    @Test func signingOutDropsTheQueuedSendsAndTexts() async throws {
        try await shell.session.signIn(email: "tech@shop.test", password: "right")
        let sends = ReportSendQueue(kv: kv)
        sends.add(email)
        kv.setJSON(ReportSendQueue.textsKey, ["j1": "Shop: https://sundeck.test/r/tok"])
        kv.setJSON(ReportSendQueue.failuresKey, ["j2": "Refused"])
        let visits = VisitReportQueue(kv: kv)
        visits.add("j1")
        await shell.session.signOut()
        // The next person on this phone never sends, or sees, the last one's reports.
        #expect(sends.pending.isEmpty)
        #expect(sends.readyText(jobId: "j1") == nil && sends.failure(jobId: "j2") == nil)
        #expect(visits.pending.isEmpty)
    }

    @Test func oneUnreadableEntryKeepsTheRest() {
        // Written by a later version (a new action), or damaged: the rest still go.
        kv.set(
            ReportSendQueue.key,
            #"[{"jobId":"j1","reportId":"r1","action":"fax","to":null},{"jobId":"j1","reportId":"r1","action":"email","to":"pat@home.test"}]"#
        )
        let queue = ReportSendQueue(kv: kv)
        #expect(queue.pending == [email])
        kv.set(ReportSendQueue.key, "not json")
        #expect(queue.pending.isEmpty)
    }
}

@Suite struct MoneyEdgeTests {
    @Test func aHugeAmountIsRefusedNotACrash() {
        // 18 nines fit in an Int as dollars but not as cents: this trapped (overflow).
        #expect(parseDollars("999999999999999999") == nil)
        #expect(parseDollars("-999999999999999999") == nil)
        #expect(parseDollars("92233720368547758.07") == Int.max)
        #expect(parseDollars("92233720368547758.08") == nil)
        // Ordinary input is unchanged.
        #expect(parseDollars("1,234.5") == 123_450)
        #expect(parseDollars("-0") == 0)
        #expect(parseDollars("1e3") == nil && parseDollars("") == nil && parseDollars(" ") == nil)
        #expect(parseDollars("12.345") == nil && parseDollars("abc") == nil)
    }
}

@Suite struct CaptionEdgeTests {
    func media(caption: String?) throws -> Media {
        let row: JSONValue = [
            "id": "m1", "company_id": "c1", "job_id": "j1", "kind": "photo", "storage_path": "c1/j1/m1.jpg",
            "caption": caption.map(JSONValue.string) ?? .null,
        ]
        return try row.decode(Media.self)
    }

    @Test func savingByItselfKeepsTheSpaceJustTyped() throws {
        // "Pool " saves as "Pool"; the field must keep the space so the next word isn't joined.
        let saved = try media(caption: "Pool")
        #expect(MediaDetail.captionShown(typed: "Pool ", saved) == "Pool ")
        #expect(MediaDetail.captionShown(typed: "Pool\n", saved) == "Pool\n")
        // Changed elsewhere: the saved caption shows.
        #expect(MediaDetail.captionShown(typed: "Pool ", try media(caption: "Deck")) == "Deck")
        #expect(MediaDetail.captionShown(typed: " ", try media(caption: nil)) == " ")
    }
}

@Suite @MainActor struct InputEdgeTests {
    @Test func aSwipeWithNoNumbersNeverPages() {
        let start = CGPoint(x: 200, y: 300)
        #expect(PageSwipeRule.direction(start: start, translation: CGSize(width: CGFloat.nan, height: 0)) == 0)
        #expect(PageSwipeRule.direction(start: start, translation: CGSize(width: 100, height: CGFloat.nan)) == 0)
        #expect(
            PageSwipeRule.direction(
                start: start, translation: CGSize(width: CGFloat.infinity, height: CGFloat.infinity)) == 0)
        #expect(
            PageSwipeRule.direction(start: CGPoint(x: CGFloat.nan, y: 0), translation: CGSize(width: 100, height: 0))
                == 0)
        // Exactly on the lines counts, as on the website.
        #expect(PageSwipeRule.direction(start: start, translation: CGSize(width: 70, height: 0)) == -1)
        #expect(PageSwipeRule.direction(start: start, translation: CGSize(width: -69.9, height: 0)) == 0)
        #expect(PageSwipeRule.direction(start: start, translation: CGSize(width: 126, height: 70)) == -1)
        #expect(PageSwipeRule.direction(start: CGPoint(x: 28, y: 0), translation: CGSize(width: 100, height: 0)) == 0)
    }

    @Test func aLinkArrivingTwiceIsDoneOnce() {
        // A Live Activity tap at a cold start can arrive by URL and by the scene's restore.
        var gate = LinkGate()
        let t0 = Date(timeIntervalSince1970: 1_000)
        let link = AppLink.stop("j1", .markComplete)
        let first = gate.accept(link, at: t0)
        let again = gate.accept(link, at: t0.addingTimeInterval(1))
        let other = gate.accept(.stop("j2", .markComplete), at: t0.addingTimeInterval(1))
        let later = gate.accept(link, at: t0.addingTimeInterval(5))
        #expect(first && !again && other && later)
    }

    @Test func hostileLinksOpenNothingOrOnlyTheJob() throws {
        #expect(AppLink(url: try #require(URL(string: "sundeckpro://job/"))) == nil)
        #expect(AppLink(url: try #require(URL(string: "https://job/j1/mark-complete"))) == nil)
        #expect(AppLink(url: try #require(URL(string: "sundeckpro://jobs/j1"))) == nil)
        // An unknown action only opens the job.
        #expect(AppLink(url: try #require(URL(string: "sundeckpro://job/j1/delete"))) == .job("j1"))
    }

    @Test func anUnknownJobStatusDoesNotCrashTheJobPage() {
        // A status added on the server later ("on_hold") reads as Unscheduled on the phone.
        let status = JobView(id: "j1", job: ["status": "on_hold"], property: nil, customer: nil).status
        #expect(status == .unscheduled)
        #expect(!jobHeaderActions(status, type: .maintenance).isEmpty)
    }

    @Test func anInvoiceQuantityMustBeARealNumber() {
        #expect(invoiceLineQuantity("1e309") == nil)
        #expect(invoiceLineQuantity("inf") == nil && invoiceLineQuantity("nan") == nil)
        #expect(invoiceLineQuantity("-1") == nil && invoiceLineQuantity("0") == nil)
        #expect(invoiceLineQuantity("1.005") == nil && invoiceLineQuantity("abc") == nil)
        #expect(invoiceLineQuantity("") == 1 && invoiceLineQuantity(" 2,5 ") == 2.5)
    }
}
