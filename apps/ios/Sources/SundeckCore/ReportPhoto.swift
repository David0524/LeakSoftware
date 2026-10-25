import Foundation

// Require a Photo (owner, 2026-10-25: "In the owner's settings add a 'require photo to send
// report' button. This is a feature Skimmer has"): with company.settings.require_report_photo on,
// a maintenance visit's report can't be sent until the visit has at least one photo. Port of
// packages/core/src/report-photo.ts.

/// Whether the shop requires a photo before a visit's report is sent (default off).
public func requiresReportPhoto(_ settings: JSONValue?) -> Bool {
    settings?["require_report_photo"] == .bool(true)
}

/// `REPORT_PHOTO_TEXT`: the switch's words and the message when a report is held up.
public enum ReportPhotoText {
    public static let label = "Require a Photo"
    public static let each =
        "A visit’s report can’t be sent until the visit has at least one photo. With Send Automatically on, it goes once one is added."
    public static let monthly =
        "One visit’s report can’t be sent until the visit has at least one photo. The monthly report still goes with the invoice."
    /// On Send Visit Report, and the server's refusal.
    public static let blocked = "Add a photo to send this report."
    public static let addPhoto = "Add Photo"

    /// Keyed as `REPORT_PHOTO_TEXT`.
    public static let all: [String: String] = [
        "label": label, "each": each, "monthly": monthly, "blocked": blocked, "addPhoto": addPhoto,
    ]
}

/// What the switch means for the shop's visit reports; nil when they're off (no switch).
public func reportPhotoHint(_ mode: VisitReportMode) -> String? {
    switch mode {
    case .off: nil
    case .monthly: ReportPhotoText.monthly
    case .auto, .manual: ReportPhotoText.each
    }
}

/// Why this visit's report can't be sent yet (`ReportPhotoText.blocked`), or nil when it can.
/// `photos` counts the visit's photos (not videos or deleted ones; still uploading counts).
public func reportPhotoBlock(_ settings: JSONValue?, photos: Int) -> String? {
    requiresReportPhoto(settings) && photos == 0 ? ReportPhotoText.blocked : nil
}
