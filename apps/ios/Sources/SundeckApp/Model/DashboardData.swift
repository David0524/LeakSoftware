import Foundation
import SundeckCore

// The owner's dashboard in the app (owner, 2026-10-20: "Dashboard should be in the apps";
// website app/(office)/dashboard): jobs by status now, quotes and money over six months, from
// the `owner_dashboard` RPC (it needs a connection).

/// `owner_dashboard`'s reply.
public struct DashboardData: Decodable, Equatable, Sendable {
    public var statuses: [String: Int]
    public var outstandingCents: Cents
    public var months: [DashboardMonth]

    enum CodingKeys: String, CodingKey {
        case statuses, months
        case outstandingCents = "outstanding_cents"
    }

    public init(statuses: [String: Int], outstandingCents: Cents, months: [DashboardMonth]) {
        self.statuses = statuses
        self.outstandingCents = outstandingCents
        self.months = months
    }
}

public enum DashboardText {
    public static let title = "Dashboard"
    public static let months = 6
    public static let collected = "Collected"
    public static let owed = "Owed to you"
    public static let openInvoices = "Open invoices"
    public static let accepted = "Quotes accepted"
    public static let invoiced = "Invoiced"
    public static let collectedByMonth = "Collected by Month"
    public static let collectedNote = "Payments received, by card, bank, or check."
    public static let jobsByStatus = "Jobs by Status"
    public static let jobsNote = "Every job, as of now."
    public static let noJobs = "No jobs yet."
    public static let byMonth = "By month"
    public static let offline = "The dashboard needs a connection. Try again when you have signal."
    public static let steps = ["Getting your numbers", "Adding them up"]

    /// "Last 6 months · Apr 2026 – Oct 2026"
    public static func subtitle(_ data: DashboardData) -> String {
        guard let first = data.months.first, let last = data.months.last else { return "Last \(months) months" }
        return "Last \(months) months · \(monthLabel(first.month)) – \(monthLabel(last.month))"
    }

    /// "2 of 3 quotes accepted (67%)"
    public static func monthQuotes(_ m: DashboardMonth) -> String {
        "\(m.quotesAccepted) of \(m.quotesSent) quotes accepted"
            + (m.quotesSent > 0 ? " (\(acceptanceRate(m.quotesSent, m.quotesAccepted)))" : "")
    }

    /// "Invoiced $500.00 · still owed $10.00"
    public static func monthMoney(_ m: DashboardMonth) -> String {
        "Invoiced \(formatCents(m.invoicedCents)) · still owed \(formatCents(m.outstandingCents))"
    }
}

/// A status row: its count, and the Jobs filter it opens ("Waiting on Customer" for the four
/// statuses the jobs list groups, as the website does).
public struct DashboardStatusRow: Identifiable, Equatable, Sendable {
    public var status: JobStatus
    public var count: Int
    public var id: String { status.rawValue }

    public var filter: JobFilter {
        switch status {
        case .reportSent, .quoteSent, .quoteAccepted, .invoiced: .followUp
        case .unscheduled: .unscheduled
        case .scheduled: .scheduled
        case .inProgress: .inProgress
        case .paid: .paid
        case .done: .done
        case .canceled: .canceled
        }
    }
}

/// The statuses with jobs, in JOB_STATUSES order.
public func dashboardStatusRows(_ data: DashboardData) -> [DashboardStatusRow] {
    JobStatus.allCases.compactMap { s in
        let n = data.statuses[s.rawValue] ?? 0
        return n > 0 ? DashboardStatusRow(status: s, count: n) : nil
    }
}
