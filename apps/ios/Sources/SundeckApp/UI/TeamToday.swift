#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// One tech's row on the owner's Team: core `techDayProgress`, with the time in words.
    struct TeamTodayRow: Sendable, Equatable, Identifiable {
        var id: String
        var label: String
        var color: TechColor
        var day: TechDayProgress
        /// "Last done: Jones at 10:42 AM".
        var lastDone: String?

        /// What VoiceOver reads for the row.
        var spoken: String {
            [
                label, day.progress.text != nil ? day.progress.spoken : day.line,
                day.current.map { "\($0.started ? "In progress" : "Now"): \($0.customer)" }, lastDone,
            ].compactMap { $0 }.joined(separator: ", ")
        }
    }

    /// How often the owner's Today brings teammates' changes down while it shows (else every minute).
    let teamSyncSeconds: Double = 15

    /// The owner's Team on Today (owner, 2026-10-22: "The owner sees techs' progress live"; docs/
    /// design/2026-10-22-owner-live-today.md), as the website's: an inset grouped list, one row per
    /// tech with stops today in Whose Day's order: the day's ring, the dot and name with the ring's
    /// words, the stop they're on (Now, or In progress once started), and the last stop done with
    /// its time. Choosing a row shows that tech's day, as Whose Day does.
    struct TeamToday: View {
        var rows: [TeamTodayRow]
        var shown: String
        var pick: (String) -> Void

        var body: some View {
            Grouped(label: teamTodayTitle, separatorInset: 16 + 28 + 12) {
                ForEach(rows) { row in
                    Button {
                        pick(row.id)
                    } label: {
                        content(row)
                    }
                    .buttonStyle(.row)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(row.spoken)
                    .accessibilityHint(row.id == shown ? "" : "Shows their day")
                    .accessibilityAddTraits(row.id == shown ? [.isButton, .isSelected] : .isButton)
                }
            }
            .padding(.bottom, 20)
        }

        private func content(_ row: TeamTodayRow) -> some View {
            HStack(alignment: .center, spacing: 12) {
                DayRing(progress: row.day.progress)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        TechDot(color: row.color)
                        Text(row.label).textRole(.bodyEmphasis).foregroundStyle(Color.text).lineLimit(1)
                        Spacer(minLength: 8)
                        Text(row.day.line)
                            .textRole(.secondary)
                            .foregroundStyle(Color.textMuted)
                            .monospacedDigit()
                            .contentTransition(.numericText())
                            .lineLimit(1)
                    }
                    if let current = row.day.current {
                        HStack(spacing: 8) {
                            if current.started { StatusChip(status: .inProgress) } else { NowPill() }
                            Text(current.customer).textRole(.secondary).foregroundStyle(Color.text).lineLimit(1)
                        }
                    }
                    if let last = row.lastDone {
                        Text(last).textRole(.footnote).foregroundStyle(Color.textMuted).lineLimit(1)
                    }
                }
                Chevron()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .background(row.id == shown ? Color.brandPrimary.opacity(0.06) : Color.clear)
            .contentShape(Rectangle())
        }
    }
#endif
