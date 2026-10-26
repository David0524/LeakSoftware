import Foundation

// The end-of-day card on Today (owner, 2026-10-26: "Today: 8 pools · 3 reports sent · 2 quotes
// accepted"): once every stop of the tech's day is done, it fills the empty "all done" card.
// Only the nonzero parts, counted from what's on this phone for the person's own day. Port of
// end-of-day.ts.

/// One of the day's stops: its job, and whether it's done for the day.
public struct EndOfDayStop: Codable, Equatable, Sendable {
    public var id: String
    public var done: Bool

    public init(id: String, done: Bool) {
        self.id = id
        self.done = done
    }
}

/// A report on the phone, as the count reads it.
public struct EndOfDayReport: Codable, Equatable, Sendable {
    public var jobId: String
    public var sentAt: String?
    public var status: String?

    enum CodingKeys: String, CodingKey {
        case status
        case jobId = "job_id"
        case sentAt = "sent_at"
    }

    public init(jobId: String, sentAt: String? = nil, status: String? = nil) {
        self.jobId = jobId
        self.sentAt = sentAt
        self.status = status
    }
}

/// A quote on the phone, as the count reads it.
public struct EndOfDayQuote: Codable, Equatable, Sendable {
    public var jobId: String
    public var acceptedAt: String?

    enum CodingKeys: String, CodingKey {
        case jobId = "job_id"
        case acceptedAt = "accepted_at"
    }

    public init(jobId: String, acceptedAt: String? = nil) {
        self.jobId = jobId
        self.acceptedAt = acceptedAt
    }
}

public struct EndOfDay: Codable, Equatable, Sendable {
    public var pools: Int
    public var reports: Int
    public var quotes: Int
    /// "Today: 8 pools · 3 reports sent · 2 quotes accepted".
    public var line: String
}

private func part(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }

/// The day's wrap-up line, or nil while a stop is still open (or the day has no stops). Only the
/// day's own jobs count, with their `sent_at` / `accepted_at` on `today` in the shop's time zone;
/// a job with several reports sent that day counts once.
public func endOfDay(
    stops: [EndOfDayStop], reports: [EndOfDayReport], quotes: [EndOfDayQuote], today: String, timeZone: String
) throws -> EndOfDay? {
    if stops.isEmpty || stops.contains(where: { !$0.done }) { return nil }
    let jobs = Set(stops.map(\.id))
    func onToday(_ iso: String?) throws -> Bool {
        guard let iso, !iso.isEmpty, let ms = ECMA.parseDate(iso) else { return false }
        return try localDate(Date(timeIntervalSince1970: ms / 1000), timeZone) == today
    }
    var reportJobs = Set<String>()
    for r in reports where jobs.contains(r.jobId) && r.status != "draft" {
        if try onToday(r.sentAt) { reportJobs.insert(r.jobId) }
    }
    var accepted = 0
    for q in quotes where jobs.contains(q.jobId) {
        if try onToday(q.acceptedAt) { accepted += 1 }
    }
    let pools = stops.count
    let parts = [
        part(pools, "pool", "pools"),
        reportJobs.isEmpty ? nil : "\(part(reportJobs.count, "report", "reports")) sent",
        accepted == 0 ? nil : "\(part(accepted, "quote", "quotes")) accepted",
    ].compactMap { $0 }
    return EndOfDay(
        pools: pools, reports: reportJobs.count, quotes: accepted, line: "Today: \(parts.joined(separator: " · "))")
}
