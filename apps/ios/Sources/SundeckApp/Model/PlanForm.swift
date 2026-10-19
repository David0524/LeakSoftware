import Foundation
import SundeckCore
import SundeckSync

// Maintenance plans on the phone: New Job's plan and a customer's visit plans (spec 5.5 and 5.9;
// the website's MaintenancePlans and app/actions/maintenance.ts). Checked the same way as the
// website's forms. Plans are synced rows, so a customer's plans save through the sync layer and
// the server makes or replaces their visits when the change arrives (app.plan_visits).

/// A plan's form as typed: how often, the first and last visit, the time, the length, the
/// price per month, the tech and the notes.
public struct PlanDraft: Equatable, Sendable {
    public var repeats: PlanRepeat
    /// For Several Days: 0 Sunday to 6 Saturday.
    public var days: [Int]
    /// YYYY-MM-DD.
    public var startsOn: String
    /// "HH:MM", or blank: route planning picks it.
    public var time: String
    public var minutes: String
    /// Dollars per month, or blank.
    public var price: String
    /// YYYY-MM-DD, or blank: no end date.
    public var endsOn: String
    /// A member's user id, or nil: nobody yet.
    public var tech: String?
    public var notes: String

    public init(
        repeats: PlanRepeat = .weekly, days: [Int] = [], startsOn: String, time: String = "", minutes: String,
        price: String = "", endsOn: String = "", tech: String? = nil, notes: String = ""
    ) {
        self.repeats = repeats
        self.days = days
        self.startsOn = startsOn
        self.time = time
        self.minutes = minutes
        self.price = price
        self.endsOn = endsOn
        self.tech = tech
        self.notes = notes
    }

    /// A new plan: weekly from today, the shop's visit length.
    public static func new(today: String, settings: JSONValue) -> PlanDraft {
        PlanDraft(startsOn: today, minutes: String(maintenanceSettings(settings).visitMinutes))
    }

    /// An existing plan's values.
    public init(_ plan: ServicePlan) {
        self.init(
            repeats: planRepeat(plan), days: plan.weekdays ?? [], startsOn: plan.startsOn,
            time: plan.visitTime.map { String($0.prefix(5)) } ?? "", minutes: String(plan.durationMinutes),
            price: plan.priceCents.map(centsText) ?? "", endsOn: plan.endsOn ?? "", tech: plan.assignedUserId,
            notes: plan.notes ?? "")
    }

    /// The plan's columns, as service_plan and create_service_plan take them, or the fields to
    /// fix by name (weekdays, startsOn, time, minutes, price, endsOn). New Job says "End on or
    /// after the first visit."; a customer's plan "End on or after the start."
    public func check(endsMessage: String = "End on or after the start.") -> Result<Row, PlanDraftErrors> {
        var errors: [String: String] = [:]
        let shape = planShape(repeats, weekdays: days)
        if case .failure(let problem) = shape { errors[problem.field] = problem.message }
        if !isDateString(startsOn) { errors["startsOn"] = "Pick the first visit's date." }
        let clock = trim(time)
        if !clock.isEmpty && clock.wholeMatch(of: /([01][0-9]|2[0-3]):[0-5][0-9]/) == nil {
            errors["time"] = "Pick a time."
        }
        let length = Double(trim(minutes))
        let wholeMinutes = length.flatMap { $0.isFinite && $0 == $0.rounded() ? Int($0) : nil }
        if wholeMinutes.map({ !(10...240).contains($0) }) ?? true { errors["minutes"] = "Enter 10 to 240 minutes." }
        let cents = trim(price).isEmpty ? nil : parseDollars(price)
        if !trim(price).isEmpty && (cents ?? -1) < 0 { errors["price"] = "Enter a price like 180." }
        let ends = trim(endsOn)
        if !ends.isEmpty && (!isDateString(ends) || ends < startsOn) { errors["endsOn"] = endsMessage }
        guard errors.isEmpty, case .success(let s) = shape, let wholeMinutes else {
            return .failure(PlanDraftErrors(fields: errors))
        }
        let note = trim(notes)
        var row: Row = [
            "assigned_user_id": tech.map { .string($0) } ?? .null, "starts_on": .string(startsOn),
            "visit_time": clock.isEmpty ? .null : .string(clock), "duration_minutes": .number(Double(wholeMinutes)),
            "price_cents": cents.map { .number(Double($0)) } ?? .null, "ends_on": ends.isEmpty ? .null : .string(ends),
            "notes": note.isEmpty ? .null : .string(note),
        ]
        for (key, value) in s.row { row[key] = value }
        return .success(row)
    }
}

