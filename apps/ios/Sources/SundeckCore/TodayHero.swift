import Foundation

// Today's card for the stop a tech is on (owner, 2026-10-20; docs/plans/today-hero.md): the
// Live Activity's stop, words and figure, brought into the app, with the buttons for that
// moment. The Live Activity uses the same rule, so the Lock Screen and the card pick the same
// stop. No timer or countdown (owner, 2026-10-19). Port of today-hero.ts.

/// One of the day's stops, as the card reads it (`HeroStop`).
public struct HeroStop: Codable, Equatable, Sendable {
    public var id: String
    public var type: String
    public var status: String
    public var stopDoneOn: String?
    public var scheduledStart: String?
    /// When On My Way was sent, and the arrival it promised (job.on_my_way_at, arrive_at).
    public var onMyWayAt: String?
    public var arriveAt: String?
    public var customer: String
    public var address: String?
    public var access: String?
    /// The plan's cleanings on this visit, with how soon each is due.
    public var cleanings: [StopCleaning]?
    public var checklistDone: Int
    public var checklistTotal: Int

    enum CodingKeys: String, CodingKey {
        case id, type, status, customer, address, access, cleanings, checklistDone, checklistTotal
        case stopDoneOn = "stop_done_on"
        case scheduledStart = "scheduled_start"
        case onMyWayAt = "on_my_way_at"
        case arriveAt = "arrive_at"
    }

    public init(
        id: String, type: String, status: String, stopDoneOn: String? = nil, scheduledStart: String? = nil,
        onMyWayAt: String? = nil, arriveAt: String? = nil, customer: String, address: String?,
        access: String? = nil, cleanings: [StopCleaning]? = nil, checklistDone: Int, checklistTotal: Int
    ) {
        self.id = id
        self.type = type
        self.status = status
        self.stopDoneOn = stopDoneOn
        self.scheduledStart = scheduledStart
        self.onMyWayAt = onMyWayAt
        self.arriveAt = arriveAt
        self.customer = customer
        self.address = address
        self.access = access
        self.cleanings = cleanings
        self.checklistDone = checklistDone
        self.checklistTotal = checklistTotal
    }

    func done(_ day: String) -> Bool { stopDone(status: status, stopDoneOn: stopDoneOn, day: day) }
}

/// The card's moment: the Live Activity's phases, or the day's end (`HeroMoment`).
public enum HeroMoment: String, Codable, CaseIterable, Sendable {
    case ahead
    case driving
    case onSite = "on_site"
    case done
    case dayDone = "day_done"
}

public enum HeroSegment: String, Codable, Sendable {
    case done, current, todo
}

/// The card for a tech's day (`TodayHero`).
public struct TodayHero: Codable, Equatable, Sendable {
    public var moment: HeroMoment
    /// The stop on the card (nil when the day is done).
    public var stopId: String?
    /// Its place in the day, from 1.
    public var stop: Int
    public var stops: Int
    /// What it says: the Live Activity's content, or the day's end.
    public var content: LiveStopContent
    /// One segment per stop, in route order.
    public var segments: [HeroSegment]
    public var doneCount: Int
    /// The stop the day is on (what the card shows unless the tech swiped to another), for Back
    /// to Now. Nil when the day is done.
    public var currentId: String?
    /// Whether the card shows a stop the tech picked, not the one the day is on.
    public var browsing: Bool = false
    /// What the content was made from (nil when the day is done): the Live Activity's state, so
    /// the Lock Screen shows exactly what the card does. Not part of the TypeScript shape.
    public var input: LiveStopInput? = nil

    enum CodingKeys: String, CodingKey {
        case moment, stopId, stop, stops, content, segments, doneCount, currentId, browsing
    }

    // `currentId` is encoded even when nil (TypeScript's `currentId: null`).
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(moment, forKey: .moment)
        try c.encode(stopId, forKey: .stopId)
        try c.encode(stop, forKey: .stop)
        try c.encode(stops, forKey: .stops)
        try c.encode(content, forKey: .content)
        try c.encode(segments, forKey: .segments)
        try c.encode(doneCount, forKey: .doneCount)
        try c.encode(currentId, forKey: .currentId)
        try c.encode(browsing, forKey: .browsing)
    }
}

