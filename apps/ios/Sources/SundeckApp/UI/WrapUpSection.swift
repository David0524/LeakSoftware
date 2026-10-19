#if os(iOS)
    import SwiftUI

    /// The job page's Wrap-Up section: report, signatures, quotes and the invoice (stub until
    /// the screen helper builds it).
    struct WrapUpSection: View {
        var job: JobView

        var body: some View {
            ReportTab(job: job)
        }
    }
#endif
