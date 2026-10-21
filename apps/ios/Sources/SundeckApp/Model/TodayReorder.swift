import Foundation
import SundeckCore
import SundeckSync

// Today: changing the order of stops (owner, 2026-10-20: "Fix this"; docs/plans/today-reorder.md).
// Do Later puts a stop after the day's last stop; Reorder moves stops one place up or down, or by
// dragging. Both are the Schedule's own move (`moveJob`, core `moveJobChange`): same tech, same
// day, a new place in the route, worked out from the phone's database and saved through the sync
// layer, offline included. Undo puts back the saved values of every row the move changed.

/// Today's words for moving stops (the website's and Android's too).
public enum TodayReorderText {
    public static let doLater = "Do Later"
    public static let reorder = "Reorder"
    public static let done = "Done"
    public static let moveUp = "Move Up"
    public static let moveDown = "Move Down"
    public static let undo = UndoText.undo
    public static let started = "Started"

    /// "Moved to 2:15 PM", when the move gave no message of its own.
    public static func moved(_ time: String) -> String { "Moved to \(time)" }
}

/// Why a stop on Today keeps its place.
public enum StopLock: Equatable, Sendable {
    /// Done today (folded into "N done").
    case done
    /// In progress.
    case started
    /// Locked to its day and time (Both, or a time the customer was told before locks).
    case locked
    /// Keeps its clock time (a time lock). A day lock alone may change its place in the day.
    case timeLocked
    /// On two techs' routes: moving it in one would move the other's (move it on the Schedule).
    case twoTechs

    /// Beside the lock, in the lock icons' words (no clock time; owner, 2026-10-21): "Started",
    /// "Locked", "Time locked".
    public var text: String {
        switch self {
        case .done: "Done"
        case .started: TodayReorderText.started
        case .locked: LockReason.fixed.label
        case .timeLocked: LockReason.time.label
        case .twoTechs: LockReason.twoTechs.label
        }
    }
}

/// Why this stop on `routeTech`'s day can't move from Today, or nil when it can. Core
/// `todayStopLock` (`timeZone` is kept for callers; the words carry no clock time).
public func todayStopLock(_ job: ScheduleJob, routeTech: String, today: String, timeZone: String) -> StopLock? {
    if job.doneOn(today) { return .done }
    switch job.lock {
    case .started: return .started
    case .fixed: return .locked
    case .time: return .timeLocked
    case .twoTechs: return .twoTechs
    case nil: return job.assignedUserId == routeTech ? nil : .twoTechs
    }
}

/// Techs reorder only their own day; owners and admins any tech's day they're viewing.
public func canReorderDay(_ ctx: ScheduleContext, techId: String) -> Bool {
    techId == ctx.userId || ctx.isManager
}

/// Where a stop goes on its day.
public enum StopPlace: Equatable, Sendable {
    /// Do Later: after every stop still to do.
    case later
    /// Move Up and Move Down: one place.
    case up, down
    /// Dragged in Reorder: this place among the stops still to do (0 first).
    case place(Int)
}

/// The stop's new place in its day's route (`MoveInput.index`: among the day's other jobs, 0
/// first), or nil when it can't go there: it's locked or done, it's already in that place, or the
/// place is above a started stop. Places count the stops still to do; done stops stay where they
/// are. Core `todayMoveIndex`.
public func reorderIndex(
    _ day: [ScheduleJob], jobId: String, to place: StopPlace, routeTech: String, today: String, timeZone: String
) -> Int? {
    guard
        let (rest, p) = reorderPlace(
            day, jobId: jobId, to: place, routeTech: routeTech, today: today, timeZone: timeZone)
    else { return nil }
    let others = day.filter { $0.id != jobId }
    let index = { (j: ScheduleJob) in others.firstIndex { $0.id == j.id } ?? others.count }
    return p == 0 ? index(rest[0]) : index(rest[p - 1]) + 1
}

/// The stops still to do, in their order once the move is made, or nil when it can't be made
/// (`reorderIndex`'s rule). Today's Reorder moves the row to this place at once, with a spring,
/// before the save comes back (owner, 2026-10-21: "make reordering jobs just as smooth").
public func reorderedToDo(
    _ day: [ScheduleJob], jobId: String, to place: StopPlace, routeTech: String, today: String, timeZone: String
) -> [String]? {
    guard
        let (rest, p) = reorderPlace(
            day, jobId: jobId, to: place, routeTech: routeTech, today: today, timeZone: timeZone)
    else { return nil }
    var ids = rest.map(\.id)
    ids.insert(jobId, at: p)
    return ids
}

