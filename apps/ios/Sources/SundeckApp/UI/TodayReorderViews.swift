#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    // Today: changing the order of stops (owner, 2026-10-20; docs/plans/today-reorder.md). The
    // rules are in Model/TodayReorder.swift.

    /// Do Later and its Undo, handed to Today's card and stop rows.
    struct StopMoves {
        /// Do Later just done: Undo shows where it was pressed, for 5 seconds.
        var pending: StopMoveUndo?
        var doLater: (ScheduleJob, StopMoveUndo.Source) -> Void
        var undoMove: (StopMoveUndo) -> Void

        /// The pending Undo for this stop's row, or for the card.
        func shown(for source: StopMoveUndo.Source, jobId: String? = nil) -> StopMoveUndo? {
            guard let pending, pending.source == source, jobId == nil || pending.jobId == jobId else { return nil }
            return pending
        }
    }

    /// A stop in Reorder: its number, time and customer, the drive to it, and the drag handle, or
    /// a lock with why it stays ("Started", "Locked", "Time locked"). Move Up and Move Down are
    /// VoiceOver actions, not buttons (owner, 2026-10-22: "redundant to the drag").
    struct TodayReorderRow: View {
        var number: Int
        var job: ScheduleJob
        var timeZone: String
        var leg: Int
        var first: Bool
        /// Where the day starts: the first stop's drive is "from home" or "from the shop".
        var start: RouteStartLabel = .shop
        var lock: StopLock?
        var canUp: Bool
        var canDown: Bool
        var move: (StopPlace) -> Void

        var body: some View {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(verbatim: String(number))
                    .font(.custom(BrandFonts.Weight.bold.rawValue, size: 17, relativeTo: .body))
                    .foregroundStyle(Color.textMuted)
                    .frame(minWidth: 24, alignment: .leading)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    (Text(formatTime(job.scheduledStart, timeZone: timeZone))
                        .font(.custom(BrandFonts.Weight.bold.rawValue, size: 17, relativeTo: .body))
                        + Text(verbatim: "  ") + Text(job.customerName).font(.role(.bodyEmphasis)))
                        .monospacedDigit()
                        .foregroundStyle(Color.text)
                    Text(verbatim: "\(durationLabel(leg)) \(first ? startLegLabel(start) : "drive")")
                        .textRole(.secondary)
                        .foregroundStyle(Color.textMuted)
                    if let lock {
                        Label(lock.text, systemImage: "lock.fill")
                            .font(.role(.footnote).weight(.semibold))
                            .foregroundStyle(Color.textMuted)
                    }
                }
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
            .accessibilityAction(named: TodayReorderText.moveUp) { if canUp { move(.up) } }
            .accessibilityAction(named: TodayReorderText.moveDown) { if canDown { move(.down) } }
        }
    }
#endif
