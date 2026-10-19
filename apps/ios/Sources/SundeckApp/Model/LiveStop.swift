import Foundation
import SundeckCore
import SundeckSync

// The Live Activity for the stop a tech is on (owner, 2026-10-19; docs/plans/
// live-activities-and-notifications.md): what it shows, worked out from the phone's own rows so
// it updates offline. It begins by itself at the start of the workday ("Live Activity should
// begin at the beginning of the workday") on the first stop not done, with its scheduled time;
// On My Way turns it to the drive; Start Job, the checklist and Mark Complete change it (the
// phase comes from the job itself); a done stop moves it on to the next one, and it ends after
// the last. The app's ActivityKit controller sends it.

/// The stop the activity is for, kept while it runs: the job, and the arrival time On My Way
/// gave (a time of day; nothing counts down). No arrival time: not on the way yet.
public struct LiveStopTarget: Codable, Equatable, Sendable {
    public var jobId: String
    public var eta: String?
    /// The shop's local date it's for ("2026-10-20").
    public var day: String?

    public init(jobId: String, eta: String?, day: String? = nil) {
        self.jobId = jobId
        self.eta = eta
        self.day = day
    }
}

/// The signed-in tech's day for the Live Activity: their stops today in route order, and
/// whether it runs now (`liveStopRuns`: a work day, past the start of the working day, with a
/// stop not done).
public struct LiveStopDay: Sendable {
    public var today: String
    public var stops: [ScheduleJob]
    public var runs: Bool

    /// The first stop not done today, or the first one after `jobId` that isn't.
    public func open(after jobId: String? = nil) -> ScheduleJob? {
        let start = jobId.flatMap { id in stops.firstIndex { $0.id == id }.map { $0 + 1 } } ?? 0
        return stops.dropFirst(start).first { !$0.doneOn(today) }
            ?? (jobId == nil ? nil : stops.first { $0.id != jobId && !$0.doneOn(today) })
    }
}

@MainActor
public func liveStopDay(
    _ store: LocalStore, kv: KeyValue, company: CompanyContext, userId: String, now: Date = Date()
) -> LiveStopDay {
    let jobs = scheduleJobs(store, companyId: company.id)
    let ctx = scheduleContext(store, company: company, userId: userId, now: now)
    let team = teamMembers(store, kv: kv, companyId: company.id, userId: userId)
    let routes = loadRoutes(jobs, ctx: ctx, dates: [ctx.today], team: team, drive: DriveTimes()).routes
    let stops = routes[routeKey(userId, ctx.today)]?.jobs ?? []
    let left = stops.filter { !$0.doneOn(ctx.today) }.count
    return LiveStopDay(
        today: ctx.today, stops: stops,
        runs: liveStopRuns(settings: company.settings, date: ctx.today, nowMin: ctx.nowMin, stopsLeft: left))
}

/// The arrival time of day On My Way texts: now plus the drive (at least 5 minutes), "9:42 AM".
public func liveStopETA(now: Date, timeZone: String, driveMinutes: Int) -> String {
    minutesLabel(localMinutes(now, timeZone: timeZone) + max(5, driveMinutes))
}

/// What the activity shows for a stop now (`LiveStopInput`), or nil when the job isn't on this
/// phone. The phase follows the job: done for today (Mark Complete, Complete Job), in progress
/// (Start Job), on the way once On My Way gave an arrival time, else ahead at its scheduled time. Stop n of m and the next stop come from the tech's route
/// today; a job off today's route is stop 1 of 1.
@MainActor
public func liveStopInput(
    _ store: LocalStore, kv: KeyValue, company: CompanyContext, userId: String, target: LiveStopTarget,
    now: Date = Date()
) -> LiveStopInput? {
    let jobs = scheduleJobs(store, companyId: company.id)
    guard let job = jobs.first(where: { $0.id == target.jobId }) else { return nil }
    let ctx = scheduleContext(store, company: company, userId: userId, now: now)
    let team = teamMembers(store, kv: kv, companyId: company.id, userId: userId)
    let routes = loadRoutes(jobs, ctx: ctx, dates: [ctx.today], team: team, drive: DriveTimes()).routes
    let route =
        routes.values.first { r in r.techId == (job.assignedUserId ?? userId) && r.jobs.contains { $0.id == job.id } }
        ?? routes.values.first { r in r.jobs.contains { $0.id == job.id } }
    let stops = route?.jobs ?? [job]
    let index = stops.firstIndex { $0.id == job.id } ?? 0
    let next = stops.dropFirst(index + 1).first { !$0.doneOn(ctx.today) }
    let inspection = JobInspection(store, jobId: job.id)
    let tally = checklistTally(inspection.components, inspection.results)
    let total = tally.pass + tally.attention + tally.leaking + tally.notApplicable + tally.pending
    let phase: LiveStopPhase =
        job.doneOn(ctx.today)
        ? .done : job.status == .inProgress ? .onSite : target.eta != nil ? .driving : .ahead
    let scheduled = formatTime(job.scheduledStart, timeZone: ctx.timeZone)
    return LiveStopInput(
        phase: phase, customer: job.customerName, address: job.address.isEmpty ? nil : job.address,
        stop: index + 1, stops: stops.count, eta: phase == .driving ? target.eta : nil,
        scheduled: phase == .ahead && !scheduled.isEmpty ? scheduled : nil,
        checklistDone: total - tally.pending, checklistTotal: total,
        next: next.map {
            let time = formatTime($0.scheduledStart, timeZone: ctx.timeZone)
            return LiveStopNext(customer: $0.customerName, time: time.isEmpty ? nil : time)
        })
}

/// How long the activity stays on the Lock Screen after the stop is done.
public let liveStopDoneLingerSeconds: TimeInterval = 60
