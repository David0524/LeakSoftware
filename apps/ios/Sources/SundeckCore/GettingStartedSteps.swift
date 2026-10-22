// Getting Started (owner, 2026-10-16): owners' first steps, ticked from the shop's own data.
// Port of packages/core/src/getting-started.ts.

/// What the shop has done so far. Port of ShopProgress in getting-started.ts.
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
    /// The shop's sample job (owner, 2026-10-22: first win): its id while it's there, and whether
    /// the owner sent its report to themselves (or deleted it). Nil for shops that never had one.
    public var sample: SampleProgress?

    public init(
        people: Int = 1, openInvites: Int = 0, hasLogo: Bool = false, paymentsReady: Bool = false,
        customers: Int = 0, visitPlans: Int = 0, leakJobs: Int = 0, reportsSent: Int = 0, invoicesSent: Int = 0,
        sample: SampleProgress? = nil
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
        self.sample = sample
    }
}

/// The sample job's part of ShopProgress.
public struct SampleProgress: Codable, Equatable, Sendable {
    public var jobId: String?
    public var done: Bool

    public init(jobId: String?, done: Bool) {
        self.jobId = jobId
        self.done = done
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

/// The shop's first steps for its package. Port of gettingStarted in getting-started.ts.
public func gettingStarted(_ services: Services, _ p: ShopProgress) -> [StartStep] {
    let pool = services != .leak
    let leak = services != .pool
    let steps: [StartStep?] = [
        // A head start (owner, 2026-10-22: goal-gradient): the list opens at 1 of N done.
        StartStep(
            id: "account", label: "Account created", detail: "Your shop is on Sundeck Pro.",
            href: "/settings/company", done: true),
        // The first win (owner, 2026-10-22): a finished report with the shop's own logo, sent to
        // themselves, before anything else.
        p.sample.flatMap { sample in
            sample.jobId != nil || sample.done
                ? StartStep(
                    id: "sample", label: "Send yourself the sample report",
                    detail: "See what your customers get, with your shop's name and logo.",
                    href: sample.jobId.map { "/jobs/\($0)" } ?? "/jobs", done: sample.done) : nil
        },
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
