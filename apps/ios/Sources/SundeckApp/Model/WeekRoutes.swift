import Foundation
import SundeckCore
import SundeckSync

// The routes work in Schedule's Week (owner, 2026-10-20; docs/design/2026-10-20-team-week.md
// sections 5, 6 and 8): Customers to Add (running plans with nobody on them) with Suggest Days,
// putting a plan on a weekday and tech, and a plan visit's move that asks first (Change Schedule
// or Just This Visit). Every change is rows through the sync layer, each with its Undo. Port of
// apps/web/src/lib/service-routes.ts and app/actions/service-days.ts.

/// A running plan as Week shows it.
public struct RoutePlanCard: Identifiable, Equatable, Sendable {
    public var planId: String
    public var plan: ServicePlan
    public var customer: String
    public var address: String
    public var location: LatLng?
    public var techId: String?
    /// 0 Sunday to 6 Saturday.
    public var days: [Int]
    public var durationMin: Int
    public var repeats: PlanRepeat
    public var createdAt: String?
    public var id: String { planId }

    /// "2× a week", "Every 2 weeks", "Monthly", or nil for weekly.
    public var repeatNote: String? {
        if days.count > 1 { return "\(days.count)× a week" }
        switch repeats {
        case .biweekly: return "Every 2 weeks"
        case .monthly: return "Monthly"
        default: return nil
        }
    }
}

/// Every plan that's running (not paused, deleted or ended), A to Z by customer.
public func routePlans(_ store: LocalStore, companyId: String, today: String) -> [RoutePlanCard] {
    let rows = (try? store.list("service_plan", companyId: companyId)) ?? []
    return
        rows
        .filter { $0["deleted_at"]?.string == nil && $0["paused"]?.bool != true }
        .compactMap { row -> RoutePlanCard? in
            guard let plan = try? JSONValue.object(row).decode(ServicePlan.self) else { return nil }
            if let ends = plan.endsOn, !ends.isEmpty, ends < today { return nil }
            let property = plan.propertyId.flatMap { try? store.get("property", $0) }
            let customer = plan.customerId.flatMap { try? store.get("customer", $0) }
            let location: LatLng? = {
                guard let lat = property?["latitude"]?.number, let lng = property?["longitude"]?.number else {
                    return nil
                }
                return LatLng(lat: lat, lng: lng)
            }()
            let street = [property?["address_line1"]?.string, property?["city"]?.string]
                .compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            return RoutePlanCard(
                planId: row.id, plan: plan, customer: customer?["name"]?.string ?? "Customer",
                address: street.joined(separator: ", "), location: location, techId: plan.assignedUserId,
                days: serviceDays(plan), durationMin: plan.durationMinutes, repeats: planRepeat(plan),
                createdAt: row["created_at"]?.string)
        }
        .sorted { $0.customer.localizedCompare($1.customer) == .orderedAscending }
}

/// Customers to Add: running plans with nobody on them (or someone no longer on the team), the
/// newest first.
public func customersToAdd(_ plans: [RoutePlanCard], techIds: [String]) -> [RoutePlanCard] {
    let team = Set(techIds)
    return
        plans
        .filter { p in p.techId.map { !team.contains($0) } ?? true }
        .sorted { a, b in
            let when = (b.createdAt ?? "").compare(a.createdAt ?? "")
            if when != .orderedSame { return when == .orderedAscending }
            return a.customer.localizedCompare(b.customer) == .orderedAscending
        }
}

public let weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/// The weekday of "YYYY-MM-DD" (0 Sunday to 6 Saturday).
public func weekdayOf(_ date: String) -> Int? {
    guard let start = try? weekStart(date) else { return nil }
    for k in 0..<7 where (try? addDays(start, k)) == date { return (k + 1) % 7 }
    return nil
}

// MARK: - Rows to save, with their Undo

/// One row's new values, in any synced table.
public struct TableUpdate: Equatable, Sendable {
    public var table: String
    public var id: String
    public var values: Row

    public init(table: String, id: String, values: Row) {
        self.table = table
        self.id = id
        self.values = values
    }

    public init(_ job: JobUpdate) { self.init(table: "job", id: job.id, values: job.values) }
}

