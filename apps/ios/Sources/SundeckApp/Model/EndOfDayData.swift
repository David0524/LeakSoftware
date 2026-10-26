import Foundation
import SundeckCore
import SundeckSync

// Today's end-of-day line (owner, 2026-10-26: "Today: 8 pools · 3 reports sent · 2 quotes
// accepted"), counted from the reports and quotes on this phone for the day's own stops. The rule
// is core `endOfDay` (SundeckCore/EndOfDay.swift); this reads the rows. Website lib/data.ts
// getDayWrapUp.

/// The line once every stop of the day is done, else nil.
func dayWrapUp(_ store: LocalStore, stops: [ScheduleJob], today: String, timeZone: String) -> String? {
    guard !stops.isEmpty, stops.allSatisfy({ $0.doneOn(today) }) else { return nil }
    var reports: [EndOfDayReport] = []
    var quotes: [EndOfDayQuote] = []
    for job in stops {
        for r in (try? store.list("report", jobId: job.id)) ?? [] where r["deleted_at"]?.string == nil {
            reports.append(EndOfDayReport(jobId: job.id, sentAt: r["sent_at"]?.string, status: r["status"]?.string))
        }
        for q in (try? store.list("quote", jobId: job.id)) ?? [] where q["deleted_at"]?.string == nil {
            quotes.append(EndOfDayQuote(jobId: job.id, acceptedAt: q["accepted_at"]?.string))
        }
    }
    return try? endOfDay(
        stops: stops.map { EndOfDayStop(id: $0.id, done: $0.doneOn(today)) }, reports: reports, quotes: quotes,
        today: today, timeZone: timeZone
    )?.line
}
