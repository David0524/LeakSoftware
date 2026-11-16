import Foundation

// Water chemistry trends, out-of-range readings and dose limits (docs/design/2026-11-16-
// chemistry-trends.md). Turns the pool's chemical log into chart series, finds readings well
// outside their range (the alert and the Chemicals screen's Out of Range list), and warns when a
// tech records more of a chemical than is usual in one dose. Port of
// packages/core/src/chemistry-trends.ts.

private let dayMs = 86_400_000.0
private func round2(_ n: Double) -> Double { ECMA.round(n * 100) / 100 }
/// 7.5 -> "7.5", 8 -> "8", 7.25 -> "7.25".
private func show(_ n: Double) -> String { ECMA.numberString(round2(n)) }

// MARK: - Trends

public enum TrendPeriod: String, Codable, CaseIterable, Sendable {
    case days90 = "90d"
    case months6 = "6m"
    case year1 = "1y"
}

/// One choice of the Segmented control on a pool's chemical log.
public struct TrendPeriodInfo: Codable, Equatable, Sendable {
    public var key: TrendPeriod
    public var label: String
    public var days: Int
}

/// 90 Days | 6 Months | 1 Year (`TREND_PERIODS`).
public let trendPeriods: [TrendPeriodInfo] = [
    TrendPeriodInfo(key: .days90, label: "90 Days", days: 90),
    TrendPeriodInfo(key: .months6, label: "6 Months", days: 183),
    TrendPeriodInfo(key: .year1, label: "1 Year", days: 365),
]

public struct TrendWindow: Codable, Equatable, Sendable {
    public var from: String
    public var to: String
}

/// The period's first and last moment, ending now.
public func trendWindow(_ period: TrendPeriod, now: String) -> TrendWindow {
    let days = trendPeriods.first { $0.key == period }?.days ?? 90
    let to = ECMA.parseDate(now) ?? 0
    return TrendWindow(
        from: (try? ECMA.isoString(to - Double(days) * dayMs)) ?? "",
        to: (try? ECMA.isoString(to)) ?? "")
}

public struct TrendPoint: Codable, Equatable, Sendable {
    public var at: String
    public var value: Double
}

/// One reading's line: its points, the range to shade, the chart's vertical span.
public struct ReadingSeries: Codable, Equatable, Sendable, Identifiable {
    public var key: ReadingKey
    public var label: String
    public var points: [TrendPoint]
    public var low: Double
    public var high: Double
    public var min: Double
    public var max: Double
    public var latest: Double
    /// low, ok or high.
    public var status: String
    /// One sentence for VoiceOver.
    public var summary: String

    public var id: String { key.rawValue }
}

private let readingOrder: [ReadingKey] = [.fc, .ph, .ta, .ch, .cya, .salt]

/// A line per reading taken in the period, oldest point first, each with the range the pool
/// aims for (`readingSeries`).
public func readingSeries(_ readings: [ChemicalReading], period: TrendPeriod, now: String) -> [ReadingSeries] {
    let w = trendWindow(period, now: now)
    let from = ECMA.parseDate(w.from) ?? .nan
    let to = ECMA.parseDate(w.to) ?? .nan
    let rows = ECMA.sort(
        readings.filter {
            guard let t = ECMA.parseDate($0.recordedAt) else { return false }
            return t >= from && t <= to
        }
    ) { a, b in (ECMA.parseDate(a.recordedAt) ?? 0) - (ECMA.parseDate(b.recordedAt) ?? 0) }
    var out: [ReadingSeries] = []
    for key in readingOrder {
        let taken = rows.filter { ($0.readings[key]?.isFinite) ?? false }
        guard let last = taken.last else { continue }
        let points = taken.map { TrendPoint(at: $0.recordedAt, value: $0.readings[key]!) }
        let range = goalRange(targets(last.cya)[key], key, last.goals?[key])
        let low = round2(range.low)
        let high = round2(range.high)
        let values = points.map(\.value)
        let lowest = values.min()!
        let highest = values.max()!
        let lo = Swift.min(lowest, low)
        let hi = Swift.max(highest, high)
        let pad = hi > lo ? (hi - lo) * 0.1 : 1
        let latest = values[values.count - 1]
        let status = latest < low ? "low" : latest > high ? "high" : "ok"
        let word = status == "ok" ? "in range" : status
        let aim = "Aim for \(show(low)) to \(show(high))."
        let summary =
            points.count == 1
            ? "\(key.label): 1 reading, \(show(latest)) (\(word)). \(aim)"
            : "\(key.label): \(points.count) readings, from \(show(values[0])) to \(show(latest)) (\(word)). "
                + "Lowest \(show(lowest)), highest \(show(highest)). \(aim)"
        out.append(
            ReadingSeries(
                key: key, label: key.label, points: points, low: low, high: high,
                min: round2(Swift.max(0, lo - pad)), max: round2(hi + pad), latest: latest, status: status,
                summary: summary))
    }
    return out
}

