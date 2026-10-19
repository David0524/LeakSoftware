#if os(iOS)
    import SundeckCore
    import SundeckTokens
    import SwiftUI

    /// A test's outcome as a filled pill: Pass, Fail or Unclear. Nothing for a test without one.
    /// Port of apps/mobile/src/features/inspection/OutcomeChip.tsx.
    struct OutcomeChip: View {
        var outcome: Outcome?

        init(outcome: Outcome?) { self.outcome = outcome }

        var body: some View {
            if let outcome {
                Chip(text: outcome.label, tone: outcome.tone)
                    .accessibilityLabel("Outcome: \(outcome.label)")
            }
        }
    }

    extension Outcome {
        /// The chip's fill: pass green, fail red, unclear amber.
        var color: Color { tone.color }
    }
#endif
