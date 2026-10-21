import Foundation

// Notifications and the Live Activity (owner, 2026-10-19; docs/plans/
// live-activities-and-notifications.md). Port of notifications.ts: the words live in core so the
// website (which sends the pushes) and both apps (which show them and the Live Activity) say the
// same thing.

public enum NotificationKind: String, Codable, CaseIterable, Sendable {
    case text, job, quote, payment, report, live
}

/// Each kind a person can turn off in More › Notifications (`NOTIFICATION_KINDS`).
public let notificationKinds: [(key: NotificationKind, label: String, hint: String)] = [
    (.text, "Customer texts", "A customer texts the shop's number."),
    (.job, "New and moved jobs", "A job is given to you, or its time changes."),
    (.quote, "Accepted quotes", "A customer accepts a quote."),
    (.payment, "Payments", "A customer pays a deposit or an invoice."),
    (.report, "Signed reports", "A customer signs a report."),
    (.live, "Live Activity", "Your current stop on the Lock Screen during the workday."),
]

/// Whether a person gets a kind: on unless their notification prefs turn it off.
public func notificationOn(_ prefs: JSONValue?, _ kind: NotificationKind) -> Bool {
    guard case .object(let p)? = prefs else { return true }
    return p[kind.rawValue] != .bool(false)
}

/// The kinds owners and admins get for the whole shop; techs get them for their own jobs.
public let shopNotificationKinds: [NotificationKind] = [.payment]

public struct NotificationText: Codable, Equatable, Sendable {
    public var title: String
    public var body: String

    public init(title: String, body: String) {
        self.title = title
        self.body = body
    }
}

/// `$1,250.00`: `(cents / 100).toLocaleString("en-US", 2 decimals)` after a "$".
private func notificationMoney(_ cents: Double) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "en_US")
    f.numberStyle = .decimal
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    f.roundingMode = .halfUp
    return "$" + (f.string(from: NSNumber(value: cents / 100)) ?? "")
}

/// A text from a customer: their name (or number) and what they wrote, cut to fit.
public func textNotification(_ from: String, _ body: String) -> NotificationText {
    let text = ECMA.trim(body).replacing(/\s+/, with: " ")
    let units = Array(text.utf16)
    let cut =
        units.count > 180 ? String(decoding: units.prefix(177), as: UTF16.self) + "…" : text
    return NotificationText(title: from, body: cut.isEmpty ? "Sent a picture" : cut)
}

/// A job given to you or moved: "New stop Tue 9:30 AM" / "Stop moved to Tue 9:30 AM".
public func jobNotification(moved: Bool, customer: String, address: String?, when: String?) -> NotificationText {
    let at = (when?.isEmpty == false) ? " \(when!)" : ""
    return NotificationText(
        title: moved ? "Stop moved to\(at.isEmpty ? " another day" : at)" : "New stop\(at)",
        body: [customer, address].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", "))
}

public func quoteNotification(_ customer: String, _ totalCents: Double) -> NotificationText {
    NotificationText(title: "Quote accepted", body: "\(customer) accepted the \(notificationMoney(totalCents)) quote.")
}

public func paymentNotification(_ customer: String, _ amountCents: Double, _ what: String) -> NotificationText {
    NotificationText(title: "Payment received", body: "\(customer) paid \(notificationMoney(amountCents)) (\(what)).")
}

public func reportNotification(_ customer: String) -> NotificationText {
    NotificationText(title: "Report signed", body: "\(customer) signed the report.")
}

// MARK: - The Live Activity: the stop a tech is on

/// What the Live Activity shows. No timer or stopwatch (owner, 2026-10-19): before leaving, the
/// stop's scheduled time ("ahead", from the start of the workday); on the way, the arrival time
/// of day; at the pool, the checklist; done, the next stop.
public enum LiveStopPhase: String, Codable, CaseIterable, Hashable, Sendable {
    case ahead
    case driving
    case onSite = "on_site"
    case done
}

/// The next stop after this one.
public struct LiveStopNext: Codable, Hashable, Sendable {
    public var customer: String
    public var time: String?

    public init(customer: String, time: String?) {
        self.customer = customer
        self.time = time
    }
}

