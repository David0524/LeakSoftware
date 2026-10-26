#if os(iOS)
    import SundeckCore
    import SwiftUI

    // A tap you can feel when something finishes (owner, 2026-10-26: Apple principle 5). The
    // moments are core's `HapticMoment` (packages/core/src/haptics.ts, checked by fixtures), the
    // same as Android and the website; this maps their strength to SwiftUI's sensory feedback.

    extension HapticStrength {
        var feedback: SensoryFeedback {
            switch self {
            case .light: .impact(weight: .light)
            case .success: .success
            }
        }
    }

    extension View {
        /// A tap at `moment`, each time `trigger` changes (a counter bumped after the save works).
        func haptic<T: Equatable>(_ moment: HapticMoment, trigger: T) -> some View {
            sensoryFeedback(moment.strength.feedback, trigger: trigger)
        }
    }
#endif
