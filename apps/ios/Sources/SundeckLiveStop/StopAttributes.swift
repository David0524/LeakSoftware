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

#if canImport(ActivityKit)
    /// What stays the same for the whole stop (the job, the customer, their phone), and the
    /// content state, `LiveStopInput`, which the app updates.
    public struct StopAttributes: ActivityAttributes {
        public typealias ContentState = LiveStopInput

        public var jobId: String
        public var customer: String
        public var phone: String?

        public init(jobId: String, customer: String, phone: String?) {
            self.jobId = jobId
            self.customer = customer
            self.phone = phone
        }
    }
#endif
