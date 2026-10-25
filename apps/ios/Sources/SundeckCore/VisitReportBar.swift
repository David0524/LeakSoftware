import Foundation

// The maintenance visit report bar (owner, 2026-10-22; docs/design/2026-10-22-wrap-up.md):
// before the visit is done the bar keeps Complete Job (in an Automatic shop with a line saying
// the report sends by itself); once it's done the bar is about the visit report: a status line
// and View Report or Send Visit Report. With Require a Photo on (owner, 2026-10-25), a done visit
// with no photo offers Add Photo instead. Port of packages/core/src/visit-report-bar.ts.

public enum VisitReportBarAction: String, Codable, Sendable {
    case view, send, photo

    /// `VISIT_REPORT_BAR_LABELS`.
    public var label: String {
        switch self {
        case .view: "View Report"
        case .send: "Send Visit Report"
        case .photo: "Add Photo"
        }
    }
}

/// What the bar says about the visit report. Port of VisitReportBar.
public struct VisitReportBar: Codable, Equatable, Sendable {
    /// "Visit report sent · 2:14 PM", "Ready to send", "Sends by itself when you finish".
    public var line: String
    public var action: VisitReportBarAction?
    /// "View Report", "Send Visit Report", or "Add Photo".
    public var label: String?
}

/// The bar's visit report part; nil when it says nothing (not a maintenance visit, reports off,
/// canceled, or a Manual shop before the visit is done). `needsPhoto`: the shop requires a photo
/// and the visit has none (`reportPhotoBlock`). Port of visitReportBar.
public func visitReportBar(
    jobType: String, status: String, mode: VisitReportMode, sentAt: String?, now: Date, timeZone: String,
    needsPhoto: Bool = false
) -> VisitReportBar? {
    if jobType != "maintenance" || mode == .off || status == "canceled" { return nil }
    if let sentAt {
        let when = (try? formatSchedule(sentAt, now, timeZone)) ?? ""
        return VisitReportBar(
            line: "Visit report sent · \(when)", action: .view, label: VisitReportBarAction.view.label)
    }
    if status != "done" {
        return mode == .auto ? VisitReportBar(line: "Sends by itself when you finish", action: nil, label: nil) : nil
    }
    if needsPhoto {
        let line =
            switch mode {
            case .auto: "Sends once it has a photo"
            case .monthly: "Goes with the monthly invoice"
            default: "Needs a photo to send"
            }
        return VisitReportBar(line: line, action: .photo, label: VisitReportBarAction.photo.label)
    }
    // A done visit in an Automatic shop that hasn't gone out yet (no signal, or it failed). In a
    // Monthly shop it goes with the month's invoice; Send Visit Report still sends it now.
    let line =
        switch mode {
        case .auto: "Not sent yet"
        case .monthly: "Goes with the monthly invoice"
        default: "Ready to send"
        }
    return VisitReportBar(line: line, action: .send, label: VisitReportBarAction.send.label)
}