/// The rows as they are now, for the same columns: what Undo writes back.
public func undoRows(_ store: LocalStore, _ updates: [TableUpdate]) -> [TableUpdate] {
    var seen = Set<String>()
    return updates.compactMap { u in
        guard seen.insert("\(u.table)|\(u.id)").inserted, let row = try? store.get(u.table, u.id) else { return nil }
        var before: Row = [:]
        for key in u.values.keys { before[key] = row[key] ?? .null }
        return TableUpdate(table: u.table, id: u.id, values: before)
    }
}

/// Saves the rows through the sync layer, all or none.
@MainActor
public func saveRows(_ sync: SyncService, companyId: String, _ updates: [TableUpdate]) throws {
    guard !updates.isEmpty else { return }
    try sync.batch {
        for u in updates { try sync.store.write(u.table, id: u.id, companyId: companyId, u.values) }
    }
}

/// A plan on `to` (instead of `from`, one of its days; nil its first) with this tech, from today
/// on: the plan row's new columns (`setServiceDay`). Its coming visits follow on the server.
public func planDayUpdate(_ plan: RoutePlanCard, from: Int?, to: Int, tech: String, today: String) throws
    -> TableUpdate
{
    let change = try moveServiceDay(plan.plan, from: from ?? plan.days.first ?? to, to: to, today: today)
    var values = change.values
    values["assigned_user_id"] = .string(tech)
    return TableUpdate(table: "service_plan", id: plan.planId, values: values)
}

// MARK: - Suggest Days

/// Suggest Days for Customers to Add, among the techs given: nothing is saved until Keep.
public func suggestPlanDays(
    toAdd: [RoutePlanCard], all: [RoutePlanCard], techs: [String], ctx: ScheduleContext, drive: DriveTimes
) -> ServiceDaySuggestions {
    let wanted = Set(toAdd.map(\.planId))
    let asPlan = { (p: RoutePlanCard) in
        SundeckCore.RoutePlan(
            id: p.planId, techId: p.techId, days: p.days, location: p.location, durationMin: p.durationMin)
    }
    return suggestServiceDays(
        place: toAdd.map(asPlan), keep: all.filter { !wanted.contains($0.planId) }.map(asPlan), techs: techs,
        workDays: ctx.settings.workDays, depot: ctx.depot, day: ctx.workDay, drive: drive.drive)
}

/// Why Suggest Days left some out: "2 have no map location · 1 is on several days a week".
public func leftOutNote(_ plans: [RoutePlanCard], left: [String]) -> String? {
    let out = plans.filter { left.contains($0.planId) }
    let noMap = out.filter { $0.location == nil }.count
    let several = out.filter { $0.location != nil && $0.days.count > 1 }.count
    let full = out.count - noMap - several
    let has = { (n: Int) in n == 1 ? "has" : "have" }
    let isAre = { (n: Int) in n == 1 ? "is" : "are" }
    let parts = [
        noMap > 0 ? "\(noMap) \(has(noMap)) no map location" : nil,
        several > 0 ? "\(several) \(isAre(several)) on several days a week" : nil,
        full > 0 ? "\(full) didn’t fit" : nil,
    ].compactMap { $0 }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
}

/// Keep's banner: "Saved 12 customers' days. Their coming visits moved too."
public func keptDaysMessage(_ n: Int) -> String {
    "Saved \(n) \(n == 1 ? "customer’s day" : "customers’ days"). Their coming visits moved too."
}

/// "No days to suggest: 2 have no map location."
public func noSuggestionsMessage(_ why: String?) -> String {
    guard let why, let first = why.first else { return "No days to suggest." }
    return "No days to suggest: \(first.lowercased())\(why.dropFirst())."
}

public let putBackMessage = "Put back as it was."

// MARK: - Plan visits keep their day (section 5)

/// A plan visit being moved, waiting for Change Schedule or Just This Visit.
public struct PlanVisitMove: Identifiable, Sendable {
    public var job: ScheduleJob
    public var tech: String?
    public var date: String
    /// The visit's own move, as any job's (`moveJob`).
    public var updates: [JobUpdate]
    public var id: String { job.id }
}