/// What the pool's added chemicals cost in one calendar month.
public struct CostBar: Codable, Equatable, Sendable, Identifiable {
    /// "2026-10"
    public var month: String
    /// "Oct"
    public var label: String
    public var cents: Cents

    public var id: String { month }
}

private let shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

private func trendMonthKey(_ ms: Double, _ zone: TimeZone) -> String {
    let w = ECMA.wallClock(ms, zone)
    return "\(ECMA.yearString(w.year))-\(ECMA.pad(String(w.month), 2))"
}

/// What the pool's added chemicals cost each calendar month of the period, oldest first, a bar
/// for every month (`chemicalCostBars`).
public func chemicalCostBars(
    _ additions: [ChemicalAddition], period: TrendPeriod, now: String, timeZone: String
) -> [CostBar] {
    guard let zone = try? ECMA.zone(timeZone) else { return [] }
    let w = trendWindow(period, now: now)
    guard let fromMs = ECMA.parseDate(w.from), let toMs = ECMA.parseDate(w.to) else { return [] }
    let first = trendMonthKey(fromMs, zone)
    let last = trendMonthKey(toMs, zone)
    var byMonth: [String: [ChemicalAddition]] = [:]
    for a in additions where a.live {
        guard let ms = ECMA.parseDate(a.addedAt) else { continue }
        byMonth[trendMonthKey(ms, zone), default: []].append(a)
    }
    var bars: [CostBar] = []
    var year = Int(first.prefix(4)) ?? 0
    var month = Int(first.dropFirst(5).prefix(2)) ?? 1
    for _ in 0..<14 {
        let m = "\(ECMA.pad(String(year), 4))-\(ECMA.pad(String(month), 2))"
        if m > last { break }
        bars.append(CostBar(month: m, label: shortMonths[month - 1], cents: additionsCents(byMonth[m] ?? [])))
        month += 1
        if month > 12 {
            month = 1
            year += 1
        }
    }
    return bars
}

/// The cost chart for VoiceOver: "Chemicals cost $85.00 in 4 months. Aug $0.00, Sep $40.00…".
public func costSummary(_ bars: [CostBar]) -> String {
    let total = bars.reduce(0) { $0 + $1.cents }
    let list = bars.map { "\($0.label) \(formatCents($0.cents))" }.joined(separator: ", ")
    return "Chemicals cost \(formatCents(total)) in \(bars.count) \(bars.count == 1 ? "month" : "months"). \(list)."
}

// MARK: - Out of range

extension ReadingKey {
    /// How far past the range's edge a reading must be to count as out of range
    /// (`OUT_OF_RANGE_MARGIN`).
    public var outOfRangeMargin: Double {
        switch self {
        case .fc: 1
        case .ph: 0.2
        case .ta: 20
        case .ch: 50
        case .cya: 10
        case .salt: 300
        }
    }
}

public struct OutOfRangeReading: Codable, Equatable, Sendable {
    public var key: ReadingKey
    public var label: String
    public var value: Double
    /// "7.4": the value as it reads in a sentence.
    public var valueText: String
    /// "7.4–7.6"
    public var range: String
    /// low or high.
    public var direction: String
}

/// The readings of one log entry outside their range by more than the margin.
public func outOfRangeReadings(_ r: ChemicalReading) -> [OutOfRangeReading] {
    let t = targets(r.cya)
    var out: [OutOfRangeReading] = []
    for key in readingOrder {
        guard let value = r.readings[key], value.isFinite else { continue }
        let range = goalRange(t[key], key, r.goals?[key])
        let margin = key.outOfRangeMargin
        let direction: String? =
            value < range.low - margin ? "low" : value > range.high + margin ? "high" : nil
        guard let direction else { continue }
        out.append(
            OutOfRangeReading(
                key: key, label: key.label, value: value, valueText: show(value),
                range: "\(show(range.low))–\(show(range.high))", direction: direction))
    }
    return out
}

