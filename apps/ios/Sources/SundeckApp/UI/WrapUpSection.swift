#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// The job page's Wrap-Up section (spec 5.4 Wrap-Up): Report and Sign-Off, Signatures, Quotes
    /// (every job but a repair) and the Invoice, 32 apart. Content for the job
    /// page's scroll view.
    struct WrapUpSection: View {
        var job: JobView
        /// The job page's report flow, shared with the Next Step bar's Write Draft.
        var flow: ReportFlow? = nil

        var body: some View {
            VStack(alignment: .leading, spacing: 32) {
                ReportTab(job: job, sharedFlow: flow)
                // Quotes on leak detection and pool inspections (a visit's sit in Details).
                if job.type == .detection || job.type == .inspection { QuoteSection(job: job) }
                InvoiceSection(job: job)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
#endif