private func instant(_ iso: String) throws -> Date {
    guard let ms = ECMA.parseDate(iso) else { throw DateRuleError.invalidTimeValue }
    return Date(timeIntervalSince1970: ms / 1000)
}

/// "9:00 AM" for a non-empty time, else nil (TypeScript's `iso ? formatTime(iso) : null`).
private func timeOrNil(_ iso: String?, _ timeZone: String) throws -> String? {
    guard let iso, !iso.isEmpty else { return nil }
    return try formatTime(iso, timeZone)
}

/// Whether On My Way was sent for this stop today (in the shop's time zone).
public func onTheWay(_ s: HeroStop, today: String, timeZone: String) throws -> Bool {
    guard let sent = s.onMyWayAt, !sent.isEmpty else { return false }
    return try localDate(instant(sent), timeZone) == today && s.status != "in_progress" && !s.done(today)
}

/// The card for a tech's day. Stops come in route order. The stop shown: the one on the way (On
/// My Way today), else one already started, else the first not done. `justDone` is a stop
/// completed in the last minute, shown done with the next one before the card moves on (the
/// phones pass it; the website shows the next stop at once). `viewing` is a stop the tech swiped
/// or tapped to (owner, 2026-10-20: "a better way to move the hero tile back to a previous
/// job"): the card shows it, done or not, until they go Back to Now. Nil when there are no stops.
public func todayHero(
    stops: [HeroStop], today: String, timeZone: String, justDone: String? = nil, viewing: String? = nil
) throws -> TodayHero? {
    guard let hero = try dayHero(stops: stops, today: today, timeZone: timeZone, justDone: justDone) else {
        return nil
    }
    guard let viewing, !viewing.isEmpty, let at = stops.firstIndex(where: { $0.id == viewing }),
        stops[at].id != hero.stopId
    else { return hero }
    var picked = try stopHero(stops: stops, at: at, today: today, timeZone: timeZone)
    picked.currentId = hero.currentId
    picked.browsing = true
    return picked
}

/// The card for one stop the tech picked: done, at the pool, on the way, or still ahead.
private func stopHero(stops: [HeroStop], at: Int, today: String, timeZone: String) throws -> TodayHero {
    let s = stops[at]
    let doneFlags = stops.map { $0.done(today) }
    let leftIndices = stops.indices.filter { !doneFlags[$0] }
    let phase: LiveStopPhase =
        doneFlags[at]
        ? .done
        : s.status == "in_progress" ? .onSite : try onTheWay(s, today: today, timeZone: timeZone) ? .driving : .ahead
    let next = try leftIndices.first(where: { $0 > at }).map {
        LiveStopNext(customer: stops[$0].customer, time: try timeOrNil(stops[$0].scheduledStart, timeZone))
    }
    let input = LiveStopInput(
        phase: phase, customer: s.customer, address: s.address, stop: at + 1, stops: stops.count,
        eta: phase == .driving ? try timeOrNil(s.arriveAt, timeZone) : nil,
        scheduled: try timeOrNil(s.scheduledStart, timeZone), checklistDone: s.checklistDone,
        checklistTotal: s.checklistTotal, next: next, access: s.access, cleanings: s.cleanings ?? [])
    return TodayHero(
        moment: HeroMoment(rawValue: phase.rawValue)!, stopId: s.id, stop: at + 1, stops: stops.count,
        content: liveStopContent(input),
        segments: stops.indices.map { $0 == at ? .current : doneFlags[$0] ? .done : .todo },
        doneCount: stops.count - leftIndices.count, input: input)
}