/// The Live Activity's input (`LiveStopInput`), also its ActivityKit content state.
public struct LiveStopInput: Codable, Hashable, Sendable {
    public var phase: LiveStopPhase
    public var customer: String
    public var address: String?
    public var stop: Int
    public var stops: Int
    /// Arrival, as a time of day ("9:42 AM"), when driving.
    public var eta: String?
    /// The stop's scheduled time of day ("9:00 AM"), shown before On My Way.
    public var scheduled: String?
    public var checklistDone: Int
    public var checklistTotal: Int
    public var next: LiveStopNext?
    /// The pool's access notes: gate code, which gate, dogs (property.access_notes).
    public var access: String?
    /// The plan's cleanings on this visit (filter, salt cell), with how soon each is due. Optional
    /// so a Live Activity state saved before it existed still decodes.
    public var cleanings: [StopCleaning]?

    public init(
        phase: LiveStopPhase, customer: String, address: String?, stop: Int, stops: Int, eta: String?,
        scheduled: String? = nil, checklistDone: Int, checklistTotal: Int, next: LiveStopNext?,
        access: String? = nil, cleanings: [StopCleaning]? = nil
    ) {
        self.phase = phase
        self.customer = customer
        self.address = address
        self.stop = stop
        self.stops = stops
        self.eta = eta
        self.scheduled = scheduled
        self.checklistDone = checklistDone
        self.checklistTotal = checklistTotal
        self.next = next
        self.access = access
        self.cleanings = cleanings
    }
}

/// A cleaning on a stop's visit (`StopCleaning`): its name, its kind (for the icon) and how soon
/// it's due.
public struct StopCleaning: Codable, Hashable, Sendable {
    public var name: String
    public var kind: CleaningKind
    public var days: Int
    public var weeks: Int

    public init(name: String, kind: CleaningKind, days: Int, weeks: Int) {
        self.name = name
        self.kind = kind
        self.days = days
        self.weeks = weeks
    }
}

/// A cleaning as the card and the Live Activity show it (`CleaningBadge`): its icon, a few words
/// ("Overdue", "Today", "3 days", "2 weeks"), and aloud ("Clean filter due in 3 days").
public struct CleaningBadge: Codable, Hashable, Sendable {
    public var kind: CleaningKind
    public var label: String
    public var spoken: String
    public var overdue: Bool

    public init(kind: CleaningKind, label: String, spoken: String, overdue: Bool) {
        self.kind = kind
        self.label = label
        self.spoken = spoken
        self.overdue = overdue
    }
}

/// A visit's cleanings as badges, soonest first (`cleaningBadges`).
public func cleaningBadges(_ list: [StopCleaning]?) -> [CleaningBadge] {
    // A stable sort by days, as JavaScript's.
    (list ?? []).enumerated()
        .sorted { $0.element.days != $1.element.days ? $0.element.days < $1.element.days : $0.offset < $1.offset }
        .map { _, c in
            CleaningBadge(
                kind: c.kind, label: cleaningShortLabel(days: c.days, weeks: c.weeks),
                spoken: cleaningDueSpoken(c.name, days: c.days, weeks: c.weeks), overdue: c.days < 0)
        }
}

/// What the Live Activity shows for a stop (`LiveStopContent`).
public struct LiveStopContent: Codable, Equatable, Sendable {
    /// "On the way to Smith", "At Smith", "Smith done".
    public var headline: String
    /// The one large figure: "2 of 5" (the stop), "4 of 9" (the checklist), or the check.
    public var figure: String
    /// Under the figure: "Stop", "Checklist", "Next stop".
    public var figureLabel: String
    /// "Stop 3 of 7 · 123 Palm Ln"
    public var detail: String
    /// "Then: Jones", or nil when this is the last stop.
    public var next: String?
    /// 0..1 along the day's stops (done ones and this one), for the progress bar.
    public var progress: Double
    /// The compact Dynamic Island's few characters: "9:42", "4/9", "✓".
    public var compact: String
    /// One sentence for VoiceOver.
    public var spoken: String
    /// The stop's access notes on one line, with a key on the Lock Screen, until the stop is
    /// done (owner, 2026-10-20); nil when there are none.
    public var access: String? = nil
    /// The cleanings on this visit (owner, 2026-10-20: "The filter/salt cell cleaning alert needs
    /// to be on the new Today tile and the live activity"), soonest first, until the stop is done.
    public var cleanings: [CleaningBadge] = []
}

