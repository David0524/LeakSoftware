import Foundation

/// What the tech sees while the app waits on a report (owner, 2026-10-20: "It is a long white
/// screen when loading. We need to keep users engaged during that loading time"): a short list
/// of steps that check off as each one finishes, instead of a blank page or a bare spinner.
public enum ReportProgress {
    public static let saving = "Saving your work"
    public static let ready = "Getting it ready"

    /// The steps for each wait, in order (`ReportServer.onStep` numbers them).
    public static func steps(_ action: ReportFlow.Action) -> [String] {
        switch action {
        case .draft: [saving, "Writing the report", ready]
        case .finish: [saving, "Finishing the report", ready]
        case .email, .text: [saving, "Sending the report", ready]
        }
    }

    /// Finishing after the customer signs (Review and Sign).
    public static let review = [saving, "Finishing the report", ready]
    /// Opening a report's PDF: the server makes it, then it downloads.
    public static let pdf = ["Making the PDF", "Downloading it"]
    /// Opening the customer's report page.
    public static let page = ["Opening the report", ready]

    /// "Writing the report, step 2 of 3", for VoiceOver.
    public static func spoken(_ steps: [String], _ current: Int) -> String {
        guard steps.indices.contains(current) else { return "" }
        return "\(steps[current]), step \(current + 1) of \(steps.count)"
    }
}
