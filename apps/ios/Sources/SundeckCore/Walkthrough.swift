// The walkthrough after onboarding (owner, 2026-10-16): no single guided tour, but a tip on each
// screen the first time someone opens it (HIG Onboarding: "consider providing a collection of
// context-specific tips"), and three cards when the phone app first opens. Each varies by role
// (owner or tech) and package (pool care or leak detection). Every tip names a feature that
// exists on that screen; check the screen before changing a tip's words.

/// Where a tip shows: the website or the phone app. Port of walkthrough.ts.
public enum TipPlatform: String, Codable, CaseIterable, Sendable {
    case web, app
}

/// Who a tip is for.
public enum TipRole: String, Codable, CaseIterable, Sendable {
    case owner, tech
}

/// The package a tip is about: pool care or leak detection.
public enum TipPackage: String, Codable, CaseIterable, Sendable {
    case pool, leak
}

/// A tip shown once on a screen.
public struct Tip: Codable, Equatable, Sendable {
    public var id: String
    public var platform: TipPlatform
    /// The screen it sits on (the page's or route's short name).
    public var screen: String
    public var roles: [TipRole]
    /// Shops that do this package see it; nil: every shop.
    public var pkg: TipPackage?
    public var title: String
    public var message: String
}

private let everyone: [TipRole] = [.owner, .tech]
private let owners: [TipRole] = [.owner]

/// Every tip, website first.
public let tips: [Tip] = [
    // Website
    Tip(
        id: "web-today", platform: .web, screen: "today", roles: everyone, title: "Your day, stop by stop",
        message: "Today lists the stops in order, with directions. On My Way texts the customer that you’re coming."),
    Tip(
        id: "web-schedule", platform: .web, screen: "schedule", roles: owners, title: "Day, week, or month",
        message: "Switch views at the top. Plan Route puts a tech’s stops for the day in driving order."),
    Tip(
        id: "web-messages", platform: .web, screen: "messages", roles: everyone, title: "One inbox for the whole shop",
        message:
            "Texts to the shop number land here for everyone. Swipe a conversation, or right-click it on a computer, to mark it unread."
    ),
    Tip(
        id: "web-customers-pool", platform: .web, screen: "customers", roles: owners, pkg: .pool,
        title: "Give each pool a visit plan",
        message:
            "Open a customer to set the day, how often, and the price per visit. Visits then appear on the schedule weeks ahead."
    ),
    Tip(
        id: "web-invoices-pool", platform: .web, screen: "invoices", roles: owners, pkg: .pool,
        title: "Monthly billing, drafted for you",
        message:
            "At the start of each month, Sundeck Pro drafts one invoice per customer from last month’s finished visits. Review them, then send."
    ),
    Tip(
        id: "web-invoices-leak", platform: .web, screen: "invoices", roles: owners, pkg: .leak,
        title: "Get paid online",
        message:
            "Customers pay an invoice by card, Apple Pay, or bank from the link you send, and it’s marked paid on its own."
    ),
    Tip(
        id: "web-dashboard", platform: .web, screen: "dashboard", roles: owners, title: "Your shop at a glance",
        message: "Money collected, what you’re owed, and quotes accepted, month by month."),
    Tip(
        id: "web-chemicals", platform: .web, screen: "chemicals", roles: everyone, pkg: .pool,
        title: "Readings in, amounts out",
        message:
            "Enter the pool’s gallons and today’s readings. What to Add lists each chemical in the order to add it, in gallons, cups, or pounds."
    ),
    Tip(
        id: "web-jobs-leak", platform: .web, screen: "jobs", roles: everyone, pkg: .leak,
        title: "Every job, start to finish",
        message: "Open a job for its checklist, tests, findings, report, and quote, all on one page."),

    // Phone app
    Tip(
        id: "app-jobs", platform: .app, screen: "jobs", roles: everyone, title: "Today comes first",
        message:
            "Today’s jobs are at the top. Pull down to sync. Everything works with no signal and sends when you’re back in range."
    ),
    Tip(
        id: "app-visit", platform: .app, screen: "job", roles: everyone, pkg: .pool, title: "Work down the checklist",
        message:
            "Mark each task Done, Needs Attention, or Skipped. The Chemical Calculator says what to add from your readings."
    ),
    Tip(
        id: "app-inspection", platform: .app, screen: "job", roles: everyone, pkg: .leak, title: "Inspect step by step",
        message:
            "Checklist for each spot, Tests for pressure and dye readings, Findings for what you found, with photos on each."
    ),
    Tip(
        id: "app-report", platform: .app, screen: "report", roles: everyone, pkg: .leak, title: "Finish on site",
        message:
            "Write the report from your findings, then go over it with the homeowner and have them sign on your phone."),
    Tip(
        id: "app-chemicals", platform: .app, screen: "chemicals", roles: everyone, pkg: .pool,
        title: "Readings in, amounts out",
        message:
            "Enter today’s readings. What to Add lists each chemical in the order to add it, in gallons, cups, or pounds."
    ),
    Tip(
        id: "app-messages", platform: .app, screen: "messages", roles: everyone, title: "The shop’s shared inbox",
        message: "Texts to the shop number land here for the whole team."),
]

private func offers(_ services: Services, _ pkg: TipPackage?) -> Bool {
    guard let pkg else { return true }
    return services == .both || services.rawValue == pkg.rawValue
}

/// The tip to show on a screen, or nil. `pkg` narrows to one package when the screen is about
/// one (a pool visit or a leak inspection), whatever else the shop does.
public func tipFor(
    platform: TipPlatform, screen: String, role: String?, services: Services, seen: [String],
    pkg: TipPackage? = nil
) -> Tip? {
    // Admins get the owners' tips: they run the office the same way.
    let tipRole: TipRole = role == "owner" || role == "admin" ? .owner : .tech
    return tips.first { t in
        t.platform == platform && t.screen == screen && t.roles.contains(tipRole) && offers(services, t.pkg)
            && (pkg == nil || t.pkg == nil || t.pkg == pkg) && !seen.contains(t.id)
    }
}