/// Access notes as one short line: spaces and line breaks collapsed, at most 90 characters.
public func accessLine(_ notes: String?) -> String? {
    let one = ECMA.trim((notes ?? "").replacing(/\s+/, with: " "))
    if one.isEmpty { return nil }
    let units = Array(one.utf16)
    guard units.count > 90 else { return one }
    var cut = String(decoding: units.prefix(89), as: UTF16.self)
    while let last = cut.last, last.isWhitespace { cut.removeLast() }
    return cut + "…"
}

public func liveStopContent(_ s: LiveStopInput) -> LiveStopContent {
    var content = liveStopBase(s)
    content.access = s.phase == .done ? nil : accessLine(s.access)
    content.cleanings = s.phase == .done ? [] : cleaningBadges(s.cleanings)
    if let access = content.access { content.spoken += " Access: \(access)" }
    if !content.cleanings.isEmpty {
        content.spoken += " " + content.cleanings.map(\.spoken).joined(separator: ", ") + "."
    }
    return content
}

private func liveStopBase(_ s: LiveStopInput) -> LiveStopContent {
    // No clock times (owner, 2026-10-20: "I don't like times in the live activity. Pool Jobs
    // aren't really scheduled for a certain time"): before arriving, the figure is the stop's
    // place in the day, and the next stop is named without a time. `eta` and `scheduled` are
    // ignored.
    let of = "Stop \(s.stop) of \(s.stops)"
    let detail = [of, s.address].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    let next = s.next.map { "Then: \($0.customer)" }
    let doneStops = s.phase == .done ? s.stop : s.stop - 1
    let progress =
        s.stops > 0
        ? min(1, max(0, (Double(doneStops) + (s.phase == .onSite ? 0.5 : 0)) / Double(s.stops))) : 0
    let place = s.stops > 0 ? "\(s.stop) of \(s.stops)" : ""
    let compactPlace = place.isEmpty ? "…" : "\(s.stop)/\(s.stops)"
    switch s.phase {
    case .ahead:
        return LiveStopContent(
            headline: "Up next: \(s.customer)", figure: place.isEmpty ? "Today" : place,
            figureLabel: place.isEmpty ? "" : "Stop", detail: detail, next: next, progress: progress,
            compact: compactPlace, spoken: "Up next: \(s.customer). \(of).")
    case .driving:
        return LiveStopContent(
            headline: "On the way to \(s.customer)", figure: place.isEmpty ? "On the way" : place,
            figureLabel: place.isEmpty ? "" : "Stop", detail: detail, next: next, progress: progress,
            compact: compactPlace, spoken: "On the way to \(s.customer). \(of).")
    case .onSite:
        let list = s.checklistTotal > 0 ? "\(s.checklistDone) of \(s.checklistTotal)" : ""
        return LiveStopContent(
            headline: "At \(s.customer)", figure: list.isEmpty ? "On site" : list,
            figureLabel: list.isEmpty ? "" : "Checklist", detail: detail, next: next, progress: progress,
            compact: s.checklistTotal > 0 ? "\(s.checklistDone)/\(s.checklistTotal)" : "•",
            spoken:
                "At \(s.customer).\(list.isEmpty ? "" : " Checklist \(list).") \(of).\(next.map { " \($0)." } ?? "")")
    case .done:
        return LiveStopContent(
            headline: "\(s.customer) done", figure: "✓", figureLabel: next != nil ? "Next stop" : "Last stop",
            detail: of, next: next ?? "That was the last stop today.", progress: progress, compact: "✓",
            spoken: "\(s.customer) done. \(next.map { "\($0)." } ?? "That was the last stop today.")")
    }
}

/// Whether the Live Activity runs now (owner, 2026-10-19: "Live Activity should begin at the
/// beginning of the workday"): on one of the shop's work days, from the start of its working
/// day (Settings › Scheduling), while any of the tech's stops today aren't done.
public func liveStopRuns(settings: JSONValue?, date: String, nowMin: Int, stopsLeft: Int) -> Bool {
    let r = routingSettings(settings)
    guard let day = weekday(date), r.workDays.contains(day) else { return false }
    return nowMin >= workDay(r).startMin && stopsLeft > 0
}
