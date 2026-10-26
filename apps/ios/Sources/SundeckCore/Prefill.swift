import Foundation

// What the app already knows, so a tech types less (owner, 2026-10-26: "pre-fill what the app
// already knows"). Hints, never values: a reading is never filled in for the tech (a made-up
// reading is worse than none); its last value shows as a hint ("Last 7.6"). The chemicals a pool
// usually gets go first in Add Chemical, last visit's notes sit under the visit's notes, and a
// customer's usual tech and time start a new job's fields. Port of prefill.ts.

/// A reading from the pool's log, as the hints read it.
public struct HintReading: Codable, Equatable, Sendable {
    public var jobId: String?
    public var recordedAt: String
    public var notes: String?

    enum CodingKeys: String, CodingKey {
        case notes
        case jobId = "job_id"
        case recordedAt = "recorded_at"
    }

    public init(jobId: String? = nil, recordedAt: String, notes: String? = nil) {
        self.jobId = jobId
        self.recordedAt = recordedAt
        self.notes = notes
    }
}

/// The pool's last reading from another visit (not this one), newest by time.
public func lastOtherReading(_ readings: [HintReading], jobId: String?) -> HintReading? {
    var best: HintReading?
    var at = -Double.infinity
    for r in readings {
        if let jobId, !jobId.isEmpty, r.jobId == jobId { continue }
        let when = ECMA.parseDate(r.recordedAt) ?? -Double.infinity
        if best == nil || when > at {
            best = r
            at = when
        }
    }
    return best
}

/// "Last 7.6", "Last 3", under an empty reading box: the value from the pool's last visit, for
/// each reading it has, keyed by reading ("ph"). pH shows one decimal, the rest as typed.
public func readingHints(_ last: Readings?) -> [String: String] {
    var out: [String: String] = [:]
    guard let last else { return out }
    for key in ReadingKey.allCases {
        guard let v = last[key], v.isFinite else { continue }
        out[key.rawValue] = "Last \(key == .ph ? ECMA.toFixed(v, 1) : ECMA.numberString(v))"
    }
    return out
}

/// A chemical added on a past visit to the pool.
public struct HintAddition: Codable, Equatable, Sendable {
    public var priceBookItemId: String?
    public var jobId: String?
    public var addedAt: String

    enum CodingKeys: String, CodingKey {
        case priceBookItemId = "price_book_item_id"
        case jobId = "job_id"
        case addedAt = "added_at"
    }

    public init(priceBookItemId: String? = nil, jobId: String? = nil, addedAt: String) {
        self.priceBookItemId = priceBookItemId
        self.jobId = jobId
        self.addedAt = addedAt
    }
}

/// The chemicals this pool usually gets: price book item ids from its past additions, most visits
/// first, then the most recent (ties keep the order they were first seen). An item added twice in
/// one visit counts once.
public func usualChemicalIds(_ past: [HintAddition], limit: Int = 4) -> [String] {
    struct Entry {
        var id: String
        var jobs: Set<String>
        var latest: Double
    }
    var entries: [Entry] = []
    for (i, a) in past.enumerated() {
        guard let id = a.priceBookItemId, !id.isEmpty else { continue }
        var found = entries.firstIndex { $0.id == id }
        if found == nil {
            entries.append(Entry(id: id, jobs: [], latest: -Double.infinity))
            found = entries.count - 1
        }
        let index = found!
        entries[index].jobs.insert(a.jobId ?? "row-\(i)")
        if let t = ECMA.parseDate(a.addedAt), t > entries[index].latest { entries[index].latest = t }
    }
    let ranked = entries.enumerated().sorted { a, b in
        if a.element.jobs.count != b.element.jobs.count { return a.element.jobs.count > b.element.jobs.count }
        if a.element.latest != b.element.latest { return a.element.latest > b.element.latest }
        return a.offset < b.offset
    }
    return ranked.prefix(max(0, limit)).map(\.element.id)
}

/// Add Chemical's list: the pool's usual chemicals first, then the rest in price book order.
public struct PickList: Codable, Equatable, Sendable {
    public var usual: [ChemicalItem]
    public var rest: [ChemicalItem]
}