/// One out-of-range reading on the Out of Range list.
public struct OutOfRangeRow: Codable, Equatable, Sendable, Identifiable {
    public var key: ReadingKey
    public var label: String
    public var value: Double
    public var valueText: String
    public var range: String
    public var direction: String
    /// "<log entry id>:<reading key>"
    public var id: String
    public var readingId: String
    public var propertyId: String
    public var recordedAt: String
    public var recordedBy: String?
}

/// The last 30 days' out-of-range readings, newest first (`outOfRangeRows`).
public func outOfRangeRows(_ readings: [ChemicalReading], now: String, days: Int = 30) -> [OutOfRangeRow] {
    let nowMs = ECMA.parseDate(now) ?? .nan
    let from = nowMs - Double(days) * dayMs
    var rows: [OutOfRangeRow] = []
    for r in readings {
        guard let at = ECMA.parseDate(r.recordedAt), at >= from, at <= nowMs else { continue }
        for o in outOfRangeReadings(r) {
            rows.append(
                OutOfRangeRow(
                    key: o.key, label: o.label, value: o.value, valueText: o.valueText, range: o.range,
                    direction: o.direction, id: "\(r.id):\(o.key.rawValue)", readingId: r.id,
                    propertyId: r.propertyId, recordedAt: r.recordedAt, recordedBy: r.recordedBy))
        }
    }
    return ECMA.sort(rows) { a, b in
        (ECMA.parseDate(b.recordedAt) ?? 0) - (ECMA.parseDate(a.recordedAt) ?? 0)
    }
}

/// "pH 8.2 high (aim 7.4–7.6)".
public func outOfRangeLine(_ o: OutOfRangeReading) -> String {
    "\(o.label) \(o.valueText) \(o.direction) (aim \(o.range))"
}

/// The push to owners and admins: "Rebecca Soto: pH 8.2 high (aim 7.4–7.6)".
public func outOfRangeNotification(_ customer: String, _ found: [OutOfRangeReading]) -> NotificationText {
    NotificationText(
        title: found.count == 1 ? "Out-of-range reading" : "Out-of-range readings",
        body: "\(customer): \(found.map(outOfRangeLine).joined(separator: ", "))")
}

// MARK: - Dose limits

public struct DoseLimit: Codable, Equatable, Sendable {
    public var quantity: Double
    public var unit: String
}

/// The most of each chemical that is usual in one dose, per 10,000 gallons (`DOSE_LIMITS`): a
/// warning, never a block.
public let doseLimits: [String: DoseLimit] = [
    "liquid_chlorine": DoseLimit(quantity: 1, unit: "gal"),
    "muriatic_acid": DoseLimit(quantity: 0.5, unit: "gal"),
    "dry_acid": DoseLimit(quantity: 2, unit: "lb"),
    "cal_hypo": DoseLimit(quantity: 2, unit: "lb"),
    "tabs": DoseLimit(quantity: 3, unit: "tab"),
    "baking_soda": DoseLimit(quantity: 3, unit: "lb"),
    "soda_ash": DoseLimit(quantity: 1, unit: "lb"),
    "calcium_chloride": DoseLimit(quantity: 3, unit: "lb"),
    "stabilizer": DoseLimit(quantity: 3, unit: "lb"),
    "salt": DoseLimit(quantity: 3, unit: "bag"),
    "algaecide": DoseLimit(quantity: 0.25, unit: "gal"),
    "clarifier": DoseLimit(quantity: 0.125, unit: "gal"),
    "enzyme": DoseLimit(quantity: 0.125, unit: "gal"),
    "phosphate_remover": DoseLimit(quantity: 0.25, unit: "gal"),
]

/// "That's more than the usual 1 gal per 10,000 gal at once. Check the amount." when `quantity`
/// of the chemical is above the limit for the pool's gallons; nil when it's fine or can't be
/// compared.
public func doseWarning(chemical: String?, unit: String, quantity: Double, gallons: Double?) -> String? {
    guard let chemical, let limit = doseLimits[chemical], let gallons, gallons > 0, quantity > 0,
        let per10k = convertQuantity(limit.quantity, from: limit.unit, to: unit)
    else { return nil }
    if quantity <= per10k * gallons / 10_000 + 1e-9 { return nil }
    let usual = formatQuantity(per10k, unit: unit)
    return "That’s more than the usual \(usual) per 10,000 gal at once. Check the amount."
}
