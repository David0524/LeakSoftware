/// The shop's services and people's roles. Port of the rules in models.ts.

/// The shop's line of work: pool care, leak detection, or both (owner, 2026-10-16).
public enum Services: String, Codable, CaseIterable, Sendable {
    case pool, leak, both
}

/// What the shop does; shops from before the split have both.
public func companyServices(_ settings: JSONValue?) -> Services {
    settings?["services"]?.string.flatMap(Services.init(rawValue:)) ?? .both
}

/// Whether the shop does leak detection (leak jobs, tests, findings, reports).
public func offersLeak(_ settings: JSONValue?) -> Bool { companyServices(settings) != .pool }
/// Whether the shop does pool care (cleaning plans, the service checklist, monthly billing).
public func offersPool(_ settings: JSONValue?) -> Bool { companyServices(settings) != .leak }

/// Whether finishing a job needs a pool photo first (owner setting, 2026-10-19; default off).
public func requiresFinishPhoto(_ settings: JSONValue?) -> Bool {
    settings?["require_finish_photo"] == .bool(true)
}

/// What blocks Complete Job and finishing or sending a report until the job has a photo.
public let finishPhotoMessage = "Take a photo of the pool before finishing this job."

/// Whether completing a job needs every checklist item answered first (owners and admins,
/// 2026-10-19; default off).
public func requiresFinishedChecklist(_ settings: JSONValue?) -> Bool {
    settings?["require_checklist_to_finish"] == .bool(true)
}

/// What blocks Complete Job until every checklist item is answered.
public let finishChecklistMessage = "Finish the checklist before completing this job."

/// What stops Complete Job (owner, 2026-10-19): the checklist first, then the photo. Nil when
/// the job can be completed.
public func completeJobBlocker(_ settings: JSONValue?, checklistToDo: Int, photos: Int) -> String? {
    if requiresFinishedChecklist(settings) && checklistToDo > 0 { return finishChecklistMessage }
    if requiresFinishPhoto(settings) && photos == 0 { return finishPhotoMessage }
    return nil
}

/// Whether a stop on a day's route is done (owner, 2026-10-19: Mark Complete on every stop): a
/// job past the field part of its pipeline is done; a leak or repair job is also done for the
/// day once Mark Complete set `stop_done_on` to that day.
public func stopDone(status: String, stopDoneOn: String?, day: String) -> Bool {
    if status != "scheduled" && status != "in_progress" { return true }
    return stopDoneOn == day
}

/// What Mark Complete on Today writes: a maintenance visit is completed (status done); a leak
/// or repair job keeps its pipeline and its stop is marked done for the day.
public func markCompleteValues(type: String, day: String) -> [String: JSONValue] {
    type == "maintenance" ? ["status": "done"] : ["stop_done_on": .string(day)]
}

/// Whether the job's page offers Schedule Job / Change Schedule (owner, 2026-10-20: "You should
/// be able to reschedule a job from the jobs page after creating it"): until its work is done,
/// started jobs included; repairs as before. Port of `jobReschedulable`.
public func jobReschedulable(type: String, status: String) -> Bool {
    type == "repair" || status == "unscheduled" || status == "scheduled" || status == "in_progress"
}

/// What a done stop on Today offers (owner, 2026-10-20: "Maintenance jobs don't have a reopen
/// visit button on the Today page"): a completed maintenance visit, Reopen Visit (back to in
/// progress); a leak or repair stop marked done today, Mark Not Complete; otherwise nothing.
/// Port of `todayUndo`.
public struct TodayUndo: Codable, Equatable, Sendable {
    /// "Reopen Visit" or "Mark Not Complete".
    public var label: String
    /// Reopen the visit (done to in progress) rather than clear the day's mark.
    public var reopen: Bool

    public init(label: String, reopen: Bool) {
        self.label = label
        self.reopen = reopen
    }

    public static let reopenVisit = TodayUndo(label: "Reopen Visit", reopen: true)
    public static let markNotComplete = TodayUndo(label: "Mark Not Complete", reopen: false)
}