/// The card for the stop the day is on (`dayHero`).
private func dayHero(stops: [HeroStop], today: String, timeZone: String, justDone: String?) throws
    -> TodayHero?
{
    if stops.isEmpty { return nil }
    let doneFlags = stops.map { $0.done(today) }
    let leftIndices = stops.indices.filter { !doneFlags[$0] }
    let left = leftIndices.map { stops[$0] }
    let doneCount = stops.count - left.count
    let targetIndex =
        try leftIndices.first { try onTheWay(stops[$0], today: today, timeZone: timeZone) }
        ?? leftIndices.first { stops[$0].status == "in_progress" }
        ?? leftIndices.first
    let justDoneIndex: Int? =
        (justDone?.isEmpty == false) ? stops.indices.first { stops[$0].id == justDone && doneFlags[$0] } : nil
    func segments(current: Int?) -> [HeroSegment] {
        stops.indices.map { $0 == current ? .current : doneFlags[$0] ? .done : .todo }
    }
    func nextAfter(_ at: Int) throws -> LiveStopNext? {
        guard let n = leftIndices.first(where: { $0 > at }) else { return nil }
        return LiveStopNext(customer: stops[n].customer, time: try timeOrNil(stops[n].scheduledStart, timeZone))
    }

    if justDoneIndex != nil || targetIndex == nil {
        guard let at = justDoneIndex else {
            let n = stops.count
            return TodayHero(
                moment: .dayDone, stopId: nil, stop: n, stops: n,
                content: LiveStopContent(
                    headline: n == 1 ? "The stop is done" : "All \(n) stops done", figure: "✓",
                    figureLabel: "Day done", detail: "", next: nil, progress: 1, compact: "✓",
                    spoken: "All \(n) \(n == 1 ? "stop" : "stops") done today.", access: nil, cleanings: []),
                segments: stops.map { _ in .done }, doneCount: doneCount, currentId: nil)
        }
        let s = stops[at]
        let next = try left.first.map {
            LiveStopNext(customer: $0.customer, time: try timeOrNil($0.scheduledStart, timeZone))
        }
        let input = LiveStopInput(
            phase: .done, customer: s.customer, address: s.address, stop: at + 1, stops: stops.count,
            eta: nil, checklistDone: s.checklistDone, checklistTotal: s.checklistTotal, next: next)
        return TodayHero(
            moment: .done, stopId: s.id, stop: at + 1, stops: stops.count, content: liveStopContent(input),
            segments: segments(current: nil), doneCount: doneCount, currentId: s.id, input: input)
    }

    let at = targetIndex!
    let target = stops[at]
    let phase: LiveStopPhase =
        target.status == "in_progress"
        ? .onSite : try onTheWay(target, today: today, timeZone: timeZone) ? .driving : .ahead
    let eta = phase == .driving ? try timeOrNil(target.arriveAt, timeZone) : nil
    let scheduled = try timeOrNil(target.scheduledStart, timeZone)
    let input = LiveStopInput(
        phase: phase, customer: target.customer, address: target.address, stop: at + 1, stops: stops.count,
        eta: eta, scheduled: scheduled, checklistDone: target.checklistDone, checklistTotal: target.checklistTotal,
        next: try nextAfter(at), access: target.access, cleanings: target.cleanings ?? [])
    return TodayHero(
        moment: HeroMoment(rawValue: phase.rawValue)!, stopId: target.id, stop: at + 1, stops: stops.count,
        content: liveStopContent(input), segments: segments(current: at), doneCount: doneCount,
        currentId: target.id, input: input)
}

/// The card's main button (`HERO_ACTION_LABELS` keys).
public enum HeroAction: String, Codable, CaseIterable, Sendable {
    case onMyWay = "on_my_way"
    case startJob = "start_job"
    case openChecklist = "open_checklist"

    /// "On My Way", "Start", "Open Checklist" (`HERO_ACTION_LABELS`; owner, 2026-10-20: "Change
    /// 'start job' to 'start'").
    public var label: String {
        switch self {
        case .onMyWay: "On My Way"
        case .startJob: "Start"
        case .openChecklist: "Open Checklist"
        }
    }
}

