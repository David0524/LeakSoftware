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
#endif
