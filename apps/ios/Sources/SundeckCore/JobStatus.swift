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
        case .scheduled: [.unscheduled, .inProgress, .canceled]
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

/// Next statuses a person (not the server) can pick. Done is how a maintenance visit ends;
/// leak detection and repairs end with a report or invoice.
public func userTransitions(from: JobStatus, type: String? = nil) -> [JobStatus] {
    from.transitions.filter {
        !JobStatus.serverStatuses.contains($0) && ($0 != .done || type == "maintenance")
    }
}
