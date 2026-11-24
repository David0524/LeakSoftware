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
    case skipped
    /// A standalone quote's job (20261022005700_standalone_quotes.sql): hidden from every job
    /// list until the customer accepts and it becomes the unscheduled repair job.
    case quote

    public var transitions: [JobStatus] {
        switch self {
        // Skipped: a maintenance visit that couldn't be done (20261022004500_skip_visit.sql).
        case .unscheduled: [.scheduled, .inProgress, .canceled, .skipped]
        // Complete Job straight from Scheduled (owner, 2026-10-19), for a visit done in one go.
        case .scheduled: [.unscheduled, .inProgress, .canceled, .done, .skipped]
        case .inProgress: [.scheduled, .reportSent, .invoiced, .canceled, .done, .skipped]
        case .reportSent: [.inProgress, .quoteSent, .invoiced, .canceled]
        case .quoteSent: [.reportSent, .quoteAccepted, .invoiced, .canceled]
        case .quoteAccepted: [.invoiced, .canceled]
        case .invoiced: [.paid, .canceled]
        case .paid: []
        case .canceled: [.unscheduled]
        // Maintenance visits (20261012002400_maintenance.sql).
        case .done: [.inProgress, .invoiced]
        // Back on (Undo Skip, or a new day), off the calendar, or called off.
        case .skipped: [.scheduled, .unscheduled, .inProgress, .canceled]
        // Only the server moves it on, when its quote is accepted (and it has a pool).
        case .quote: [.unscheduled]
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
        case .skipped: "Skipped"
        case .quote: "Quote"
        }
    }
}

/// The button that moves a job from one status to another (owner, 2026-10-19). Unschedule takes
/// a job off the calendar; Reopen Job brings back a canceled job or puts one whose report went out
/// back in progress (2026-10-29); Reopen Visit puts a finished visit back in progress.
public func jobActionLabel(from: JobStatus, to: JobStatus) -> String {
    if to == .skipped { return "Skip Visit" }
    if from == .skipped && to == .scheduled { return "Undo Skip" }
    return switch to {
    case .unscheduled: from == .canceled ? "Reopen Job" : "Unschedule"
    case .inProgress: from == .done ? "Reopen Visit" : from == .reportSent ? "Reopen Job" : "Start Job"
    case .scheduled: "Move Back to Scheduled"
    case .canceled: "Cancel Job"
    case .done: "Complete Job"
    default: to.label
    }
}

/// A step back (owner, 2026-10-29): Move Back to Scheduled and Unschedule sit in the job page's ••• menu,
/// so the buttons in view are forward steps. Reopen Job on a canceled job is forward. Port of core's.
public func isBackwardMove(from: JobStatus, to: JobStatus) -> Bool {
    // Undo Skip is the way out of a skip, in view beside Reschedule.
    if from == .skipped && to == .scheduled { return false }
    return to == .scheduled || (to == .unscheduled && from != .canceled)
}

/// Next statuses a person (not the server) can pick. Done is how a maintenance visit ends;
/// leak detection and repairs end with a report or invoice.
public func userTransitions(from: JobStatus, type: String? = nil) -> [JobStatus] {
    if from == .quote { return [] }
    // A skipped visit is put back with Undo Skip (Scheduled) or a new day (Reschedule), or called
    // off: not started or unscheduled by a status button.
    if from == .skipped { return from.transitions.filter { $0 == .scheduled || $0 == .canceled } }
    // An unscheduled job is scheduled with a day (the Schedule's Move…), never by a status
    // button (2026-10-21).
    return from.transitions.filter {
        !JobStatus.serverStatuses.contains($0) && ($0 != .done || type == "maintenance")
            && ($0 != .skipped || type == "maintenance") && !(from == .unscheduled && $0 == .scheduled)
    }
}

/// A standalone quote's job (New Quote, 2026-11-24): not a job yet. Every job list, count and
/// search leaves it out; the Quotes list and the quote screen show it. Port of core's.
public func isQuoteJob(status: String) -> Bool { status == JobStatus.quote.rawValue }
