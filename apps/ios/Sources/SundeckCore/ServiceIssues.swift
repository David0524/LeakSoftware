import Foundation

/// service-issues.ts: a tech on a visit reports a problem with a few words and photos; the office
/// resolves it or makes a job of it (docs/design/2026-11-16-service-issues.md).
public enum IssueStatus: String, Codable, CaseIterable, Sendable {
    case open, resolved, converted

    /// `ISSUE_STATUS_LABELS`.
    public var label: String {
        switch self {
        case .open: "Open"
        case .resolved: "Resolved"
        case .converted: "Job made"
        }
    }
}

/// The work a tech suggests (job types); nil is "Not sure".
public enum IssueWork: String, Codable, CaseIterable, Sendable {
    case repair, detection

    /// `ISSUE_WORK_LABELS`.
    public var label: String { self == .repair ? "Repair" : "Leak Detection" }
}

/// `ISSUE_TEXT`: the words, the same on every platform.
public enum IssueText {
    public static let report = "Report an Issue"
    public static let sheetTitle = "Report an Issue"
    public static let whatsWrong = "What’s wrong?"
    public static let placeholder = "Leaking pump seal, cracked skimmer, heater won’t light…"
    public static let suggestedWork = "Suggested Work"
    public static let submit = "Report"
    public static let reported = "Issue reported. The office will see it."
    public static let addPhotosFirst = "Say what’s wrong first, then add photos."
    public static let segment = "Issues"
    public static let makeQuote = "Make Quote"
    public static let makeDetection = "Make Leak Detection Job"
    public static let resolve = "Resolve"
    public static let resolveTitle = "Resolve Issue"
    public static let resolveNote = "Note (optional)"
    public static let resolveNotePlaceholder = "Fixed on the visit, customer declined…"
    public static let reopen = "Reopen"
    public static let openJob = "Open Job"
    public static let onlyManagers = "Owners and admins resolve issues and make jobs from them."

    /// For the fixtures: every entry by its TypeScript key.
    public static var all: [String: String] {
        [
            "report": report, "sheetTitle": sheetTitle, "whatsWrong": whatsWrong, "placeholder": placeholder,
            "suggestedWork": suggestedWork, "submit": submit, "reported": reported,
            "addPhotosFirst": addPhotosFirst, "segment": segment, "makeQuote": makeQuote,
            "makeDetection": makeDetection, "resolve": resolve, "resolveTitle": resolveTitle,
            "resolveNote": resolveNote, "resolveNotePlaceholder": resolveNotePlaceholder, "reopen": reopen,
            "openJob": openJob, "onlyManagers": onlyManagers,
        ]
    }
}

public let issueDescriptionMax = 2000
public let issueNoteMax = 1000

/// A Suggested Work segment.
public struct IssueWorkOption: Encodable, Equatable, Sendable {
    public var value: IssueWork?
    public var label: String

    enum CodingKeys: String, CodingKey { case value, label }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(value?.rawValue, forKey: .value)
        try c.encode(label, forKey: .label)
    }
}

/// Suggested Work's segments: Not Sure, Repair, and Leak Detection where the shop does it.
public func issueWorkOptions(_ services: String) -> [IssueWorkOption] {
    [IssueWorkOption(value: nil, label: "Not Sure"), IssueWorkOption(value: .repair, label: "Repair")]
        + (services != "pool" ? [IssueWorkOption(value: .detection, label: "Leak Detection")] : [])
}

/// What's wrong is required and fits: the message to show, or nil.
public func issueDescriptionError(_ text: String) -> String? {
    let t = ECMA.trim(text)
    if t.isEmpty { return "Say what’s wrong." }
    if t.utf16.count > issueDescriptionMax { return "Keep it under 2,000 characters." }
    return nil
}

public func issueNoteError(_ text: String) -> String? {
    ECMA.trim(text).utf16.count > issueNoteMax ? "Keep the note under 1,000 characters." : nil
}

/// Only owners and admins resolve, reopen, and make jobs of issues (the database agrees).
public func canManageIssues(_ role: String?) -> Bool { role == "owner" || role == "admin" }

public enum IssueAction: String, Codable, Sendable {
    case makeQuote = "make_quote"
    case makeDetection = "make_detection"
    case resolve, reopen
    case openJob = "open_job"
}

/// The actions an issue offers this person.
public func issueActions(_ status: IssueStatus, role: String?, services: String) -> [IssueAction] {
    if status == .converted { return [.openJob] }
    if !canManageIssues(role) { return [] }
    if status == .resolved { return [.reopen] }
    return [.makeQuote] + (services != "pool" ? [.makeDetection] : []) + [.resolve]
}

/// An issue as the lists read it.
public struct ServiceIssue: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var customerId: String?
    public var propertyId: String?
    public var jobId: String?
    public var description: String
    public var suggestedType: IssueWork?
    public var status: IssueStatus
    public var resolutionNote: String?
    public var resolvedBy: String?
    public var resolvedAt: String?
    public var convertedJobId: String?
    public var reportedBy: String?
    public var reportedAt: String
    public var deletedAt: String?

    public init(
        id: String, customerId: String?, propertyId: String?, jobId: String?, description: String,
        suggestedType: IssueWork?, status: IssueStatus, resolutionNote: String?, resolvedBy: String?,
        resolvedAt: String?, convertedJobId: String?, reportedBy: String?, reportedAt: String, deletedAt: String?
    ) {
        self.id = id
        self.customerId = customerId
        self.propertyId = propertyId
        self.jobId = jobId
        self.description = description
        self.suggestedType = suggestedType
        self.status = status
        self.resolutionNote = resolutionNote
        self.resolvedBy = resolvedBy
        self.resolvedAt = resolvedAt
        self.convertedJobId = convertedJobId
        self.reportedBy = reportedBy
        self.reportedAt = reportedAt
        self.deletedAt = deletedAt
    }

    enum CodingKeys: String, CodingKey {
        case id, description, status
        case customerId = "customer_id"
        case propertyId = "property_id"
        case jobId = "job_id"
        case suggestedType = "suggested_type"
        case resolutionNote = "resolution_note"
        case resolvedBy = "resolved_by"
        case resolvedAt = "resolved_at"
        case convertedJobId = "converted_job_id"
        case reportedBy = "reported_by"
        case reportedAt = "reported_at"
        case deletedAt = "deleted_at"
    }
}

public enum IssueFilter: String, Codable, CaseIterable, Sendable {
    case open, resolved, all

    /// `ISSUE_FILTERS`' label.
    public var label: String {
        switch self {
        case .open: "Open"
        case .resolved: "Done"
        case .all: "All"
        }
    }
}

/// The Issues list: live issues for the filter ("Done" is resolved or made a job), newest first.
/// A tech who can't manage issues sees the ones they reported.
public func issueList(_ issues: [ServiceIssue], _ filter: IssueFilter, userId: String, role: String?)
    -> [ServiceIssue]
{
    issues
        .filter { $0.deletedAt == nil && (canManageIssues(role) || $0.reportedBy == userId) }
        .filter { filter == .all ? true : filter == .open ? $0.status == .open : $0.status != .open }
        .sorted { a, b in a.reportedAt != b.reportedAt ? a.reportedAt > b.reportedAt : a.id > b.id }
}

/// How many open issues the Issues segment counts (for this viewer).
public func openIssueCount(_ issues: [ServiceIssue], userId: String, role: String?) -> Int {
    issueList(issues, .open, userId: userId, role: role).count
}

/// "Issues" or "Issues (3)" on the segment.
public func issuesSegmentLabel(_ open: Int) -> String {
    open > 0 ? "\(IssueText.segment) (\(open))" : IssueText.segment
}

/// What an empty Issues list says.
public func issuesEmpty(_ filter: IssueFilter, manages: Bool) -> String {
    switch filter {
    case .open:
        manages
            ? "No open issues. Techs report them from a visit with Report an Issue."
            : "No open issues you reported. Report one from a visit with Report an Issue."
    case .resolved: "No resolved issues yet."
    case .all: "No issues yet."
    }
}

/// The line under an issue in lists: "Repair · Sam Ortiz · Nov 16".
public func issueDetailLine(suggested: IssueWork?, reporter: String?, reportedOn: String) -> String {
    [suggested?.label, reporter, reportedOn].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
}

/// The first line of the description, cut for a list row (JavaScript lengths: UTF-16).
public func issueTitle(_ description: String, max: Int = 80) -> String {
    // By scalars: "\r\n" is one Character in Swift.
    let scalars = ECMA.trim(description).unicodeScalars
    let firstLine = scalars.split(separator: "\n", omittingEmptySubsequences: false).first.map {
        String(String.UnicodeScalarView($0))
    }
    let line = ECMA.trim(firstLine ?? "")
    let units = Array(line.utf16)
    guard units.count > max else { return line }
    let cut = String(decoding: units[0..<(max - 1)], as: UTF16.self)
    return trimEnd(cut) + "…"
}

private func trimEnd(_ s: String) -> String {
    let scalars = s.unicodeScalars
    guard let last = scalars.lastIndex(where: { !ECMA.isWhitespace($0) }) else { return "" }
    return String(scalars[...last])
}
