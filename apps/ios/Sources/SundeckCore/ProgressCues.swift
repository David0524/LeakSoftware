// Progress cues (owner, 2026-10-22, goal-gradient ideas; docs/design/2026-10-22-progress-cues.md):
// the day's ring on Today, and Mark Complete standing out once a checklist is all done.
// Port of packages/core/src/progress-cues.ts.

/// One stop of the day, as the ring counts it. Port of ProgressStop.
public struct ProgressStop: Codable, Equatable, Sendable {
    /// Done for the day.
    public var done: Bool
    /// The time planned at the pool.
    public var durationMin: Int
    /// The drive into it, when known.
    public var driveMin: Int?
    /// The tech is there (started): its drive is behind them.
    public var onSite: Bool?

    public init(done: Bool, durationMin: Int, driveMin: Int?, onSite: Bool = false) {
        self.done = done
        self.durationMin = durationMin
        self.driveMin = driveMin
        self.onSite = onSite
    }
}

public enum DayProgressState: String, Codable, Sendable {
    case start, going, closing
    case allDone = "all_done"
}

/// The ring and the words beside it on Today's summary line. Port of DayProgress.
public struct DayProgress: Codable, Equatable, Sendable {
    public var state: DayProgressState
    public var done: Int
    public var total: Int
    public var left: Int
    /// The ring's fill, 0 to 1.
    public var fraction: Double
    /// Remaining stops' time at the pool plus the drives into them (not the drive home).
    public var minutesLeft: Int
    /// "4 of 11 stops", "2 left · about 1 hr", "All 11 done"; nil at the start of the day, when
    /// the line keeps the plan ("11 stops · 2 hr 5 min driving").
    public var text: String?
    /// What the ring says to VoiceOver.
    public var spoken: String
}

/// The last few stops count down instead of up.
public let closingStops = 3

/// "about 1 hr", "about 35 min": nearest 5 minutes under an hour, else nearest 15.
public func aboutLabel(_ min: Int) -> String {
    let m = max(0, min)
    let step = m < 60 ? 5 : 15
    let rounded = Int((Double(m) / Double(step)).rounded()) * step
    return "about \(durationLabel(max(5, rounded)))"
}

/// The ring and the words beside it on Today's summary line. Port of dayProgress.
public func dayProgress(_ stops: [ProgressStop]) -> DayProgress {
    let total = stops.count
    let done = stops.filter(\.done).count
    let left = total - done
    let minutesLeft = stops.filter { !$0.done }
        .reduce(0) { $0 + $1.durationMin + (($1.onSite ?? false) ? 0 : ($1.driveMin ?? 0)) }
    let fraction = total > 0 ? Double(done) / Double(total) : 0
    func make(_ state: DayProgressState, _ text: String?, _ spoken: String) -> DayProgress {
        DayProgress(
            state: state, done: done, total: total, left: left, fraction: fraction, minutesLeft: minutesLeft,
            text: text, spoken: spoken)
    }
    if total > 0 && left == 0 { return make(.allDone, "All \(total) done", "All \(total) done") }
    let spokenCount = "\(done) of \(total) \(total == 1 ? "stop" : "stops") done"
    if done == 0 { return make(.start, nil, spokenCount) }
    if left <= closingStops {
        let time = minutesLeft > 0 ? aboutLabel(minutesLeft) : nil
        return make(
            .closing, (["\(left) left"] + [time].compactMap { $0 }).joined(separator: " · "),
            (["\(left) \(left == 1 ? "stop" : "stops") left"] + [time].compactMap { $0 }).joined(separator: ", "))
    }
    return make(.going, "\(done) of \(total) stops", spokenCount)
}

/// A checklist with nothing left to do, so Mark Complete is the last thing.
public func checklistReady(_ done: Int, _ total: Int) -> Bool {
    total > 0 && done >= total
}

/// The line over Mark Complete once everything else is done.
public let completeReadyLine = "Everything’s checked. Mark it complete."
