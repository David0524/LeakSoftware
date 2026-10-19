import Foundation
import SundeckCore
import SundeckSync

// The Live Activity for the stop a tech is on (owner, 2026-10-19; docs/plans/
// live-activities-and-notifications.md): what it shows, worked out from the phone's own rows so
// it updates offline. On My Way starts it; Start Job, the checklist and Mark Complete change it
// (the phase comes from the job itself); the app's ActivityKit controller sends it.

/// The stop the activity is for, kept while it runs: the job, and the arrival time On My Way
/// gave (a time of day; nothing counts down).
public struct LiveStopTarget: Codable, Equatable, Sendable {
    public var jobId: String
    public var eta: String?

    public init(jobId: String, eta: String?) {
        self.jobId = jobId
        self.eta = eta
    }
}

/// The arrival time of day On My Way texts: now plus the drive (at least 5 minutes), "9:42 AM".
public func liveStopETA(now: Date, timeZone: String, driveMinutes: Int) -> String {
    minutesLabel(localMinutes(now, timeZone: timeZone) + max(5, driveMinutes))
}

/// What the activity shows for a stop now (`LiveStopInput`), or nil when the job isn't on this
/// phone. The phase follows the job: done for today (Mark Complete, Complete Job), in progress
/// (Start Job), else still on the way. Stop n of m and the next stop come from the tech's route
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
        job.doneOn(ctx.today) ? .done : job.status == .inProgress ? .onSite : .driving
    return LiveStopInput(
        phase: phase, customer: job.customerName, address: job.address.isEmpty ? nil : job.address,
        stop: index + 1, stops: stops.count, eta: phase == .driving ? target.eta : nil,
        checklistDone: total - tally.pending, checklistTotal: total,
        next: next.map {
            let time = formatTime($0.scheduledStart, timeZone: ctx.timeZone)
            return LiveStopNext(customer: $0.customerName, time: time.isEmpty ? nil : time)
        })
}

/// How long the activity stays on the Lock Screen after the stop is done.
public let liveStopDoneLingerSeconds: TimeInterval = 60
