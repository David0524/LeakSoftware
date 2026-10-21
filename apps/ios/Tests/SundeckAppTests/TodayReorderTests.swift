import Foundation
import SundeckCore
import SundeckStorage
import SundeckSync
import Testing

@testable import SundeckApp

/// Today: Do Later, Reorder's Move Up and Move Down, locked stops, and Undo (owner, 2026-10-20;
/// docs/plans/today-reorder.md), on the Schedule's fixture: Dana (owner) has Grace at 9:00 AM,
/// Riley at 11:00 AM and Noah at 1:00 PM today; Sam (tech) has two stops today.
@MainActor @Suite struct TodayReorderTests {
    let base: ScheduleDataTests
    var sync: SyncService { base.sync }
    static let company = ScheduleDataTests.company
    static let me = ScheduleDataTests.me
    static let sam = ScheduleDataTests.sam

    init() throws {
        base = try ScheduleDataTests()
        // Noah onto my day at 1:00 PM; Sam's maintenance visit and Diana onto Sam's day today.
        try base.sync.write(
            "job", id: base.id(5), companyId: Self.company,
            [
                "assigned_user_id": .string(Self.me), "scheduled_start": "2026-10-20T20:00:00Z",
                "scheduled_end": "2026-10-20T21:00:00Z",
            ])
        try base.sync.write(
            "job", id: base.id(3), companyId: Self.company,
            ["scheduled_start": "2026-10-20T16:00:00Z", "scheduled_end": "2026-10-20T17:00:00Z"])
        try base.sync.write(
            "job", id: base.id(4), companyId: Self.company,
            [
                "assigned_user_id": .string(Self.sam), "status": "scheduled",
                "scheduled_start": "2026-10-20T21:00:00Z", "scheduled_end": "2026-10-20T22:00:00Z",
            ])
    }

    func id(_ n: Int) -> String { base.id(n) }
    var ownerCtx: ScheduleContext { base.ctx }
    var samCtx: ScheduleContext {
        let company = CompanyContext(
            id: Self.company, name: "Desert Leak", timeZone: "America/Phoenix", settings: [:], role: "tech")
        return scheduleContext(sync.store, company: company, userId: Self.sam, now: ScheduleDataTests.now)
    }

    func day(_ tech: String) -> [ScheduleJob] {
        loadRoutes(
            scheduleJobs(sync.store, companyId: Self.company), ctx: ownerCtx, dates: [ownerCtx.today],
            team: base.team, drive: DriveTimes()
        ).routes[routeKey(tech, ownerCtx.today)]?.jobs ?? []
    }

    func names(_ tech: String) -> [String] { day(tech).map(\.customerName) }

    func move(_ n: Int, _ place: StopPlace, tech: String = me, ctx: ScheduleContext? = nil) throws -> StopMoveUndo? {
        try moveTodayStop(
            sync, companyId: Self.company, ctx: ctx ?? ownerCtx, team: base.team, techId: tech, jobId: id(n),
            to: place, source: .row, drive: DriveTimes())
    }

    func index(_ n: Int, _ place: StopPlace, tech: String = me) -> Int? {
        reorderIndex(
            day(tech), jobId: id(n), to: place, routeTech: tech, today: "2026-10-20", timeZone: "America/Phoenix")
    }

    @Test func doLaterPutsTheStopAfterTheLastOne() throws {
        #expect(names(Self.me) == ["Grace Holloway", "Riley Rivera", "Noah Tech"])
        #expect(index(2, .later) == 2)
        // Already last: nothing to do.
        #expect(index(5, .later) == nil)
        let pending = sync.status.pending
        let undo = try #require(try move(2, .later))
        // No clock times (owner, 2026-10-21): the move's own message.
        #expect(undo.text == "Moved.")
        #expect(undo.jobId == id(2) && undo.source == .row)
        #expect(names(Self.me) == ["Riley Rivera", "Noah Tech", "Grace Holloway"])
        // Saved through the sync layer: each changed row in the outbox.
        #expect(sync.status.pending == pending + undo.previous.count)
        #expect(try move(2, .later) == nil)
    }

    @Test func moveUpAndMoveDownGoOnePlace() throws {
        #expect(index(2, .up) == nil)
        #expect(index(5, .down) == nil)
        #expect(index(1, .up) == 0)
        #expect(index(1, .down) == 2)
        #expect(index(2, .down) == 1)
        // A drag: in front of a stop, or last.
        #expect(index(5, .place(0)) == 0)
        #expect(index(2, .place(2)) == 2)
        #expect(index(1, .place(1)) == nil)

        _ = try #require(try move(5, .up))
        #expect(names(Self.me) == ["Grace Holloway", "Noah Tech", "Riley Rivera"])
        _ = try #require(try move(2, .down))
        #expect(names(Self.me) == ["Noah Tech", "Grace Holloway", "Riley Rivera"])
    }

