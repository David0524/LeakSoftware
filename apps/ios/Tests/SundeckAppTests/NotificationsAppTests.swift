import Foundation
import SundeckCore
import SundeckLiveStop
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

#if canImport(FoundationNetworking)
    import FoundationNetworking
#endif

/// Notifications on the iPhone (owner, 2026-10-19): the push token on the server, what a tap
/// opens, More › Notifications, and what the Live Activity shows for a stop.
@MainActor @Suite struct NotificationsAppTests {
    func kv() throws -> KeyValue {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("push-\(UUID()).db").path
        return try KeyValue(Database(path: path, key: String(repeating: "7e", count: 32)))
    }

    func api(_ host: String, offline: Bool = false) -> WebAPI {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [offline ? NoConnection.self : StubServer.self]
        var api = WebAPI(baseURL: URL(string: "https://\(host)")!) { "token" }
        api.session = URLSession(configuration: config)
        return api
    }

    func host() -> String { "push-\(UUID().uuidString.prefix(8).lowercased()).test" }

    @Test func aTapOpensTheJobOrTheConversation() {
        #expect(AppLink(push: ["job": "j1", "aps": ["alert": "x"]]) == .job("j1"))
        #expect(AppLink(push: ["conversation": "c1"]) == .conversation("c1"))
        #expect(AppLink(push: ["job": ""]) == nil)
        #expect(AppLink(push: [:]) == nil)
        // The Live Activity's Open Job.
        let url = try! #require(LiveStopLink.job("00000000-0000-4000-8000-000000000601"))
        #expect(url.absoluteString == "sundeckpro://job/00000000-0000-4000-8000-000000000601")
        #expect(AppLink(url: url) == .job("00000000-0000-4000-8000-000000000601"))
        #expect(AppLink(url: URL(string: "https://sundeckpro.com/jobs/1")!) == nil)
        #expect(AppLink(url: URL(string: "sundeckpro://job/")!) == nil)
        #expect(LiveStopLink.call("(602) 555-0100")?.absoluteString == "tel:6025550100")
        #expect(LiveStopLink.call(nil) == nil)
    }

    @Test func theTokenIsHex() {
        #expect(pushTokenHex(Data([0x00, 0x0f, 0xab, 0xff])) == "000fabff")
    }

    /// The token goes to /api/push/devices once per person; offline it waits for the next launch;
    /// signing out takes it off the server.
    @Test func registersOncePerPersonAndRetriesWhenOffline() async throws {
        let host = host()
        StubServer.set(host, "/api/push/devices", 200, ["ok": true])
        let push = PushRegistration(kv: try kv())
        let token = Data((0..<32).map { UInt8($0) })
        let hex = pushTokenHex(token)

        // Offline: kept, not filed.
        await push.received(token, api: api(host, offline: true), userId: "u1")
        #expect(push.token == hex)
        #expect(StubServer.calls(host).isEmpty)

        // The next launch, online.
        await push.registerIfNeeded(api: api(host), userId: "u1")
        #expect(StubServer.calls(host).count == 1)
        #expect(
            StubServer.calls(host).last?.body
                == ["service": "apns", "token": .string(hex), "app": "iPhone app"])
        // Again for the same person: nothing sent.
        await push.registerIfNeeded(api: api(host), userId: "u1")
        await push.received(token, api: api(host), userId: "u1")
        #expect(StubServer.calls(host).count == 1)
        // Signed out without a person: nothing.
        await push.registerIfNeeded(api: api(host), userId: nil)
        #expect(StubServer.calls(host).count == 1)

