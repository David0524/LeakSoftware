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

/// What blocks Mark Done and finishing or sending a report until the job has a photo.
public let finishPhotoMessage = "Take a photo of the pool before finishing this job."

/// `job.intake`'s key for the price book item a repair was booked for (When They Call).
public let repairItemKey = "repair_item"
/// How the job page names that answer.
public let repairItemLabel = "What they need"

public enum JobType: String, Codable, CaseIterable, Sendable {
    case detection, repair, maintenance
}

public struct JobTypeOption: Codable, Equatable, Sendable {
    public let value: JobType
    public let label: String
}

/// The jobs New Job offers: the package's own, then Repair, which every shop gets.
public func newJobTypes(_ services: Services) -> [JobTypeOption] {
    var options: [JobTypeOption] = []
    if services != .pool { options.append(JobTypeOption(value: .detection, label: "Leak Detection")) }
    if services != .leak { options.append(JobTypeOption(value: .maintenance, label: "Pool Service")) }
    options.append(JobTypeOption(value: .repair, label: "Repair"))
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