/// A search filters both groups. `items` are the shop's chemicals (`chemicalItems`).
public func pickList(_ items: [ChemicalItem], usualIds: [String], query: String = "") -> PickList {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    func match(_ i: ChemicalItem) -> Bool { q.isEmpty || i.name.lowercased().contains(q) }
    var byId: [String: ChemicalItem] = [:]
    for i in items where byId[i.id] == nil { byId[i.id] = i }
    let usual = usualIds.compactMap { byId[$0] }
    let taken = Set(usual.map(\.id))
    return PickList(usual: usual.filter(match), rest: items.filter { !taken.contains($0.id) && match($0) })
}

public let lastVisitNotesTitle = "Last visit"

public struct LastVisitNote: Codable, Equatable, Sendable {
    /// "Last visit · Mon, Oct 19".
    public var label: String
    public var text: String
}

/// A past job, as the last visit's notes read it.
public struct HintJob: Codable, Equatable, Sendable {
    public var id: String
    public var summaryNotes: String?
    public var when: String?

    enum CodingKeys: String, CodingKey {
        case id, when
        case summaryNotes = "summary_notes"
    }

    public init(id: String, summaryNotes: String? = nil, when: String? = nil) {
        self.id = id
        self.summaryNotes = summaryNotes
        self.when = when
    }
}

/// The notes from the pool's last visit: the newest of an earlier visit's job notes and an earlier
/// reading's notes. Nil when there are none.
public func lastVisitNote(jobId: String?, jobs: [HintJob], readings: [HintReading], timeZone: String) throws
    -> LastVisitNote?
{
    var found: [(text: String, at: Double, iso: String)] = []
    func add(_ text: String?, _ iso: String?) {
        let t = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !t.isEmpty, let iso, let at = ECMA.parseDate(iso) else { return }
        found.append((t, at, iso))
    }
    let current = jobId ?? ""
    for j in jobs where j.id != current || current.isEmpty { add(j.summaryNotes, j.when) }
    for r in readings where current.isEmpty || r.jobId != current { add(r.notes, r.recordedAt) }
    guard var newest = found.first else { return nil }
    for f in found.dropFirst() where f.at > newest.at { newest = f }
    guard let ms = ECMA.parseDate(newest.iso) else { return nil }
    let day = try formatDay(localDate(Date(timeIntervalSince1970: ms / 1000), timeZone), style: .short)
    return LastVisitNote(label: "\(lastVisitNotesTitle) · \(day)", text: newest.text)
}

/// A scheduled job, as the usual tech and time read it.
public struct HintVisit: Codable, Equatable, Sendable {
    public var assignedUserId: String?
    public var scheduledStart: String?

    enum CodingKeys: String, CodingKey {
        case assignedUserId = "assigned_user_id"
        case scheduledStart = "scheduled_start"
    }

    public init(assignedUserId: String? = nil, scheduledStart: String? = nil) {
        self.assignedUserId = assignedUserId
        self.scheduledStart = scheduledStart
    }
}

public struct UsualVisit: Codable, Equatable, Sendable {
    public var techId: String?
    /// "09:00", the shop's local start time.
    public var time: String?
}

/// The value most of the sample share, when it's clear (at least 2, and at least 60% of it); the
/// first value seen wins a tie.
private func clearMajority(_ values: [String]) -> String? {
    var order: [String] = []
    var counts: [String: Int] = [:]
    for v in values {
        if counts[v] == nil { order.append(v) }
        counts[v, default: 0] += 1
    }
    var best: String?
    var n = 0
    for v in order where counts[v]! > n {
        best = v
        n = counts[v]!
    }
    return best != nil && n >= 2 && Double(n) >= Double(values.count) * 0.6 ? best : nil
}

/// A customer's usual tech and start time at a pool, for a new job's fields, from its last four
/// scheduled jobs: the tech and the time most of them share. Only when it's obvious.
public func usualVisit(_ jobs: [HintVisit], timeZone: String) throws -> UsualVisit? {
    let dated = jobs.enumerated().compactMap { i, j -> (index: Int, job: HintVisit, at: Double)? in
        guard let start = j.scheduledStart, let at = ECMA.parseDate(start) else { return nil }
        return (i, j, at)
    }
    let recent = dated.sorted { a, b in a.at != b.at ? a.at > b.at : a.index < b.index }.prefix(4)
    let techs = recent.compactMap { $0.job.assignedUserId }.filter { !$0.isEmpty }
    let times = try recent.map { try minutesToClock(localMinutes($0.job.scheduledStart!, timeZone)) }
    let techId = clearMajority(techs)
    let time = clearMajority(times)
    return techId != nil || time != nil ? UsualVisit(techId: techId, time: time) : nil
}
