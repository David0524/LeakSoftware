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

    /// `sundeckpro://job/<id>/on-my-way` or `…/mark-complete`: the Live Activity's two actions
    /// (owner, 2026-10-20), which open the app on that stop and do it there.
    public static func action(_ action: LiveStopAction, jobId id: String) -> URL? {
        URL(string: "\(scheme)://job/\(id)/\(action.rawValue)")
    }

    /// The action a link asks for, or nil for a plain job link.
    public static func action(_ url: URL) -> LiveStopAction? {
        guard jobId(url) != nil else { return nil }
        return url.pathComponents.dropFirst(2).first.flatMap(LiveStopAction.init(rawValue:))
    }

    /// The actions the activity offers in a phase: On My Way before the drive, Mark Complete
    /// until the stop is done.
    public static func actions(_ phase: LiveStopPhase) -> [LiveStopAction] {
        switch phase {
        case .ahead: [.onMyWay, .markComplete]
        case .driving, .onSite: [.markComplete]
        case .done: []
        }
    }

    /// `tel:` for the customer's phone, or nil without one.
    public static func call(_ phone: String?) -> URL? {
        guard let phone else { return nil }
        let digits = phone.filter { $0.isNumber || $0 == "+" }
        return digits.isEmpty ? nil : URL(string: "tel:\(digits)")
    }
}

/// What a Live Activity button does in the app, on its stop.
public enum LiveStopAction: String, Codable, CaseIterable, Hashable, Sendable {
    case onMyWay = "on-my-way"
    case markComplete = "mark-complete"

    public var title: String {
        switch self {
        case .onMyWay: "On My Way"
        case .markComplete: "Mark Complete"
        }
    }

    public var systemImage: String {
        switch self {
        case .onMyWay: "car.fill"
        case .markComplete: "checkmark.circle.fill"
        }
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
