import Foundation
import SundeckCore

#if canImport(ActivityKit)
    import ActivityKit
#endif

// The stop a tech is on, as a Live Activity (owner, 2026-10-19; docs/plans/
// live-activities-and-notifications.md). Shared by the app, which starts and updates it with
// ActivityKit on the phone (no push, so it works offline), and the widget extension, which
// draws it.

/// The links the Live Activity opens in the app: `sundeckpro://job/<id>`.
public enum LiveStopLink {
    public static let scheme = "sundeckpro"

    public static func job(_ id: String) -> URL? { URL(string: "\(scheme)://job/\(id)") }

    /// The job a link opens, or nil when it isn't one of ours.
    public static func jobId(_ url: URL) -> String? {
        guard url.scheme == scheme, url.host == "job" else { return nil }
        let id = url.pathComponents.dropFirst().first ?? ""
        return id.isEmpty ? nil : id
    }

    /// `tel:` for the customer's phone, or nil without one.
    public static func call(_ phone: String?) -> URL? {
        guard let phone else { return nil }
        let digits = phone.filter { $0.isNumber || $0 == "+" }
        return digits.isEmpty ? nil : URL(string: "tel:\(digits)")
    }
}

/// What the activity shows now: the stop (`LiveStopInput`), and the job it is for, so one
/// activity can move from stop to stop through the day (Open Job and Call follow it).
public struct LiveStopState: Codable, Hashable, Sendable {
    public var stop: LiveStopInput
    public var jobId: String
    public var phone: String?

    public init(stop: LiveStopInput, jobId: String, phone: String?) {
        self.stop = stop
        self.jobId = jobId
        self.phone = phone
    }
}

#if canImport(ActivityKit)
    /// One activity a work day (owner, 2026-10-19: "Live Activity should begin at the beginning
    /// of the workday"): the day stays the same, and the content state moves along its stops.
    public struct StopAttributes: ActivityAttributes {
        public typealias ContentState = LiveStopState

        /// The shop's local date ("2026-10-20").
        public var day: String

        public init(day: String) { self.day = day }
    }
#endif