/// The fields to fix in a plan's form, by name.
public struct PlanDraftErrors: Error, Equatable, Sendable {
    public var fields: [String: String]
}

/// One of a pool's plans on the customer's page: "Every Tuesday · any time · 30 min · $180.00 a
/// month", then "Tony Tech · Next Tue, Oct 20, Tue, Oct 27, Tue, Nov 3 · 4 done".
public struct CustomerPlan: Identifiable, Equatable, Sendable {
    public var id: String
    public var plan: ServicePlan
    public var summary: String
    public var detail: String
    /// Its scheduled cleanings, each with its countdown (owner, 2026-10-19).
    public var cleanings: [PlanCleaningLine] = []
    public var notes: String?
}

/// A pool's plans as the website lists them (MaintenancePlans), oldest first.
func customerPlans(
    _ plans: [Row], propertyId: String, jobs: [Row], names: [String: String], today: String,
    cleanings: [PlanCleaningRow] = []
) -> [CustomerPlan] {
    var done: [String: Int] = [:]
    for job in jobs where job["status"]?.string == "done" && job["deleted_at"]?.string == nil {
        if let plan = job["service_plan_id"]?.string { done[plan, default: 0] += 1 }
    }
    return
        plans
        .filter { $0["property_id"]?.string == propertyId && $0["deleted_at"]?.string == nil }
        .sorted { ($0["created_at"]?.string ?? $0.id) < ($1["created_at"]?.string ?? $1.id) }
        .compactMap { row -> CustomerPlan? in
            guard let plan = try? JSONValue.object(row).decode(ServicePlan.self) else { return nil }
            let next = (try? upcomingVisitDates(plan, from: today, count: 3)) ?? []
            let day = { (d: String) in (try? formatDay(d, style: .short)) ?? d }
            let detail = [
                plan.assignedUserId.map { names[$0] ?? "Teammate" } ?? "No tech yet",
                plan.paused
                    ? "Paused" : next.isEmpty ? "No more visits" : "Next \(next.map(day).joined(separator: ", "))",
                plan.endsOn.flatMap { $0.isEmpty ? nil : "Ends \(day($0))" },
                "\(done[row.id] ?? 0) done",
            ]
            .compactMap { $0 }
            .joined(separator: " · ")
            let notes = plan.notes?.trimmingCharacters(in: .whitespacesAndNewlines)
            return CustomerPlan(
                id: row.id, plan: plan, summary: planSummary(plan), detail: detail,
                cleanings: cleanings.filter { $0.planId == row.id }.map { PlanCleaningLine($0, today: today) },
                notes: notes?.isEmpty == false ? notes : nil)
        }
}

/// A customer's plans, through the sync layer (row + outbox). Owners and admins only; the
/// server checks again.
@MainActor
public enum PlanWrites {
    /// Adds a plan to a pool, or saves a plan's changes. Returns the plan's id and what to say.
    @discardableResult
    public static func save(
        _ sync: SyncService, companyId: String, planId: String?, customerId: String, propertyId: String,
        _ values: Row
    ) throws -> (id: String, message: String) {
        if let planId {
            try sync.write("service_plan", id: planId, companyId: companyId, values)
            return (planId, "Plan saved. Upcoming visits updated.")
        }
        var row = values
        row["customer_id"] = .string(customerId)
        row["property_id"] = .string(propertyId)
        row["paused"] = .bool(false)
        let id = try sync.insert("service_plan", companyId: companyId, row)
        return (id, "Plan added. Visits are on the schedule.")
    }

    /// Pauses (upcoming visits not started leave the schedule) or resumes a plan.
    public static func setPaused(_ sync: SyncService, companyId: String, planId: String, _ paused: Bool) throws
        -> String
    {
        try sync.write("service_plan", id: planId, companyId: companyId, ["paused": .bool(paused)])
        return paused ? "Paused. Upcoming visits are off the schedule." : "Resumed."
    }

    /// Ends a plan: its upcoming visits leave the schedule; finished visits are kept.
    public static func end(_ sync: SyncService, planId: String) throws -> String {
        try sync.softDelete("service_plan", planId)
        return "Plan ended."
    }
}

/// `(cents / 100).toFixed(2)`: "180.00".
func centsText(_ cents: Cents) -> String {
    let magnitude = cents.magnitude
    let fraction = magnitude % 100
    return "\(cents < 0 ? "-" : "")\(magnitude / 100).\(fraction < 10 ? "0" : "")\(fraction)"
}

private func trim(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }
