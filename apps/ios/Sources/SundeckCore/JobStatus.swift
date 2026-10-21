/// Job status machine. Port of job-status.ts; the database enforces the same rules.
public enum JobStatus: String, Codable, CaseIterable, Sendable {
    case unscheduled
    case scheduled
    case inProgress = "in_progress"
    case reportSent = "report_sent"
    case quoteSent = "quote_sent"
    case quoteAccepted = "quote_accepted"
    case invoiced
    case paid
    case canceled
    case done

    public var transitions: [JobStatus] {
        switch self {
        case .unscheduled: [.scheduled, .inProgress, .canceled]
        // Complete Job straight from Scheduled (owner, 2026-10-19), for a visit done in one go.
        case .scheduled: [.unscheduled, .inProgress, .canceled, .done]
        case .inProgress: [.scheduled, .reportSent, .invoiced, .canceled, .done]
        case .reportSent: [.inProgress, .quoteSent, .invoiced, .canceled]
        case .quoteSent: [.reportSent, .quoteAccepted, .invoiced, .canceled]
        case .quoteAccepted: [.invoiced, .canceled]
        case .invoiced: [.paid, .canceled]
        case .paid: []
        case .canceled: [.unscheduled]
        // Maintenance visits (20261012002400_maintenance.sql).
        case .done: [.inProgress, .invoiced]
        }
    }

    /// Statuses only the server sets, after sending, acceptance, invoicing, or payment.
    public static let serverStatuses: [JobStatus] = [.reportSent, .quoteSent, .quoteAccepted, .invoiced, .paid]

    /// Labels from the handoff, used in the office view.
    public var label: String {
        switch self {
        case .unscheduled: "Unscheduled"
        case .scheduled: "Scheduled"
        case .inProgress: "In progress"
        case .reportSent: "Report sent"
        case .quoteSent: "Quote sent"
        case .quoteAccepted: "Quote accepted"
        case .invoiced: "Invoiced"
        case .paid: "Paid"
        case .canceled: "Canceled"
        case .done: "Done"
        }
    }
}

/// The button that moves a job from one status to another (owner, 2026-10-19). Unschedule takes
/// a job off the calendar; Reopen Job is only for a canceled one; Reopen Visit puts a finished
/// visit back in progress.
public func jobActionLabel(from: JobStatus, to: JobStatus) -> String {
    switch to {
    case .unscheduled: from == .canceled ? "Reopen Job" : "Unschedule"
    case .inProgress: from == .done ? "Reopen Visit" : "Start Job"
    case .scheduled: "Move Back to Scheduled"
    case .canceled: "Cancel Job"
    case .done: "Complete Job"
    default: to.label
    }
}

/// Next statuses a person (not the server) can pick. Done is how a maintenance visit ends;
/// leak detection and repairs end with a report or invoice.
public func userTransitions(from: JobStatus, type: String? = nil) -> [JobStatus] {
    // An unscheduled job is scheduled with a day (the Schedule's Move…), never by a status
    // button (2026-10-21).
    from.transitions.filter {
        !JobStatus.serverStatuses.contains($0) && ($0 != .done || type == "maintenance")
            && !(from == .unscheduled && $0 == .scheduled)
    }
}