public struct HeroActions: Codable, Equatable, Sendable {
    /// Start Job or Open Checklist (never On My Way: that's in Message).
    public var primary: HeroAction?
    /// Mark Complete (or Complete Visit) beside it.
    public var complete: Bool
    /// Message opens with the On My Way text.
    public var onMyWay: Bool
    /// A finished stop's one button: Reopen Visit or Mark Not Complete (owner, 2026-10-20: the
    /// card is always about one stop, and its buttons are for that stop).
    public var undo: Bool
}

/// The card's buttons for its moment: the main one, whether Mark Complete shows beside it,
/// whether Message opens with the On My Way text, and on a finished stop its undo. Start Job is
/// the main button from the start, so a tech who doesn't send On My Way never has to (owner,
/// 2026-10-20: "not every tech is going to use every function all the time"). Someone looking
/// at another tech's day (owners and admins, "Whose day") gets no On My Way, Start Job or undo:
/// those are the tech's to press (decision 4).
public func heroActions(_ moment: HeroMoment, mine: Bool) -> HeroActions {
    switch moment {
    case .ahead: HeroActions(primary: mine ? .startJob : nil, complete: false, onMyWay: mine, undo: false)
    case .driving: HeroActions(primary: mine ? .startJob : nil, complete: false, onMyWay: false, undo: false)
    case .onSite: HeroActions(primary: .openChecklist, complete: true, onMyWay: false, undo: false)
    case .done: HeroActions(primary: nil, complete: false, onMyWay: false, undo: mine)
    case .dayDone: HeroActions(primary: nil, complete: false, onMyWay: false, undo: false)
    }
}

/// "Leak detection · Stop 3 of 7", under the name.
public func heroSubtitle(_ typeLabel: String, stop: Int, stops: Int, moment: HeroMoment) -> String {
    moment == .dayDone ? "" : "\(typeLabel) · Stop \(stop) of \(stops)"
}

/// "14 min drive", under the address before leaving (decision 5). Nil without a drive.
public func heroDrive(_ moment: HeroMoment, _ driveMin: Int?) -> String? {
    guard moment == .ahead, let driveMin, driveMin > 0 else { return nil }
    if driveMin < 60 { return "\(driveMin) min drive" }
    let h = driveMin / 60
    let m = driveMin % 60
    return "\(h) hr\(m > 0 ? " \(m) min" : "") drive"
}

/// What each progress segment says to VoiceOver: "2 of 7 stops done".
public func heroSegmentsSpoken(doneCount: Int, stops: Int) -> String {
    "\(doneCount) of \(stops) \(stops == 1 ? "stop" : "stops") done"
}

/// The card's headline: the moment, since the customer's name is right under it (owner,
/// 2026-10-20: "At Derek Jeter" over "Derek Jeter" said it twice). The Lock Screen keeps
/// `content.headline`, which has the name. Day done keeps its own ("All 6 stops done").
public func heroHeadline(_ moment: HeroMoment, headline: String) -> String {
    switch moment {
    case .ahead: "Up next"
    case .driving: "On the way"
    case .onSite: "At the pool"
    case .done: "Done"
    case .dayDone: headline
    }
}

public func heroHeadline(_ hero: TodayHero) -> String { heroHeadline(hero.moment, headline: hero.content.headline) }

/// The card's top line, naming the stop's place once (owner, 2026-10-20: no clock times; the
/// figure already shows "2 of 5" before arriving): "Up next", or "At the pool · Stop 2 of 5".
public func heroTopLine(_ hero: TodayHero) -> String {
    heroTopLine(
        hero.moment, headline: hero.content.headline, figureLabel: hero.content.figureLabel, stop: hero.stop,
        stops: hero.stops)
}

public func heroTopLine(_ moment: HeroMoment, headline: String, figureLabel: String, stop: Int, stops: Int) -> String {
    let head = heroHeadline(moment, headline: headline)
    if moment == .dayDone || figureLabel == "Stop" { return head }
    return "\(head) · Stop \(stop) of \(stops)"
}
