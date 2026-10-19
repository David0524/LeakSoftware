import Foundation

/// How long a finished job stays on phones. Port of phone-history.ts; the server's window is
/// app.job_on_phones (20261012003400_phone_history_window.sql). The website keeps everything.
public let phoneHistoryDays = 90

/// Phones drop a job this many days after the server stops sending it, never before.
public let phoneHistoryMarginDays = 7

/// The dates `jobOnPhones` reads from a job row.
public struct JobDates: Codable, Sendable {
    public var status: JobStatus
    public var scheduledStart: String?
    public var completedAt: String?
    public var updatedAt: String?

    public init(status: JobStatus, scheduledStart: String? = nil, completedAt: String? = nil, updatedAt: String? = nil)
    {
        self.status = status
        self.scheduledStart = scheduledStart
        self.completedAt = completedAt
        self.updatedAt = updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case status
        case scheduledStart = "scheduled_start"
        case completedAt = "completed_at"
        case updatedAt = "updated_at"
    }
}

/// True while the job belongs on phones; `extraDays` widens the window (the phone's margin).
public func jobOnPhones(_ job: JobDates, now: Date, extraDays: Int = 0) -> Bool {
    if ![.done, .paid, .canceled].contains(job.status) { return true }
    var latest = 0.0
    for date in [job.scheduledStart, job.completedAt, job.updatedAt] {
        guard let date, !date.isEmpty else { continue }
        // An unreadable date makes Math.max NaN in TypeScript, and NaN is never >= the cutoff.
        guard let ms = ECMA.parseDate(date) else { return false }
        latest = max(latest, ms)
    }
    let cutoff = (now.timeIntervalSince1970 * 1000).rounded() - Double((phoneHistoryDays + extraDays) * 86_400_000)
    return latest >= cutoff
}

/// `new Date(ms).toISOString()`, for timestamps the phone writes (soft deletes).
public func isoTimestamp(milliseconds ms: Double) -> String {
    (try? ECMA.isoString(ms)) ?? ""
}
