import Foundation
import SundeckCore
import SundeckSync

// What a pool's earlier visits tell this one (owner, 2026-10-26: "pre-fill what the app already
// knows"), read from this phone's database: each reading's last value as a hint ("Last 7.6"),
// the chemicals the pool usually gets (first in Add Chemical), and last visit's notes. The rules
// are core `Prefill` (SundeckCore/Prefill.swift); website lib/data.ts getPoolHistory.

struct PoolHistory: Equatable, Sendable {
    /// "Last 7.6" by reading key ("ph"); empty for a reading the pool has never had.
    var hints: [String: String] = [:]
    /// Price book item ids, the pool's usual chemicals first.
    var usual: [String] = []
    var note: LastVisitNote?
}

/// The pool's history for the visit `jobId` (its own readings and notes are left out).
func poolHistory(_ store: LocalStore, companyId: String, propertyId: String, jobId: String?, timeZone: String)
    -> PoolHistory
{
    var history = PoolHistory()
    let readings = chemicalReadings(store, companyId: companyId, propertyId: propertyId)
    let hintReadings = readings.map { HintReading(jobId: $0.jobId, recordedAt: $0.recordedAt, notes: $0.notes) }
    if let last = lastOtherReading(hintReadings, jobId: jobId),
        let match = readings.first(where: { $0.recordedAt == last.recordedAt && $0.jobId == last.jobId })
    {
        history.hints = readingHints(match.readings)
    }
    let additions = ((try? store.list("chemical_addition", companyId: companyId)) ?? [])
        .filter {
            $0["property_id"]?.string == propertyId && $0["deleted_at"]?.string == nil && $0["job_id"]?.string != jobId
        }
        .map {
            HintAddition(
                priceBookItemId: $0["price_book_item_id"]?.string, jobId: $0["job_id"]?.string,
                addedAt: $0["added_at"]?.string ?? "")
        }
    history.usual = usualChemicalIds(additions)
    let jobs = ((try? store.list("job", companyId: companyId)) ?? [])
        .filter {
            $0["property_id"]?.string == propertyId && $0["deleted_at"]?.string == nil
                && !($0["summary_notes"]?.string ?? "").isEmpty
        }
        .map {
            HintJob(
                id: $0.id, summaryNotes: $0["summary_notes"]?.string,
                when: $0["completed_at"]?.string ?? $0["scheduled_start"]?.string)
        }
    history.note = try? lastVisitNote(jobId: jobId, jobs: jobs, readings: hintReadings, timeZone: timeZone)
    return history
}
