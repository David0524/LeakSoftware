import Foundation
import SundeckCore
import SundeckLiveStop
import SundeckSync

// One-handed use in the field (owner, 2026-10-20: "Do all changes except for 11";
// docs/design/2026-10-20-one-handed-use.md): the rules behind the keyboard bar, the report
// prompt, Undo after Mark Remaining, saving typed text by itself, and taking photos, worked out
// without SwiftUI so they're tested on Linux.

// MARK: - Keyboard bar (spec 3)

/// The bar over the keyboard on the test and finding sheets.
public enum KeyboardBarText {
    public static let previous = "Previous"
    public static let next = "Next"
    public static let done = "Done"
}

/// The field Previous (`by: -1`) or Next (`by: 1`) moves to among `order`, or nil at either
/// end. From no field, Next starts at the first.
public func fieldStep(_ order: [String], from current: String?, by step: Int) -> String? {
    guard let current, let index = order.firstIndex(of: current) else { return step > 0 ? order.first : nil }
    let next = index + step
    return order.indices.contains(next) ? order[next] : nil
}

// MARK: - Saved by itself (spec 4)

/// Typed text saves 1 second after typing stops, and when the field or screen is left.
public enum Autosave {
    public static let delay: Duration = .seconds(1)
    /// The short line after each save, in secondary text.
    public static let saved = "Saved"
}

// MARK: - Ask before completing sends the report; Undo after Mark Remaining (spec 5)

/// Completing a maintenance visit in a shop that sends visit reports by itself asks first
/// (owner, 2026-10-20: "maybe when you press complete it prompts you with 'are you ready to
/// send'"): a centered alert. Nothing is asked when completing sends nothing.
public enum CompleteSendPrompt {
    public static let title = "Ready to send the visit report?"
    public static let cancel = "Cancel"
    public static let confirm = "Complete and Send"

    /// "Completing this visit sends its report to Maria Lopez." ("to the customer" without a name).
    public static func message(customer: String?) -> String {
        let name = customer?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return "Completing this visit sends its report to \(name.isEmpty ? "the customer" : name)."
    }

    /// Whether completing this job sends a report, so it asks first.
    public static func asks(jobType: JobType, settings: JSONValue?) -> Bool {
        jobType == .maintenance && visitReportMode(settings) == .auto
    }
}

public enum UndoText {
    /// How long Undo stays where Mark Remaining was.
    public static let seconds = 5
    public static let undo = "Undo"
    /// Mark Remaining's line: "Marked 4".
    public static func marked(_ count: Int) -> String { "Marked \(count)" }
}

/// Mark N Remaining just done: for 5 seconds, Undo puts the items it answered back to To do.
public struct MarkedUndo: Equatable, Sendable {
    public var resultIds: [String]

    public init(resultIds: [String]) { self.resultIds = resultIds }

    /// "Marked 4".
    public var text: String { UndoText.marked(resultIds.count) }

    @MainActor
    public func undo(_ sync: SyncService, companyId: String) throws {
        try InspectionWrites.clearMarked(sync, companyId: companyId, resultIds: resultIds)
    }
}

@MainActor
extension InspectionWrites {
    /// Undo for Mark N Remaining: the items it answered go back to To do, in one batch.
    public static func clearMarked(_ sync: SyncService, companyId: String, resultIds: [String]) throws {
        guard !resultIds.isEmpty else { return }
        var values = verdictValues(nil, userId: nil)
        values["location_text"] = .null
        try sync.batch {
            for id in resultIds {
                try sync.store.write("checklist_item_result", id: id, companyId: companyId, values)
            }
        }
    }
}

// MARK: - Taking photos (spec 10)

extension CaptureRules {
    /// After a photo, the camera opens again for the next one until the tech taps Cancel; a
    /// video closes it.
    public static func cameraOpensAgain(_ kind: MediaKind, took: Bool) -> Bool { took && kind == .photo }
}

/// "Attach to" on the Photos section remembers the last choice for each job while the app runs.
@MainActor
public enum CaptureTargetMemory {
    private static var chosen: [String: MediaTarget] = [:]

    public static func target(for jobId: String) -> MediaTarget? { chosen[jobId] }

    public static func remember(_ target: MediaTarget) { chosen[target.jobId] = target }
}

// MARK: - Live Activity actions (Low)

/// A Live Activity button's request for Today: the stop, and On My Way or Mark Complete to do
/// there (owner, 2026-10-20).
public struct StopRequest: Equatable, Sendable, Identifiable {
    public let id = UUID()
    public var jobId: String
    public var action: LiveStopAction

    public init(jobId: String, action: LiveStopAction) {
        self.jobId = jobId
        self.action = action
    }
}