/// The other stops still to do and the moved stop's new place among them; nil when it can't go.
private func reorderPlace(
    _ day: [ScheduleJob], jobId: String, to place: StopPlace, routeTech: String, today: String, timeZone: String
) -> (rest: [ScheduleJob], place: Int)? {
    guard let me = day.first(where: { $0.id == jobId }),
        todayStopLock(me, routeTech: routeTech, today: today, timeZone: timeZone) == nil
    else { return nil }
    let todo = day.filter { !$0.doneOn(today) }
    guard let at = todo.firstIndex(where: { $0.id == jobId }) else { return nil }
    let rest = todo.filter { $0.id != jobId }
    // Nothing goes above a stop that's under way.
    let floor = (rest.lastIndex { $0.status == .inProgress } ?? -1) + 1
    let p: Int
    switch place {
    case .later: p = rest.count
    case .down: p = at + 1
    case .up: p = at - 1 < floor ? -1 : at - 1
    case .place(let n): p = min(max(n, floor), rest.count)
    }
    if rest.isEmpty || p < 0 || p > rest.count || p == at { return nil }
    return (rest, p)
}

/// A move just saved from Today: for 5 seconds, Undo puts back every row it changed.
public struct StopMoveUndo: Equatable, Sendable, Identifiable {
    /// Where Do Later was pressed, so Undo shows there.
    public enum Source: Equatable, Sendable {
        case card, row, reorder
    }

    public let id: UUID
    public var jobId: String
    public var source: Source
    /// The move's message: "Moved to 2:15 PM."
    public var text: String
    /// Each changed row's values before the move, for the columns the move wrote.
    public var previous: [JobUpdate]

    public init(jobId: String, source: Source, text: String, previous: [JobUpdate]) {
        id = UUID()
        self.jobId = jobId
        self.source = source
        self.text = text
        self.previous = previous
    }

    /// Writes the saved values back in one batch (not a second move).
    @MainActor
    public func undo(_ sync: SyncService, companyId: String) throws {
        try saveJobUpdates(sync, companyId: companyId, previous)
    }
}

/// The values `updates` will overwrite, read from the phone's database before they're saved.
public func snapshot(_ store: LocalStore, _ updates: [JobUpdate]) throws -> [JobUpdate] {
    try updates.map { u in
        let row = try store.get("job", u.id) ?? [:]
        var old: Row = [:]
        for key in u.values.keys { old[key] = row[key] ?? .null }
        return JobUpdate(id: u.id, values: old)
    }
}

/// Moves a stop on `techId`'s day today (Do Later, Move Up, Move Down, a drag) with the
/// Schedule's move, and saves it through the sync layer with what Undo needs. Nil when the stop
/// stays where it is. Throws the move's message when it's refused.
@MainActor
public func moveTodayStop(
    _ sync: SyncService, companyId: String, ctx: ScheduleContext, team: [TeamMember], techId: String, jobId: String,
    to place: StopPlace, source: StopMoveUndo.Source, drive: DriveTimes
) throws -> StopMoveUndo? {
    if !canReorderDay(ctx, techId: techId) {
        throw ScheduleProblem("You can schedule only your own jobs. Ask an owner to move it to someone else.")
    }
    let jobs = scheduleJobs(sync.store, companyId: companyId)
    let day =
        loadRoutes(jobs, ctx: ctx, dates: [ctx.today], team: team, drive: DriveTimes())
        .routes[routeKey(techId, ctx.today)]?.jobs ?? []
    guard let job = day.first(where: { $0.id == jobId }) else {
        throw ScheduleProblem("This job is gone. Pull down to refresh.")
    }
    if let lock = todayStopLock(job, routeTech: techId, today: ctx.today, timeZone: ctx.timeZone) {
        throw ScheduleProblem(lock.text)
    }
    guard
        let index = reorderIndex(
            day, jobId: jobId, to: place, routeTech: techId, today: ctx.today, timeZone: ctx.timeZone)
    else { return nil }
    let (updates, message) = try moveJob(
        jobId, tech: techId, date: ctx.today, index: index, jobs: jobs, ctx: ctx, team: team, drive: drive)
    let previous = try snapshot(sync.store, updates)
    try saveJobUpdates(sync, companyId: companyId, updates)
    let text =
        message.isEmpty
        ? TodayReorderText.moved(
            formatTime(updates.first?.values["scheduled_start"]?.string, timeZone: ctx.timeZone)) : message
    return StopMoveUndo(jobId: jobId, source: source, text: text, previous: previous)
}
