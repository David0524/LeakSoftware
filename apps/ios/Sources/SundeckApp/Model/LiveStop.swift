import Foundation
import SundeckCore
import SundeckSync

// The Live Activity for the stop a tech is on (owner, 2026-10-19; docs/plans/
// live-activities-and-notifications.md): what it shows, worked out from the phone's own rows so
// it updates offline. It begins by itself at the start of the workday ("Live Activity should
// begin at the beginning of the workday") on the stop Today's card shows, with its scheduled
// time; On My Way (kept on the job) turns it to the drive; Start Job, the checklist and Mark
// Complete change it; a done stop moves it on to the next one, and it ends after the last. Which
// stop, and what it says, is core `todayHero` (owner, 2026-10-20), so the Lock Screen and the
// card always agree. The app's ActivityKit controller sends it.

/// The stop the activity is for, kept while it runs: the job. Which stop and how far along it
/// is come from the shared rule (`todayHero`, owner 2026-10-20), so the Lock Screen and Today's
/// card always pick the same stop; On My Way is read from the job (`on_my_way_at`, `arrive_at`).
/// `eta` is kept for activities started before the job recorded it.
public struct LiveStopTarget: Codable, Equatable, Sendable {
    public var jobId: String
    public var eta: String?
    /// The shop's local date it's for ("2026-10-20").
    public var day: String?

    public init(jobId: String, eta: String? = nil, day: String? = nil) {
        self.jobId = jobId
        self.eta = eta
        self.day = day
    }
}

/// How far a job's checklist is, as the Live Activity counts it: answered items of all, and for
/// a pool inspection only the questions its gates leave open (2026-10-20). Website
/// `checklistCount`.
public func checklistCount(_ store: LocalStore, companyId: String, job: ScheduleJob) -> (done: Int, total: Int) {
    let inspection = JobInspection(store, jobId: job.id)
    if job.type == .inspection {
        let progress = InspectionChecklist(
            config: InspectionConfig(store, companyId: companyId), inspection: inspection
        )
        .progress
        return (progress.total - progress.toDo, progress.total)
    }
    let tally = checklistTally(inspection.components, inspection.results)
    let total = tally.pass + tally.attention + tally.leaking + tally.notApplicable + tally.pending
    return (total - tally.pending, total)
}

/// A day's stops as the card and the Live Activity read them (core `HeroStop`). Only started
/// jobs need their checklist counted (the figure shows it at the pool). Each stop carries its
/// cleanings (`dayCleanings`, owner 2026-10-20), the same ones Today's rows show. Reads only the
/// store, so Today builds it off the main thread.
public func dayHeroStops(
    _ store: LocalStore, companyId: String, stops: [ScheduleJob], counted: String? = nil,
    cleanings: [String: [VisitCleaning]]
) -> [HeroStop] {
    stops.map { job in
        // A repair job has no checklist to count (owner, 2026-10-22).
        let count =
            (job.status == .inProgress || job.id == counted) && jobHasChecklist(job.type.rawValue)
            ? checklistCount(store, companyId: companyId, job: job) : (done: 0, total: 0)
        return HeroStop(
            id: job.id, type: job.type.rawValue, status: job.status.rawValue, stopDoneOn: job.stopDoneOn,
            scheduledStart: job.scheduledStart, onMyWayAt: job.onMyWayAt, arriveAt: job.arriveAt,
            customer: job.customerName, address: job.address.isEmpty ? nil : job.address, access: job.accessNotes,
            cleanings: cleanings[job.id].map(heroCleanings), checklistDone: count.done, checklistTotal: count.total)
    }
}

/// The signed-in tech's day for the Live Activity: their stops today in route order, and
/// whether it runs now (`liveStopRuns`: a work day, past the start of the working day, with a
/// stop not done).
public struct LiveStopDay: Sendable {
    public var today: String
    public var timeZone: String = "UTC"
    public var stops: [ScheduleJob]
    public var heroStops: [HeroStop] = []
    public var runs: Bool

    /// The card for the day (core `todayHero`): a done stop moves straight on (owner, 2026-10-20:
    /// no minute's hold).
    public func hero() -> TodayHero? {
        try? todayHero(stops: heroStops, today: today, timeZone: timeZone)
    }

    /// The stop the day is on (Today's card's): the one on the way, else one started, else the
    /// first not done; nil when every stop is done.
    public func open() -> ScheduleJob? {
        guard let id = hero()?.stopId else { return nil }
        return stops.first { $0.id == id }
    }
}

/// Whether the Live Activity begins now, when none runs for today (owner, 2026-10-20: "It
/// should run anytime you have the app open during the work day"): the day runs (`liveStopRuns`)
/// with a stop to show, and the tech hasn't removed it today since the app last came to the
/// foreground. Opening the app, or bringing it back, clears a removal (`dismissedOn` nil), so it
/// comes back even after being removed earlier today; the every-minute check and background
/// syncs keep a removal.
public func liveStopBegins(_ day: LiveStopDay, dismissedOn: String?) -> Bool {
    day.runs && day.open() != nil && dismissedOn != day.today
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
    var day = LiveStopDay(
        today: ctx.today, timeZone: ctx.timeZone, stops: stops,
        heroStops: dayHeroStops(
            store, companyId: company.id, stops: stops,
            cleanings: dayCleanings(store, companyId: company.id, stops: stops, today: ctx.today)),
        runs: false)
    // A stop on the way or started runs it at any hour (owner, 2026-10-22).
    let underway = day.hero().map { $0.moment == .driving || $0.moment == .onSite } ?? false
    day.runs = liveStopRuns(
        settings: company.settings, date: ctx.today, nowMin: ctx.nowMin, stopsLeft: left, underway: underway)
    return day
}

/// The arrival time of day On My Way texts: now plus the drive (at least 5 minutes), "9:42 AM".
public func liveStopETA(now: Date, timeZone: String, driveMinutes: Int) -> String {
    minutesLabel(localMinutes(now, timeZone: timeZone) + max(5, driveMinutes))
}

/// What the activity shows for its stop now (`LiveStopInput`), from the shared rule
/// (`todayHero`) over the route the job is on: the same stop, words and figure as Today's card.
/// Nil when the job isn't on this phone, or when the day has moved on to another stop (done, or
/// On My Way or Start elsewhere): the controller then shows that one straight away (owner,
/// 2026-10-20: no minute's hold on a done stop). A job off today's route is stop 1 of 1.
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
    let hero = try? todayHero(
        stops: dayHeroStops(
            store, companyId: company.id, stops: stops, counted: job.id,
            cleanings: dayCleanings(store, companyId: company.id, stops: stops, today: ctx.today)),
        today: ctx.today,
        timeZone: ctx.timeZone)
    guard let hero, hero.stopId == job.id, var input = hero.input else { return nil }
    // On the way from an activity started before the job kept its arrival time.
    if input.phase == .driving && (input.eta ?? "").isEmpty { input.eta = target.eta }
    return input
}

/// The alert the Live Activity's update carries when a stop is done and it moves on (owner,
/// 2026-10-20): "Derek Jeter done. Next: Wayne Gretzky", or "Derek Jeter done." after the last.
public func liveStopDoneAlert(customer: String, next: String?) -> String {
    "\(customer) done." + (next.map { " Next: \($0)" } ?? "")
}