public func todayUndo(type: String, status: String, stopDoneOn: String?, day: String) -> TodayUndo? {
    if type == "maintenance" { return status == "done" ? .reopenVisit : nil }
    return stopDoneOn == day && (status == "scheduled" || status == "in_progress") ? .markNotComplete : nil
}

/// Whether the job page has a Wrap-Up section (report, signatures, quotes, invoice).
/// Maintenance visits don't (owner, 2026-10-19): they end with Complete Job, are billed monthly,
/// and quote repairs from Details.
public func jobHasWrapUp(_ type: String?) -> Bool { type != "maintenance" }

/// `job.intake`'s key for the price book item a repair was booked for (From the Customer).
public let repairItemKey = "repair_item"
/// How the job page names that answer.
public let repairItemLabel = "What they need"

public enum JobType: String, Codable, CaseIterable, Sendable {
    case detection, repair, maintenance
    /// Pool Inspection (owner, 2026-10-20; PoolInspection.swift).
    case inspection

    /// "Leak detection", "Repair", "Maintenance", "Pool inspection" (`JOB_TYPE_LABELS`).
    public var label: String {
        switch self {
        case .detection: "Leak detection"
        case .repair: "Repair"
        case .maintenance: "Maintenance"
        case .inspection: "Pool inspection"
        }
    }
}

/// What the job's price is called (owner, 2026-10-19): a detection fee on leak detection, a
/// price on repairs and visits.
public func jobFeeLabel(_ type: String?) -> String { type == "detection" ? "Detection fee" : "Price" }

/// The same, for a typed job.
public func jobFeeLabel(_ type: JobType) -> String { jobFeeLabel(type.rawValue) }

public struct JobTypeOption: Codable, Equatable, Sendable {
    public let value: JobType
    public let label: String
}

/// The jobs New Job offers, in this order (owner, 2026-10-20: "service, repair, leak, pool
/// inspection"): Service (pool care shops), Repair (every shop), then Leak and Inspection (leak
/// shops). Short labels, so all four fit across a phone.
public func newJobTypes(_ services: Services) -> [JobTypeOption] {
    var options: [JobTypeOption] = []
    if services != .leak { options.append(JobTypeOption(value: .maintenance, label: "Service")) }
    options.append(JobTypeOption(value: .repair, label: "Repair"))
    if services != .pool {
        options.append(JobTypeOption(value: .detection, label: "Leak"))
        options.append(JobTypeOption(value: .inspection, label: "Inspection"))
    }
    return options
}

public enum Role: String, Codable, CaseIterable, Sendable {
    case owner, admin, tech

    public var label: String {
        switch self {
        case .owner: "Owner"
        case .admin: "Admin"
        case .tech: "Tech"
        }
    }
}

public func roleLabel(_ role: String?) -> String {
    role.flatMap(Role.init(rawValue:))?.label ?? "Tech"
}

/// Owner or admin: runs the shop (everything but the owner-only items).
public func isManagerRole(_ role: String?) -> Bool { role == "owner" || role == "admin" }

/// Whether this member sees every job: owners and admins always; techs unless limited.
public func seesAllJobs(_ role: String?, _ settings: JSONValue?) -> Bool {
    isManagerRole(role) || settings?["techs_see_all_jobs"] != .bool(false)
}

/// Whether this member can make new jobs: owners and admins always; techs unless turned off.
public func canMakeJobs(_ role: String?, _ settings: JSONValue?) -> Bool {
    isManagerRole(role) || settings?["techs_make_jobs"] != .bool(false)
}

/// Split "a@x.com b@y.com, c@z.com" into addresses.
public func splitEmails(_ text: String) -> [String] {
    text.split(whereSeparator: { $0.isWhitespace || $0 == "," || $0 == ";" })
        .map { String($0) }
        .filter { $0.wholeMatch(of: /\S+@\S+\.\S+/) != nil }
}

public enum PoolType: String, Codable, CaseIterable, Sendable {
    case gunitePlaster = "gunite_plaster"
    case vinyl, fiberglass, other

    public var label: String {
        switch self {
        case .gunitePlaster: "Gunite / plaster"
        case .vinyl: "Vinyl"
        case .fiberglass: "Fiberglass"
        case .other: "Other"
        }
    }
}
