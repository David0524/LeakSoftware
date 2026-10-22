// The sample job (owner, 2026-10-22: "First win within about 60 seconds"; docs/design/
// 2026-10-22-first-win.md). Port of packages/core/src/sample.ts: the same words on every
// platform. The database makes it (job.sample, set by the server only).

/// The pill on its tile, its row, and its page.
public let samplePill = "Sample"

public enum SampleText {
    public static let title = "Sample Job"
    public static let body =
        "This is a finished report with your shop's name, the way your customers get it. The customer and pool are made up, and the sample never counts toward your jobs or money."
    public static let addLogo = "Add your logo in Settings and it shows on this report."
    public static let addLogoLink = "Add Your Logo"
    public static let send = "Send Yourself This Report"
    public static let sending = "Sending…"
    public static let view = "View Report"
    public static let delete = "Delete Sample"
    public static let deleteTitle = "Delete the sample job?"
    public static let deleteMessage = "Its report and made-up customer go too. It won't come back."
    public static let deleted = "Sample deleted."
    public static let reportBanner =
        "Sample report. The customer, pool, and findings are made up to show what your customers receive."
}

/// After Send Yourself This Report: where it went.
public func sampleSentText(_ email: String) -> String {
    "Sent to \(email). Open it the way your customers will."
}
