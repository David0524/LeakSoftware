import Foundation

// The owner's dashboard (dashboard.ts; owner, 2026-10-20: "Dashboard should be in the apps").

/// One month of the dashboard (`DashboardMonth`; `owner_dashboard`'s months).
public struct DashboardMonth: Codable, Equatable, Sendable {
    /// "2026-10"
    public var month: String
    public var quotesSent: Int
    public var quotesAccepted: Int
    public var invoicedCents: Cents
    public var outstandingCents: Cents
    public var collectedCents: Cents

    enum CodingKeys: String, CodingKey {
        case month
        case quotesSent = "quotes_sent"
        case quotesAccepted = "quotes_accepted"
        case invoicedCents = "invoiced_cents"
        case outstandingCents = "outstanding_cents"
        case collectedCents = "collected_cents"
    }

    public init(
        month: String, quotesSent: Int, quotesAccepted: Int, invoicedCents: Cents, outstandingCents: Cents,
        collectedCents: Cents
    ) {
        self.month = month
        self.quotesSent = quotesSent
        self.quotesAccepted = quotesAccepted
        self.invoicedCents = invoicedCents
        self.outstandingCents = outstandingCents
        self.collectedCents = collectedCents
    }
}

private let shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
private let longMonths = [
    "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November",
    "December",
]

/// "Oct 2026", or "October 2026" with `long`.
public func monthLabel(_ month: String, long: Bool = false) -> String {
    let parts = month.split(separator: "-")
    guard parts.count >= 2, let m = Int(parts[1]), (1...12).contains(m) else { return month }
    return "\((long ? longMonths : shortMonths)[m - 1]) \(parts[0])"
}

/// Share of quotes accepted, as "67%", or "–" when none were sent.
public func acceptanceRate(_ sent: Int, _ accepted: Int) -> String {
    sent > 0 ? "\(Int(ECMA.round(Double(accepted) / Double(sent) * 100)))%" : "–"
}

/// Totals over the months shown.
public struct DashboardTotals: Codable, Equatable, Sendable {
    public var quotesSent: Int
    public var quotesAccepted: Int
    public var invoicedCents: Cents
    public var collectedCents: Cents

    enum CodingKeys: String, CodingKey {
        case quotesSent = "quotes_sent"
        case quotesAccepted = "quotes_accepted"
        case invoicedCents = "invoiced_cents"
        case collectedCents = "collected_cents"
    }
}

public func dashboardTotals(_ months: [DashboardMonth]) -> DashboardTotals {
    DashboardTotals(
        quotesSent: months.reduce(0) { $0 + $1.quotesSent },
        quotesAccepted: months.reduce(0) { $0 + $1.quotesAccepted },
        invoicedCents: months.reduce(0) { $0 + $1.invoicedCents },
        collectedCents: months.reduce(0) { $0 + $1.collectedCents })
}
