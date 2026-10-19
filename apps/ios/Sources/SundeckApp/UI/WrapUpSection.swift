#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// The job page's Wrap-Up section (spec 5.4 Wrap-Up): Report and Sign-Off, Signatures, Quotes
    /// (leak detection and maintenance jobs) and the Invoice, 32 apart. Content for the job
    /// page's scroll view.
    struct WrapUpSection: View {
        var job: JobView

        var body: some View {
            VStack(alignment: .leading, spacing: 32) {
                ReportTab(job: job)
                if job.type == .detection { QuoteSection(job: job) }
                InvoiceSection(job: job)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
#endif
