#if os(iOS)
    import SundeckCore
    import SwiftUI

    /// The job page's Wrap-Up as a finish list (owner, 2026-10-22, option A;
    /// docs/design/2026-10-22-wrap-up.md): "Maria Alvarez · 2 of 4 done", then a row per step
    /// (Report, each quote, Customer signs, each invoice) with its state, each opening that
    /// step in a sheet; New Quote under the list. The Next Step bar names the next step. Port of
    /// apps/web/src/components/wrap-up.tsx.
    struct WrapUpSection: View {
        var job: JobView
        /// The job page's report flow.
        var flow: ReportFlow? = nil
        /// The open step, shared with the Next Step bar's button.
        @Binding var open: WrapUpOpen?
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var quoteFlow: QuoteFlow?

        init(job: JobView, flow: ReportFlow? = nil, open: Binding<WrapUpOpen?> = .constant(nil)) {
            self.job = job
            self.flow = flow
            _open = open
        }

        var body: some View {
            let _ = sync.revision
            if let company = session.company {
                let list = wrapUp(
                    wrapUpInput(store: sync.store, companyId: company.id, settings: company.settings, job: job))
                VStack(alignment: .leading, spacing: 8) {
                    Text(verbatim: list.subtitle)
                        .textRole(.body).foregroundStyle(Color.textMuted)
                        .padding(.horizontal, 4)
                    Grouped(separatorInset: 58) {
                        ForEach(list.rows, id: \.key) { row in
                            Button {
                                open = WrapUpOpen(row: row)
                            } label: {
                                WrapUpRowView(row: row)
                            }
                            .buttonStyle(.row)
                            .accessibilityLabel(row.spoken)
                            .accessibilityAddTraits(.isButton)
                        }
                    }
                    if list.canStartQuote {
                        Button {
                            // New Quote opens the quote it started.
                            let id = startingQuoteFlow().start()
                            open = WrapUpOpen(step: .quote, refId: id ?? "draft")
                        } label: {
                            Label(newQuoteLabel, systemImage: "plus")
                                .textRole(.bodyEmphasis)
                                .foregroundStyle(Color.link)
                                .frame(minHeight: minTarget)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 16)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .sheet(item: $open) { step in
                    WrapUpStepSheet(job: job, step: step, title: step.title(list), flow: flow)
                }
            }
        }

        private func startingQuoteFlow() -> QuoteFlow {
            if let quoteFlow, quoteFlow.jobId == job.id { return quoteFlow }
            let company = session.company!
            let made = QuoteFlow(
                sync: sync, companyId: company.id, jobId: job.id, role: company.role, settings: company.settings)
            quoteFlow = made
            return made
        }
    }

    /// One step's row: the 30 pt marker, its title and state, the amount, a chevron.
    struct WrapUpRowView: View {
        var row: WrapUpRow

        var body: some View {
            HStack(spacing: 12) {
                WrapUpMarker(row: row)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: row.title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Text(verbatim: row.detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                Spacer(minLength: 0)
                if let amount = row.amount {
                    Text(verbatim: amount).textRole(.bodyEmphasis).monospacedDigit().foregroundStyle(Color.text)
                }
                Chevron()
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
        }
    }

    /// A green check when done; the step number in blue when next; else the number in a gray ring.
    struct WrapUpMarker: View {
        var row: WrapUpRow

        var body: some View {
            ZStack {
                if row.done {
                    Circle().fill(Color.pass)
                    Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(
                        Color.onStatus)
                } else if row.next {
                    Circle().fill(Color.brandPrimary)
                    Text(verbatim: "\(row.number)").font(.system(size: 15, weight: .semibold)).foregroundStyle(
                        Color.onPrimary)
                } else {
                    Circle().strokeBorder(Color.textMuted.opacity(0.4), lineWidth: 1.5)
                    Text(verbatim: "\(row.number)").font(.system(size: 15, weight: .semibold)).foregroundStyle(
                        Color.textMuted)
                }
            }
            .frame(width: 30, height: 30)
            .accessibilityHidden(true)
        }
    }

    /// A step's sheet: a navigation stack with its large title and Done, holding exactly the
    /// section it replaced (the report card, the signatures and Review with Customer, a quote's
    /// card and builder, the invoice).
    struct WrapUpStepSheet: View {
        var job: JobView
        var step: WrapUpOpen
        var title: String
        var flow: ReportFlow?
        @Environment(\.dismiss) private var dismiss
        @Environment(SyncService.self) private var sync
        @Environment(Session.self) private var session

        var body: some View {
            NavigationStack {
                ScreenScroll { content }
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.large)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { dismiss() }.fontWeight(.semibold)
                        }
                    }
            }
        }

        @ViewBuilder private var content: some View {
            switch step.step {
            case .report: ReportTab(job: job, sharedFlow: flow, part: .report)
            case .sign: ReportTab(job: job, sharedFlow: flow, part: .sign)
            case .quote: QuoteSection(job: job, only: quoteId)
            case .invoice: InvoiceSection(job: job, heading: false)
            }
        }

        /// New Quote opens the draft it started.
        private var quoteId: String? {
            guard step.refId == "draft" else { return step.refId }
            guard let company = session.company else { return nil }
            return jobQuotes(sync.store, companyId: company.id, jobId: job.id).first { $0.quote.status == .draft }?.id
        }
    }
#endif