    @Test func startedPromisedAndDoneStopsKeepTheirPlace() throws {
        try sync.write("job", id: id(2), companyId: Self.company, ["status": "in_progress"])
        try sync.write("job", id: id(1), companyId: Self.company, ["arrival_fixed": true])
        let stops = day(Self.me)
        let lock = { (n: Int) in
            stops.first { $0.id == self.id(n) }.flatMap {
                todayStopLock($0, routeTech: Self.me, today: "2026-10-20", timeZone: "America/Phoenix")
            }
        }
        #expect(lock(2) == .started && lock(2)?.text == "Started")
        #expect(lock(1) == .locked && lock(1)?.text == "Locked")
        #expect(lock(5) == nil)
        #expect(index(2, .later) == nil && index(1, .down) == nil)
        // Noah can't go in front of the started stop, only after it.
        #expect(index(5, .place(0)) == 1)
        #expect(index(5, .up) == 1)
        #expect(throws: ScheduleProblem("Started")) { try move(2, .later) }

        try sync.write("job", id: id(2), companyId: Self.company, ["status": "done"])
        let done = try #require(day(Self.me).first { $0.id == id(2) })
        #expect(todayStopLock(done, routeTech: Self.me, today: "2026-10-20", timeZone: "America/Phoenix") == .done)

        // A day lock may change its place in the day; a time lock keeps its clock time.
        let noahLock = {
            self.day(Self.me).first { $0.id == self.id(5) }.flatMap {
                todayStopLock($0, routeTech: Self.me, today: "2026-10-20", timeZone: "America/Phoenix")
            }
        }
        try sync.write("job", id: id(5), companyId: Self.company, ["lock_day": true])
        #expect(noahLock() == nil)
        try sync.write("job", id: id(5), companyId: Self.company, ["lock_day": false, "lock_time": true])
        #expect(noahLock() == .timeLocked)
    }

    @Test func placesCountTheStopsStillToDo() throws {
        // Riley done in the middle: Grace's Move Down goes past Noah, and Noah's Move Up past Riley.
        try sync.write("job", id: id(1), companyId: Self.company, ["status": "done"])
        #expect(index(1, .later) == nil)
        #expect(index(2, .down) == 2)
        #expect(index(5, .up) == 0)
        #expect(index(2, .place(1)) == 2 && index(2, .place(9)) == 2)
    }

    @Test func undoPutsBackTheSavedValuesOfEveryChangedRow() throws {
        let before = try Dictionary(
            uniqueKeysWithValues: [1, 2, 5].map { n in (id(n), try #require(try sync.store.get("job", id(n)))) })
        let undo = try #require(try move(2, .later))
        #expect(Set(undo.previous.map(\.id)).isSubset(of: Set(before.keys)))
        #expect(undo.previous.contains { $0.id == id(2) })
        for p in undo.previous {
            for (key, value) in p.values { #expect(value == (before[p.id]?[key] ?? .null)) }
        }
        try undo.undo(sync, companyId: Self.company)
        #expect(names(Self.me) == ["Grace Holloway", "Riley Rivera", "Noah Tech"])
        for p in undo.previous {
            let row = try #require(try sync.store.get("job", p.id))
            for key in ["scheduled_start", "scheduled_end", "route_order", "status", "assigned_user_id"] {
                #expect((row[key] ?? .null) == (before[p.id]?[key] ?? .null), "\(key) of \(p.id)")
            }
        }
    }

    @Test func techsMoveOnlyTheirOwnDayOwnersAnyDay() throws {
        #expect(canReorderDay(samCtx, techId: Self.sam))
        #expect(!canReorderDay(samCtx, techId: Self.me))
        #expect(canReorderDay(ownerCtx, techId: Self.sam))
        #expect(
            throws: ScheduleProblem("You can schedule only your own jobs. Ask an owner to move it to someone else.")
        ) { try move(2, .later, ctx: samCtx) }

        #expect(names(Self.sam) == ["Sam Customer", "Diana Foster"])
        // Sam on his own day.
        _ = try #require(try move(3, .later, tech: Self.sam, ctx: samCtx))
        #expect(names(Self.sam) == ["Diana Foster", "Sam Customer"])
        // The owner, viewing Sam's day.
        _ = try #require(try move(3, .up, tech: Self.sam))
        #expect(names(Self.sam) == ["Sam Customer", "Diana Foster"])
        #expect(day(Self.sam).allSatisfy { $0.assignedUserId == Self.sam })
    }

    @Test func wordsMatchTheSpec() {
        #expect(
            [
                TodayReorderText.doLater, TodayReorderText.reorder, TodayReorderText.done, TodayReorderText.moveUp,
                TodayReorderText.moveDown, TodayReorderText.undo,
            ] == ["Do Later", "Reorder", "Done", "Move Up", "Move Down", "Undo"])
        #expect(TodayReorderText.moved("2:15 PM") == "Moved to 2:15 PM")
        #expect(StopLock.locked.text == "Locked" && StopLock.timeLocked.text == "Time locked")
    }
}