/// Whether moving this visit to `tech` on `date` asks first (core `asksPlanMove`).
public func asksToMovePlanVisit(_ job: ScheduleJob, tech: String?, date: String?, ctx: ScheduleContext) -> Bool {
    guard let date else { return false }
    let from = VisitSlot(date: job.start.map { localDay($0, timeZone: ctx.timeZone) } ?? "", techId: job.assignedUserId)
    return asksPlanMove(
        servicePlanId: job.servicePlanId, status: job.status.rawValue,
        move: (from: from, to: VisitSlot(date: date, techId: tech)))
}

/// Just This Visit: the visit's move, marked as moved (`job.plan_moved`) so remaking the plan's
/// visits never puts it back.
public func justThisVisitRows(_ move: PlanVisitMove) -> [TableUpdate] {
    var rows = move.updates.map(TableUpdate.init)
    if let i = rows.firstIndex(where: { $0.id == move.job.id }) {
        rows[i].values["plan_moved"] = .bool(true)
    } else {
        rows.append(TableUpdate(table: "job", id: move.job.id, values: ["plan_moved": .bool(true)]))
    }
    return rows
}

/// Change Schedule: the plan onto the new weekday and tech (its coming visits follow on the
/// server), and this visit's move so the schedule shows it at once.
public func changeScheduleRows(_ move: PlanVisitMove, plan: RoutePlanCard, today: String) throws -> [TableUpdate] {
    guard let to = weekdayOf(move.date) else { throw ScheduleProblem("That move isn’t possible.") }
    guard let tech = move.tech ?? plan.techId else { throw ScheduleProblem("Pick someone on the team.") }
    // The plan's day this visit is for (several a week: only that one moves).
    let from = move.job.planDate.flatMap(weekdayOf)
    return [try planDayUpdate(plan, from: from, to: to, tech: tech, today: today)]
        + move.updates.map(TableUpdate.init)
}

// MARK: - The screen's state

/// What Undo writes back, and what its banner says then.
public struct PendingUndo: Sendable {
    public var rows: [TableUpdate]
    public var message: String
}

/// A Customers to Add tile's Move sheet: the plan, and the weekday it opens on (a drop on a day).
public struct PlanMoveTarget: Identifiable, Sendable {
    public var plan: RoutePlanCard
    public var day: Int?
    public var id: String { plan.planId }
}

/// Suggest Days' results, waiting for Keep.
public struct SuggestedDays: Identifiable, Sendable {
    public let id = UUID()
    public var suggestions: [DaySuggestion]
    public var note: String?
}

/// What a dragged Customers to Add tile carries: "plan:<id>" (a stop carries its job's id).
public func planDragItem(_ planId: String) -> String { "plan:\(planId)" }

/// The plan's id from a dragged item, or nil for a stop.
public func planDragId(_ item: String) -> String? {
    item.hasPrefix("plan:") ? String(item.dropFirst(5)) : nil
}

/// What a job's move saves: its rows now, or (a plan visit going to another day or tech, moved
/// by someone who can change the plan) the question first. Off the schedule (no day) or to
/// Nobody yet a plan visit is always a one-off, marked `plan_moved` (owner, 2026-10-20). A tech's move of a plan
/// visit is this visit only.
public enum PlanMoveDecision: Sendable {
    case save([TableUpdate])
    case ask(PlanVisitMove)
}

public func planMoveDecision(
    _ job: ScheduleJob, tech: String?, date: String?, updates: [JobUpdate], ctx: ScheduleContext,
    canChangePlan: Bool
) -> PlanMoveDecision {
    let move = PlanVisitMove(job: job, tech: tech, date: date ?? "", updates: updates)
    // Off the schedule, or to Nobody yet (Needs a Time): always a one-off, no question.
    if date == nil || tech == nil, job.servicePlanId != nil { return .save(justThisVisitRows(move)) }
    guard asksToMovePlanVisit(job, tech: tech, date: date, ctx: ctx) else {
        return .save(updates.map(TableUpdate.init))
    }
    return canChangePlan ? .ask(move) : .save(justThisVisitRows(move))
}
