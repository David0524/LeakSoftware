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

// By tech (owner, 2026-11-24: "Tech specific stats in the dashboard"): each job counts for its
// assigned tech, over the months shown (dashboard.ts DashboardTech).

/// One tech over the months shown (`owner_dashboard`'s techs).
public struct DashboardTech: Codable, Equatable, Sendable, Identifiable {
    public var userId: String
    public var name: String
    /// Their team color (membership.color).
    public var color: String?
    /// False once turned off (they show while they have numbers in the months shown).
    public var active: Bool
    /// Jobs finished in the months shown.
    public var jobsDone: Int
    /// Jobs due by today and not finished, as of now (not a plan's visits ahead).
    public var jobsOpen: Int
    public var invoicedCents: Cents
    public var collectedCents: Cents
    public var thumbsUp: Int
    public var thumbsDown: Int
    /// Average start to finish on the jobs done; nil when there are none.
    public var onSiteMinutes: Int?

    public var id: String { userId }

    enum CodingKeys: String, CodingKey {
        case name, color, active
        case userId = "user_id"
        case jobsDone = "jobs_done"
        case jobsOpen = "jobs_open"
        case invoicedCents = "invoiced_cents"
        case collectedCents = "collected_cents"
        case thumbsUp = "thumbs_up"
        case thumbsDown = "thumbs_down"
        case onSiteMinutes = "on_site_minutes"
    }

    public init(
        userId: String, name: String, color: String?, active: Bool, jobsDone: Int, jobsOpen: Int,
        invoicedCents: Cents, collectedCents: Cents, thumbsUp: Int, thumbsDown: Int, onSiteMinutes: Int?
    ) {
        self.userId = userId
        self.name = name
        self.color = color
        self.active = active
        self.jobsDone = jobsDone
        self.jobsOpen = jobsOpen
        self.invoicedCents = invoicedCents
        self.collectedCents = collectedCents
        self.thumbsUp = thumbsUp
        self.thumbsDown = thumbsDown
        self.onSiteMinutes = onSiteMinutes
    }
}

public let dashboardTechsTitle = "By tech"
public let dashboardTechsEmpty = "No techs yet. Add them in Settings › Team."
public let dashboardTechTurnedOff = "Turned off"

/// "14 jobs done · 3 open"
public func techJobsNote(_ t: DashboardTech) -> String {
    "\(t.jobsDone) \(t.jobsDone == 1 ? "job" : "jobs") done · \(t.jobsOpen) open"
}

/// "Invoiced $5,000.00"
public func techInvoicedNote(_ t: DashboardTech) -> String {
    "Invoiced \(formatCents(t.invoicedCents))"
}

/// "9 thumbs up · 1 thumbs down · 1 hr 35 min avg on site", or "No feedback yet".
public func techFeedbackNote(_ t: DashboardTech) -> String {
    let feedback =
        t.thumbsUp + t.thumbsDown == 0
        ? "No feedback yet" : "\(t.thumbsUp) thumbs up · \(t.thumbsDown) thumbs down"
    guard let minutes = t.onSiteMinutes else { return feedback }
    return "\(feedback) · \(durationLabel(minutes)) avg on site"
}
