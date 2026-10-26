import Foundation

// A tap you can feel when something finishes (owner, 2026-10-26: Apple principle 5, "Haptics on
// completion"). The moments are listed once, in packages/core/src/haptics.ts, and ported here
// (checked by the removal fixtures), so the iPhone app, the Android app and the website buzz at
// the same ones. The app maps a strength to SwiftUI's sensory feedback (UI/Haptics.swift).

public enum HapticStrength: String, Sendable {
    case light, success
}

/// `HAPTIC_MOMENTS`, in the same order.
public enum HapticMoment: String, CaseIterable, Sendable {
    /// A checklist item answered as done ("Done", "Not Leaking", "No").
    case checklistItemDone
    /// A suggested chemical marked added, one by one.
    case chemicalAdded
    /// Mark All Added.
    case allChemicalsAdded
    /// A job completed.
    case jobCompleted
    /// A report sent to the customer (visit report or the finished report).
    case reportSent
    /// A payment recorded.
    case paymentRecorded

    /// A checklist item or chemical marked done is a light tap; a whole set, a job, a report or a
    /// payment is the success tap.
    public var strength: HapticStrength {
        switch self {
        case .checklistItemDone, .chemicalAdded: .light
        case .allChemicalsAdded, .jobCompleted, .reportSent, .paymentRecorded: .success
        }
    }

    /// Keyed as `HAPTIC_MOMENTS`.
    public static let all: [String: String] = Dictionary(
        uniqueKeysWithValues: allCases.map { ($0.rawValue, $0.strength.rawValue) })
}