/// Tip ids from stored data (a user's metadata, a phone's storage), ignoring anything else.
public func seenTips(_ value: JSONValue?) -> [String] {
    Array((value?.array ?? []).compactMap(\.string).prefix(200))
}

// MARK: - The phone app's first launch: three cards, then straight to work

/// A card shown when the phone app first opens.
public struct LaunchCard: Codable, Equatable, Sendable {
    /// An icon the app knows.
    public enum Icon: String, Codable, Sendable {
        case calendar, checklist, chemistry, search, report, offline
    }

    public var icon: Icon
    public var title: String
    public var message: String
}

/// The three first-launch cards for a shop's package.
public func launchCards(_ services: Services) -> [LaunchCard] {
    switch services {
    case .pool:
        [
            LaunchCard(
                icon: .calendar, title: "Your route, on your phone",
                message: "Today’s visits are at the top of the list, with directions to each pool."),
            LaunchCard(
                icon: .checklist, title: "Every visit, the same way",
                message: "Work down the checklist, add photos, and the Chemical Calculator says what to add."),
            LaunchCard(
                icon: .offline, title: "No signal? Keep working.",
                message: "Everything saves on the phone and sends when you’re back in range."),
        ]
    case .leak:
        [
            LaunchCard(
                icon: .calendar, title: "Today’s jobs, in order",
                message: "Your jobs for the day are at the top of the list, with directions."),
            LaunchCard(
                icon: .search, title: "Inspect step by step",
                message: "The checklist, pressure and dye tests, photos, and findings, all on the job."),
            LaunchCard(
                icon: .report, title: "Report on site, even with no signal",
                message: "The homeowner signs on your phone. It all sends when you’re back in range."),
        ]
    case .both:
        [
            LaunchCard(
                icon: .calendar, title: "Your day, on your phone",
                message: "Today’s visits and jobs are at the top of the list, with directions."),
            LaunchCard(
                icon: .checklist, title: "Visits and inspections",
                message:
                    "Pool visits have a checklist and the Chemical Calculator; leak jobs have tests, findings, and a report."
            ),
            LaunchCard(
                icon: .offline, title: "No signal? Keep working.",
                message: "Everything saves on the phone and sends when you’re back in range."),
        ]
    }
}

// MARK: - Getting Started: owners' first steps, ticked from the shop's own data

/// What the shop has done so far. Port of ShopProgress in walkthrough.ts.
public struct ShopProgress: Equatable, Sendable {
    /// Active members, counting the owner.
    public var people: Int
    public var openInvites: Int
    public var hasLogo: Bool
    /// Stripe account connected and able to take payments.
    public var paymentsReady: Bool
    public var customers: Int
    public var visitPlans: Int
    public var leakJobs: Int
    public var reportsSent: Int
    public var invoicesSent: Int

    public init(
        people: Int = 1, openInvites: Int = 0, hasLogo: Bool = false, paymentsReady: Bool = false,
        customers: Int = 0, visitPlans: Int = 0, leakJobs: Int = 0, reportsSent: Int = 0, invoicesSent: Int = 0
    ) {
        self.people = people
        self.openInvites = openInvites
        self.hasLogo = hasLogo
        self.paymentsReady = paymentsReady
        self.customers = customers
        self.visitPlans = visitPlans
        self.leakJobs = leakJobs
        self.reportsSent = reportsSent
        self.invoicesSent = invoicesSent
    }
}

/// One Getting Started step.
public struct StartStep: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var detail: String
    /// The website page it opens.
    public var href: String
    public var done: Bool
}

/// The shop's first steps for its package. Port of gettingStarted in walkthrough.ts.
public func gettingStarted(_ services: Services, _ p: ShopProgress) -> [StartStep] {
    let pool = services != .leak
    let leak = services != .pool
    let steps: [StartStep?] = [
        StartStep(
            id: "invite", label: "Invite your techs", detail: "They sign in on the Sundeck Pro app.",
            href: "/settings/team", done: p.people > 1 || p.openInvites > 0),
        leak
            ? StartStep(
                id: "logo", label: "Add your logo", detail: "It goes on every report, quote, and invoice.",
                href: "/settings/company", done: p.hasLogo) : nil,
        pool
            ? StartStep(
                id: "customers", label: "Add your customers and their pools",
                detail: "Import a spreadsheet, or add them one by one.", href: "/settings/import",
                done: p.customers > 0) : nil,
        pool
            ? StartStep(
                id: "plans", label: "Give each pool a visit plan",
                detail: "The day, how often, and the price per visit.", href: "/customers", done: p.visitPlans > 0)
            : nil,
        StartStep(
            id: "payments", label: "Set up customer payments",
            detail: "Card, Apple Pay, or bank, paid to your own Stripe account.", href: "/settings/payments",
            done: p.paymentsReady),
        leak
            ? StartStep(
                id: "job", label: "Book your first leak job", detail: "Inspect it on the phone.", href: "/jobs/new",
                done: p.leakJobs > 0) : nil,
        leak
            ? StartStep(
                id: "report", label: "Send your first report", detail: "Finished on site and sent to the homeowner.",
                href: "/jobs", done: p.reportsSent > 0) : nil,
        pool
            ? StartStep(
                id: "invoices", label: "Send your first invoices",
                detail: "Monthly billing is drafted from finished visits.", href: "/invoices", done: p.invoicesSent > 0)
            : nil,
    ]
    return steps.compactMap { $0 }
}