        await push.unregister(api: api(host))
        #expect(StubServer.calls(host).count == 2)
        #expect(StubServer.calls(host).last?.body == ["service": "apns", "token": .string(hex)])
        // Someone else signs in: filed for them.
        await push.registerIfNeeded(api: api(host), userId: "u2")
        #expect(StubServer.calls(host).count == 3)
        // A new token from iOS is filed again.
        await push.received(Data([1, 2, 3, 4, 5, 6]), api: api(host), userId: "u2")
        #expect(StubServer.calls(host).count == 4)
        #expect(StubServer.calls(host).last?.body["token"] == "010203040506")
    }

    @Test func askingIsShownOnce() throws {
        let push = PushRegistration(kv: try kv())
        #expect(!push.asked)
        push.asked = true
        #expect(push.asked)
        #expect(NotificationAskText.allow == "Turn On Notifications" && NotificationAskText.later == "Not Now")
        #expect(NotificationAskText.title == "Turn On Notifications?")
    }

    /// More › Notifications: on unless turned off, saved with PUT as a switch changes, the row's
    /// value On / Some / Off, and a failed save goes back and says why.
    @Test func preferencesLoadSaveAndSummarize() async throws {
        let host = host()
        let kv = try kv()
        StubServer.set(host, "/api/push/preferences", 200, ["prefs": ["quote": false]])
        let form = NotificationPrefsForm(kv: kv)
        #expect(form.summary == "On")
        #expect(NotificationKind.allCases.allSatisfy { form.isOn($0) })
        await form.load(api(host))
        #expect(!form.isOn(.quote) && form.isOn(.text))
        #expect(form.summary == "Some")
        #expect(NotificationPrefsForm.summary(NotificationPrefsForm.cached(kv)) == "Some")

        StubServer.set(host, "/api/push/preferences", 200, ["prefs": ["quote": false, "text": false]])
        await form.set(.text, false, api: api(host))
        #expect(StubServer.calls(host).last?.body == ["prefs": ["quote": false, "text": false]])
        #expect(!form.isOn(.text) && form.error == nil)

        await form.set(.payment, false, api: api(host, offline: true))
        #expect(form.isOn(.payment))
        #expect(form.error == "No connection. Try again when you have signal.")

        // Offline: the phone's copy stays, with no error until a change can't be saved.
        let again = NotificationPrefsForm(kv: kv)
        await again.load(api(host, offline: true))
        #expect(!again.loaded && again.error == nil && !again.isOn(.text) && again.summary == "Some")

        let off: JSONValue = .object(
            Dictionary(uniqueKeysWithValues: NotificationKind.allCases.map { ($0.rawValue, .bool(false)) }))
        #expect(NotificationPrefsForm.summary(off) == "Off")
        #expect(NotificationPrefsForm.summary(nil) == "On")
        #expect(NotificationPrefsForm.rowDetail == "Texts, new jobs, quotes, payments, and reports")
        #expect(KVKey.signOutClears.contains(KVKey.notificationPrefs))
    }

    /// The Live Activity follows the stop: on the way (arrival time), at the pool (checklist),
    /// done (the next stop), from the phone's own rows.
    @Test func liveStopFollowsTheJob() throws {
        let s = try ScheduleDataTests()
        let first = s.id(2)  // Grace Holloway, 9:00 AM, then Riley Rivera at 11:00 AM.
        let target = LiveStopTarget(jobId: first, eta: "8:25 AM")
        let driving = try #require(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me, target: target,
                now: ScheduleDataTests.now))
        #expect(driving.phase == .driving && driving.customer == "Grace Holloway")
        #expect(driving.stop == 1 && driving.stops == 2 && driving.eta == "8:25 AM")
        #expect(driving.address?.hasPrefix("2 Palm Ct") == true)
        #expect(driving.next == LiveStopNext(customer: "Riley Rivera", time: "11:00 AM"))
        #expect(liveStopContent(driving).figure == "8:25 AM")

        try setStatus(s, first, "in_progress")
        let onSite = try #require(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me, target: target,
                now: ScheduleDataTests.now))
        #expect(onSite.phase == .onSite && onSite.eta == nil)

        try setStatus(s, first, "completed")
        let done = try #require(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me, target: target,
                now: ScheduleDataTests.now))
        #expect(done.phase == .done)
        #expect(liveStopContent(done).next == "Next: Riley Rivera at 11:00 AM")

        // A job not on the phone: no activity.
        #expect(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me,
                target: LiveStopTarget(jobId: "missing", eta: nil), now: ScheduleDataTests.now) == nil)
        #expect(liveStopETA(now: ScheduleDataTests.now, timeZone: "America/Phoenix", driveMinutes: 2) == "8:05 AM")
        #expect(liveStopETA(now: ScheduleDataTests.now, timeZone: "America/Phoenix", driveMinutes: 25) == "8:25 AM")
        #expect(liveStopDoneLingerSeconds == 60)
    }

    private func setStatus(_ s: ScheduleDataTests, _ id: String, _ status: String) throws {
        var row = try #require(try s.sync.store.get("job", id))
        row["status"] = .string(status)
        try s.sync.store.applyPage(
            PullPage(
                rows: [PulledRow(table: "job", xid: "2", row: row)], done: true, cursor: [:],
                serverHLC: "1792508400001-0000-server"))
    }
}
