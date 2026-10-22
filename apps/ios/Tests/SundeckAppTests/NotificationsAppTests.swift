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
        #expect(NotificationPrefsForm.rowDetail == "Texts, new jobs, quotes, payments, reports, and Live Activity")
        #expect(KVKey.signOutClears.contains(KVKey.notificationPrefs))
    }

    /// The Live Activity follows the stop: on the way (arrival time), at the pool (checklist),
    /// done (the next stop), from the phone's own rows.
    @Test func liveStopFollowsTheJob() throws {
        let s = try ScheduleDataTests()
        let first = s.id(2)  // Grace Holloway, 9:00 AM, then Riley Rivera at 11:00 AM.
        let target = LiveStopTarget(jobId: first, eta: nil)
        // Before On My Way: up next, at its scheduled time.
        let before = try #require(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me, target: target,
                now: ScheduleDataTests.now))
        #expect(before.phase == .ahead && before.scheduled == "9:00 AM")
        // On My Way is kept on the job (owner, 2026-10-20), through the sync layer, so a second
        // phone sees it too: sent now, arriving after the drive (at least 5 minutes).
        try StopWrites.recordOnMyWay(
            s.sync, companyId: ScheduleDataTests.company, jobId: first, driveMinutes: 25, now: ScheduleDataTests.now)
        let row = try #require(try s.sync.store.get("job", first))
        #expect(row["on_my_way_at"]?.string == "2026-10-20T15:00:00.000Z")
        #expect(row["arrive_at"]?.string == "2026-10-20T15:25:00.000Z")
        #expect(try s.sync.store.pendingCount() > 0)
        #expect(
            onMyWayValues(now: ScheduleDataTests.now, driveMinutes: 2)["arrive_at"]?.string
                == "2026-10-20T15:05:00.000Z")
        let driving = try #require(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me, target: target,
                now: ScheduleDataTests.now))
        #expect(driving.phase == .driving && driving.customer == "Grace Holloway")
        #expect(driving.stop == 1 && driving.stops == 2 && driving.eta == "8:25 AM")
        #expect(driving.address?.hasPrefix("2 Palm Ct") == true)
        #expect(driving.next == LiveStopNext(customer: "Riley Rivera", time: "11:00 AM"))
        // No clock times on the Live Activity (owner, 2026-10-20): the stop's place in the day.
        #expect(liveStopContent(driving).figure == "1 of 2")

        try setStatus(s, first, "in_progress")
        let onSite = try #require(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me, target: target,
                now: ScheduleDataTests.now))
        #expect(onSite.phase == .onSite && onSite.eta == nil)

        // Done: the day has moved on (owner, 2026-10-20: no minute's hold), so the controller
        // shows the next stop, with an alert.
        try setStatus(s, first, "completed")
        #expect(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me, target: target,
                now: ScheduleDataTests.now) == nil)
        #expect(
            liveStopDoneAlert(customer: "Grace Holloway", next: "Riley Rivera")
                == "Grace Holloway done. Next: Riley Rivera")
        #expect(liveStopDoneAlert(customer: "Grace Holloway", next: nil) == "Grace Holloway done.")

        // Before On My Way (no arrival time): ahead, at its scheduled time.
        let ahead = try #require(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me,
                target: LiveStopTarget(jobId: s.id(1), eta: nil), now: ScheduleDataTests.now))
        #expect(ahead.phase == .ahead && ahead.scheduled == "11:00 AM" && ahead.eta == nil)
        #expect(ahead.stop == 2 && ahead.next == nil)
        #expect(liveStopContent(ahead).headline == "Up next: Riley Rivera")
        // The pool's access notes ride along until the stop is done (owner, 2026-10-20).
        #expect(ahead.access == "Gate code 4417" && liveStopContent(ahead).access == "Gate code 4417")

        // A job not on the phone: no activity.
        #expect(
            liveStopInput(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.me,
                target: LiveStopTarget(jobId: "missing", eta: nil), now: ScheduleDataTests.now) == nil)
        #expect(liveStopETA(now: ScheduleDataTests.now, timeZone: "America/Phoenix", driveMinutes: 2) == "8:05 AM")
        #expect(liveStopETA(now: ScheduleDataTests.now, timeZone: "America/Phoenix", driveMinutes: 25) == "8:25 AM")
    }

    /// The visit's cleanings ride on the card and the Live Activity (owner, 2026-10-20), and a
    /// Live Activity state saved before they existed still decodes.
    @Test func liveStopCarriesCleanings() throws {
        let due = try #require(cleaningCountdown("2026-10-18", "2026-10-20"))
        let stop = heroCleanings([VisitCleaning(id: "c1", name: "Clean filter", kind: .filter, due: due)])
        #expect(stop == [StopCleaning(name: "Clean filter", kind: .filter, days: -2, weeks: 0)])
        let input = LiveStopInput(
            phase: .ahead, customer: "Grace", address: nil, stop: 1, stops: 2, eta: nil, checklistDone: 0,
            checklistTotal: 0, next: nil, cleanings: stop)
        let content = liveStopContent(input)
        #expect(
            content.cleanings == [
                CleaningBadge(kind: .filter, label: "Overdue", spoken: "Clean filter overdue", overdue: true)
            ])
        #expect(content.spoken.hasSuffix(" Clean filter overdue."))
        let state = LiveStopState(stop: input, jobId: "j1", phone: nil)
        let again = try JSONDecoder().decode(LiveStopState.self, from: JSONEncoder().encode(state))
        #expect(again == state)
        let old = """
            {"jobId":"j1","stop":{"phase":"ahead","customer":"Grace","stop":1,"stops":2,"checklistDone":0,"checklistTotal":0}}
            """
        let decoded = try JSONDecoder().decode(LiveStopState.self, from: Data(old.utf8))
        #expect(decoded.stop.cleanings == nil && liveStopContent(decoded.stop).cleanings.isEmpty)
    }

    private func setStatus(_ s: ScheduleDataTests, _ id: String, _ status: String) throws {
        var row = try #require(try s.sync.store.get("job", id))
        row["status"] = .string(status)
        try s.sync.store.applyPage(
            PullPage(
                rows: [PulledRow(table: "job", xid: "2", row: row)], done: true, cursor: [:],
                serverHLC: "1792508400001-0000-server"))
    }

    /// The workday (owner, 2026-10-19 and 2026-10-20: "It should run anytime you have the app
    /// open during the work day"): it runs from the day's start on a work day while a stop isn't
    /// done, on the first stop not done, moves on from a done one, and a removal lasts only until
    /// the app comes back.
    @Test func liveStopBeginsWithTheWorkday() throws {
        let s = try ScheduleDataTests()
        let me = ScheduleDataTests.me
        // 8:00 AM Tuesday in Phoenix, the default day start.
        let day = liveStopDay(s.sync.store, kv: s.sync.kv, company: s.company, userId: me, now: ScheduleDataTests.now)
        #expect(day.today == "2026-10-20" && day.runs)
        #expect(day.stops.map(\.id) == [s.id(2), s.id(1)])
        #expect(day.open()?.id == s.id(2))
        #expect(day.hero()?.moment == .ahead && day.hero()?.stop == 1)
        // Whenever the app is open during the work day (owner, 2026-10-20): it begins; removed
        // today, it stays off only until the app comes back (which clears the removal).
        #expect(liveStopBegins(day, dismissedOn: nil))
        #expect(!liveStopBegins(day, dismissedOn: day.today))
        #expect(liveStopBegins(day, dismissedOn: "2026-10-19"))
        // Before the day starts, with nothing underway: not yet.
        let before = liveStopDay(
            s.sync.store, kv: s.sync.kv, company: s.company, userId: me,
            now: ScheduleDataTests.now.addingTimeInterval(-60))
        #expect(!before.runs && !liveStopBegins(before, dismissedOn: nil))
        // On My Way to the second stop: the day is on it (Today's card agrees: `todayHero`).
        try StopWrites.recordOnMyWay(
            s.sync, companyId: ScheduleDataTests.company, jobId: s.id(1), driveMinutes: 10, now: ScheduleDataTests.now)
        let driving = liveStopDay(
            s.sync.store, kv: s.sync.kv, company: s.company, userId: me, now: ScheduleDataTests.now)
        #expect(driving.open()?.id == s.id(1) && driving.hero()?.moment == .driving)
        #expect(driving.hero()?.content.figure == "2 of 2")
        // The first stop done: straight on to the next stop (owner, 2026-10-20).
        try setStatus(s, s.id(2), "completed")
        let moved = liveStopDay(s.sync.store, kv: s.sync.kv, company: s.company, userId: me, now: ScheduleDataTests.now)
        #expect(moved.hero()?.stopId == s.id(1))
        #expect(moved.open()?.id == s.id(1))
        // Before the day starts with a stop already on the way: it runs (owner, 2026-10-22: a
        // stop started before the 8 AM start showed no Live Activity).
        let early = liveStopDay(
            s.sync.store, kv: s.sync.kv, company: s.company, userId: me,
            now: ScheduleDataTests.now.addingTimeInterval(-60))
        #expect(early.runs && liveStopBegins(early, dismissedOn: nil))
        // Both stops done: it doesn't run, and there's nothing to move on to.
        try setStatus(s, s.id(2), "completed")
        try setStatus(s, s.id(1), "completed")
        let after = liveStopDay(s.sync.store, kv: s.sync.kv, company: s.company, userId: me, now: ScheduleDataTests.now)
        #expect(!after.runs && after.open() == nil && after.hero()?.moment == .dayDone)
        #expect(!liveStopBegins(after, dismissedOn: nil))
        // Sam has no stops today.
        #expect(
            !liveStopDay(
                s.sync.store, kv: s.sync.kv, company: s.company, userId: ScheduleDataTests.sam,
                now: ScheduleDataTests.now
            ).runs)
    }
}
