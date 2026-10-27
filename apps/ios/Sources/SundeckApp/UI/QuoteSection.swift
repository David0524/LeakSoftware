#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    /// Wrap-Up's "Quotes" (spec 5.4 Wrap-Up 3, 6.4; milestone S7): start a quote, build a draft
    /// from the findings and the price book (works offline), send it for a link, and see sent and
    /// accepted quotes. Content for the job page's scroll view. Port of
    /// apps/mobile/src/features/quote/QuoteTab.tsx with the website's look
    /// (apps/web/src/components/quote-panel.tsx, quote-builder.tsx).
    struct QuoteSection: View {
        var job: JobView
        /// Wrap-Up's sheet for one quote (owner, 2026-10-22): that card only, no heading or Start.
        var only: String? = nil
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @State private var flow: QuoteFlow?

        var body: some View {
            let _ = sync.revision
            if let company = session.company, let flow, flow.jobId == job.id {
                let model = QuoteSectionModel(
                    store: sync.store, companyId: company.id, settings: company.settings, role: company.role, job: job,
                    timeZone: company.timeZone)
                VStack(alignment: .leading, spacing: 12) {
                    if only == nil { SectionHeading("Quotes") }
                    if only == nil, model.showsStart {
                        ViewThatFits(in: .horizontal) {
                            HStack(spacing: 12) { startParts(flow, model.startLine) }
                            VStack(alignment: .leading, spacing: 12) { startParts(flow, model.startLine) }
                        }
                    }
                    VStack(alignment: .leading, spacing: 20) {
                        ForEach(model.cards.filter { only == nil || $0.id == only }) { card in
                            QuoteCard(card: card, builder: card.isEditable ? model.builder : nil, flow: flow)
                        }
                    }
                    if model.cards.allSatisfy({ !$0.isEditable }), let error = flow.error {
                        Notice(kind: .error, text: error)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else if let company = session.company {
                SkeletonCard(label: "Loading quotes")
                    .onAppear {
                        flow = QuoteFlow(
                            sync: sync, companyId: company.id, jobId: job.id, role: company.role,
                            settings: company.settings)
                    }
            }
        }

        @ViewBuilder private func startParts(_ flow: QuoteFlow, _ line: String) -> some View {
            Text(line).textRole(.body).foregroundStyle(Color.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Start Quote") { flow.start() }.buttonStyle(.secondary).fixedSize()
        }
    }

    /// One quote's card: its number, status and total; the builder while it's a draft; the lines,
    /// deposit, customer link and acceptance once sent.
    private struct QuoteCard: View {
        var card: QuoteCardModel
        var builder: QuoteBuilderModel?
        @Bindable var flow: QuoteFlow
        @Environment(Session.self) private var session
        @Environment(SyncService.self) private var sync
        @Environment(AppEnvironment.self) private var app
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    CardTitle(card.title)
                    Spacer(minLength: 0)
                    Text(card.totalText).font(.system(size: 20, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(Color.text)
                }
                if let builder, card.isEditable {
                    QuoteBuilderView(quoteId: card.id, model: builder, flow: flow)
                    if let error = flow.error { Notice(kind: .error, text: error) }
                    HStack(spacing: 12) {
                        Button {
                            Task {
                                await flow.send(
                                    card.id, shopName: session.company?.name ?? "",
                                    server: MoneyServer(sync: sync, api: app.api))
                            }
                        } label: {
                            BusyButtonLabel("Send Quote", busy: flow.sending, busyTitle: "Sending…")
                        }
                        .buttonStyle(.primary)
                        .disabled(flow.sending || !builder.canSend)
                        .fixedSize()
                        Text(QuoteCardModel.sendNote).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(card.lines) { line in
                            HStack(alignment: .firstTextBaseline, spacing: 16) {
                                Text(line.description).frame(maxWidth: .infinity, alignment: .leading)
                                Text(line.amount).monospacedDigit()
                            }
                            .textRole(.secondary)
                            .foregroundStyle(Color.text)
                        }
                    }
                    if let deposit = card.depositText {
                        Text(deposit).textRole(.secondary).foregroundStyle(Color.textMuted)
                    }
                }
                if let link = card.link?.absoluteString
                    ?? (flow.sentQuoteId == card.id ? flow.sent?.link : nil)
                {
                    CopyBox(label: "Customer link", text: link, monospaced: true)
                }
                // Apps only (S6/S7): the customer accepts on this phone, offline, by signing. A draft
                // with lines or a sent quote, as the Expo app.
                if card.quote.quote.status == .sent || (card.isEditable && !card.quote.lines.isEmpty) {
                    Button("Customer Signs Now") {
                        openRoute(.signature(jobId: card.quote.quote.jobId, quoteId: card.id))
                    }
                    .buttonStyle(.secondary)
                }
                if let accepted = card.acceptedText {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(accepted).textRole(.body).foregroundStyle(Color.text)
                        if let repair = card.repairJobId, let label = card.repairJobLabel {
                            Button {
                                openRoute(.job(repair))
                            } label: {
                                Text(label).font(.role(.bodyEmphasis)).underline().foregroundStyle(Color.link)
                                    .frame(minHeight: minTarget)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Opens the repair job")
                        }
                    }
                }
            }
            .card()
        }
    }

    /// The quote builder in a draft's card (spec 6.4).
    private struct QuoteBuilderView: View {
        var quoteId: String
        var model: QuoteBuilderModel
        var flow: QuoteFlow
        @State private var itemId: String?
        @State private var custom = ""
        @State private var customPrice = ""
        @State private var removing: QuoteLine?
        /// A custom line typed, kept until it's added or discarded (owner, 2026-10-27).
        @State private var kept = DraftHandle()

        var body: some View {
            VStack(alignment: .leading, spacing: 20) {
                if !model.findings.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        SubHeading("Add From Findings")
                        ForEach(model.findings) { finding in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(finding.title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                                if finding.items.isEmpty {
                                    Text(FindingSuggestion.noItems).textRole(.secondary).foregroundStyle(
                                        Color.textMuted)
                                } else {
                                    WrapRow(spacing: 8) {
                                        ForEach(finding.items) { option in
                                            Button(option.title) {
                                                flow.add(option.item, findingId: finding.findingId, to: quoteId)
                                            }
                                            .buttonStyle(SuggestionStyle())
                                            .disabled(option.added)
                                            .accessibilityLabel(option.accessibilityLabel)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    SubHeading("Lines")
                    if model.lines.isEmpty {
                        Text(QuoteBuilderModel.noLines).textRole(.body).foregroundStyle(Color.textMuted)
                    }
                    ForEach(model.lines, id: \.id) { line in
                        QuoteLineEditor(quoteId: quoteId, line: line, flow: flow) { removing = line }
                    }
                }

                if !model.priceBook.isEmpty {
                    HStack(alignment: .bottom, spacing: 12) {
                        SelectField(
                            label: "Add from the price book", selection: $itemId,
                            options: [nil] + model.priceBook.map { Optional($0.id) },
                            optionLabel: { id in
                                id.flatMap { id in model.priceBook.first { $0.id == id }?.menuTitle } ?? "Choose…"
                            })
                        Button("Add Item") {
                            if let id = itemId, let option = model.priceBook.first(where: { $0.id == id }) {
                                itemId = nil
                                flow.add(option.item, findingId: nil, to: quoteId)
                            }
                        }
                        .buttonStyle(.secondary)
                        .disabled(itemId == nil)
                        .fixedSize()
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    DraftNote(draft: kept)
                    CommitField(label: "Custom line", text: $custom, placeholder: QuoteBuilderModel.customPlaceholder)
                    HStack(alignment: .bottom, spacing: 12) {
                        CommitField(label: "Price ($)", text: $customPrice, keyboard: .decimalPad, numeric: true)
                        Button("Add Line") {
                            if flow.addCustom(description: custom, price: customPrice, to: quoteId) {
                                custom = ""
                                customPrice = ""
                                kept.clear()
                            }
                        }
                        .buttonStyle(.secondary)
                        .fixedSize()
                    }
                }

                DiscountField(quoteId: quoteId, saved: model.discountText, hint: model.discountHint, flow: flow)

                MoneyRows(rows: model.totalRows)
            }
            // A custom line typed but not added: leaving the job asks first (owner, 2026-10-20).
            .tracksUnsaved(
                "job:\(flow.jobId)", dirty: textChanged(custom, from: "") || textChanged(customPrice, from: ""),
                drafts: [kept]
            )
            .keepsDraft(kept, form: "quote-line", id: quoteId, fields: ["description": custom, "price": customPrice]) {
                changes in
                if let value = changes["description"] { custom = value }
                if let value = changes["price"] { customPrice = value }
            }
            .confirmationDialog(
                removing.map(QuoteBuilderModel.removeTitle) ?? "",
                isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
                titleVisibility: .visible, presenting: removing
            ) { line in
                Button("Remove Line", role: .destructive) {
                    if let id = line.id { flow.removeLine(id, from: quoteId) }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    /// One line in a well: Description; Qty and Price each ($) side by side; its total and Remove.
    /// Each field saves when it loses focus or on return.
    private struct QuoteLineEditor: View {
        var quoteId: String
        var line: QuoteLine
        var flow: QuoteFlow
        var remove: () -> Void
        @State private var description = ""
        @State private var quantity = ""
        @State private var price = ""

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                CommitField(label: "Description", text: $description) {
                    flow.updateLine(line.id ?? "", in: quoteId, description: description)
                }
                HStack(alignment: .top, spacing: 12) {
                    CommitField(label: "Qty", text: $quantity, keyboard: .decimalPad, numeric: true) {
                        flow.updateLine(line.id ?? "", in: quoteId, quantity: quantity)
                    }
                    CommitField(label: "Price each ($)", text: $price, keyboard: .decimalPad, numeric: true) {
                        flow.updateLine(line.id ?? "", in: quoteId, price: price)
                    }
                }
                HStack {
                    Text(formatCents(lineTotal(line))).font(.role(.bodyEmphasis)).monospacedDigit()
                        .foregroundStyle(Color.text)
                    Spacer(minLength: 0)
                    Button("Remove", action: remove)
                        .buttonStyle(.quiet)
                        .accessibilityLabel("Remove \(line.description ?? "line")")
                }
            }
            .well(padding: 12)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(line.description ?? "Line")
            .onAppear(perform: reset)
            .onChange(of: line) { reset() }
        }

        /// A save here or by another phone changes the line: show the new values.
        private func reset() {
            description = line.description ?? ""
            quantity = quantityText(line.quantity)
            price = centsFieldText(line.unitPriceCents)
        }
    }

    /// Discount ($): saved when it loses focus; techs are held to the shop's limit.
    private struct DiscountField: View {
        var quoteId: String
        var saved: String
        var hint: String?
        var flow: QuoteFlow
        @State private var text = ""

        var body: some View {
            CommitField(label: "Discount ($)", text: $text, hint: hint, keyboard: .decimalPad, numeric: true) {
                if text.trimmingCharacters(in: .whitespaces) != saved { flow.setDiscount(text, on: quoteId) }
            }
            .frame(maxWidth: 240, alignment: .leading)
            .onAppear { text = saved }
            .onChange(of: saved) { text = saved }
        }
    }

    // MARK: - Shared money pieces

    /// A heading inside a card (Barlow Bold 18): "Add From Findings", "Lines", "Add a Line".
    struct SubHeading: View {
        var text: String

        init(_ text: String) { self.text = text }

        var body: some View {
            Text(text).textRole(.subHeading).foregroundStyle(Color.text).accessibilityAddTraits(.isHeader)
        }
    }

    /// Totals in `secondary` 15, money right-aligned and tabular, the Total bold.
    struct MoneyRows: View {
        var rows: [MoneyRow]

        var body: some View {
            VStack(spacing: 4) {
                ForEach(rows) { row in
                    HStack {
                        Text(row.label)
                        Spacer(minLength: 16)
                        Text(row.value).monospacedDigit()
                    }
                    .font(.role(.secondary).weight(row.strong ? .bold : .regular))
                    .foregroundStyle(Color.text)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    /// An outlined field that runs `commit` when it loses focus or on return.
    struct CommitField: View {
        var label: String
        @Binding var text: String
        var placeholder = ""
        var hint: String?
        var error: String?
        var keyboard: UIKeyboardType = .default
        var numeric = false
        var multiline = false
        var commit: () -> Void = {}
        @FocusState private var focused: Bool

        var body: some View {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel(label)
                TextField(
                    "", text: $text, prompt: Text(placeholder).foregroundStyle(Color.placeholder),
                    axis: multiline ? .vertical : .horizontal
                )
                .lineLimit(multiline ? 3...100 : 1...1)
                .keyboardType(keyboard)
                .multilineTextAlignment(numeric ? .trailing : .leading)
                .monospacedDigit()
                .focused($focused)
                .submitLabel(.done)
                .onSubmit(commit)
                .accessibilityLabel(label)
                .fieldBox(error: error != nil, focused: focused, minHeight: multiline ? 96 : minTarget)
                .onChange(of: focused) { _, now in if !now { commit() } }
                if let error {
                    FieldHint(text: error, error: true)
                } else if let hint {
                    FieldHint(text: hint)
                }
            }
        }
    }

    /// "+ Skimmer repair · $450.00": a secondary button at 15 medium.
    private struct SuggestionStyle: ButtonStyle {
        @Environment(\.isEnabled) private var isEnabled

        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .font(.role(.secondary).weight(.medium))
                .foregroundStyle(Color.link)
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .frame(minHeight: minTarget)
                .background(Capsule().fill(Color.link.opacity(configuration.isPressed ? 0.24 : 0.12)))
                .contentShape(Capsule())
                .opacity(isEnabled ? 1 : 0.5)
        }
    }

    /// Lays its children out left to right, wrapping onto new lines.
    struct WrapRow: Layout {
        var spacing: CGFloat = 8

        func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
            let width = proposal.width ?? .infinity
            var x: CGFloat = 0
            var y: CGFloat = 0
            var line: CGFloat = 0
            var widest: CGFloat = 0
            for view in subviews {
                let size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
                if x > 0, x + size.width > width {
                    y += line + spacing
                    x = 0
                    line = 0
                }
                x += size.width + spacing
                line = max(line, size.height)
                widest = max(widest, x - spacing)
            }
            return CGSize(width: min(widest, width), height: y + line)
        }

        func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
            var x = bounds.minX
            var y = bounds.minY
            var line: CGFloat = 0
            for view in subviews {
                let size = view.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
                if x > bounds.minX, x + size.width > bounds.maxX {
                    y += line + spacing
                    x = bounds.minX
                    line = 0
                }
                view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
                line = max(line, size.height)
            }
        }
    }
#endif
