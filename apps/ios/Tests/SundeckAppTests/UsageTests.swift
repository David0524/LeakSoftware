import Foundation
import Testing

@testable import SundeckApp

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// Usage for the Admin portal (owner, 2026-10-22): screen time only while the app is in front,
/// errors on the screen they happened on, nothing lost without signal. Same rules as Android's.
@Suite @MainActor struct UsageTests {
    final class Clock: @unchecked Sendable {
        var now = Date(timeIntervalSince1970: 1_761_145_200)
        func advance(_ seconds: TimeInterval) { now += seconds }
    }

    @Test func countsTimeOnlyWhileTheAppIsInFront() {
        let clock = Clock()
        let r = UsageRecorder(platform: "ios", version: "1.4.0 (52)") { clock.now }
        r.screenChanged("/today")
        clock.advance(60)
        r.foreground(false)  // locked the phone
        clock.advance(600)
        r.foreground(true)
        clock.advance(30)
        r.screenChanged("/jobs/:id")
        #expect(r.pending.map { [$0.screen, String($0.ms)] } == [["/today", "60000"], ["/today", "30000"]])
        r.error("Couldn’t save the photo")
        #expect(r.pending.last?.kind == "error" && r.pending.last?.screen == "/jobs/:id")
        #expect(r.pending.last?.detail == "Couldn’t save the photo")
    }

    @Test func startsANewSessionAfterHalfAnHourAway() {
        let clock = Clock()
        let r = UsageRecorder(platform: "ios", version: "1") { clock.now }
        r.screenChanged("/today")
        clock.advance(5)
        r.foreground(false)
        clock.advance(31 * 60)
        r.foreground(true)
        clock.advance(5)
        r.foreground(false)
        #expect(r.pending.count == 2 && r.pending[0].session != r.pending[1].session)
    }

    @Test func sendsWithThePlatformVersionAndShopAndKeepsWhatFailed() async {
        let clock = Clock()
        let r = UsageRecorder(platform: "ios", version: "1.4.0 (52)") { clock.now }
        r.screenChanged("/today")
        clock.advance(5)
        r.screenChanged("/schedule")
        let body = r.body(companyId: "c1", events: r.pending[...])
        #expect(body["platform"]?.string == "ios" && body["version"]?.string == "1.4.0 (52)")
        #expect(body["company_id"]?.string == "c1")
        guard case .array(let events)? = body["events"] else {
            Issue.record("no events")
            return
        }
        #expect(events.first?["screen"]?.string == "/today" && events.first?["ms"]?.number == 5000)

        // No connection: kept for the next try.
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [NoConnection.self]
        var offline = WebAPI(baseURL: URL(string: "https://usage.test")!) { "token" }
        offline.session = URLSession(configuration: config)
        await r.flush(offline, companyId: "c1")
        #expect(r.pending.count == 1)

        let host = "usage-\(UUID().uuidString.prefix(8).lowercased()).test"
        StubServer.set(host, "/api/usage", 204, [:])
        let stub = URLSessionConfiguration.ephemeral
        stub.protocolClasses = [StubServer.self]
        var api = WebAPI(baseURL: URL(string: "https://\(host)")!) { "token" }
        api.session = URLSession(configuration: stub)
        await r.flush(api, companyId: "c1")
        #expect(r.pending.isEmpty)
        #expect(StubServer.calls(host).last?.path == "/api/usage")
    }
}
