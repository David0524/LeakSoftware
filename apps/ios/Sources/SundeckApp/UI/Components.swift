#if os(iOS)
    import SundeckCore
    import SundeckSync
    import SwiftUI

    // Cards, headings, chips, notices, empty states, tips and the sync bar (spec 3.1, 3.3, 3.5,
    // 3.6, 3.11, 3.12, 3.13, 3.17).

    // MARK: - Screen layout

    /// A tab or pushed screen that mixes cards, pills and lists (Today, Schedule, the job's
    /// sections): a scroll view on `bg`, blocks 24 apart, 16 from the screen's edges.
    ///
    ///     ScreenScroll {
    ///         PageHeader(subtitle: "Monday, October 19")
    ///         Grouped(label: "Customer") { … }
    ///     }
    ///     .navigationTitle("Today")
    struct ScreenScroll<Content: View>: View {
        var spacing: CGFloat = 24
        @ViewBuilder var content: Content

        var body: some View {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: spacing) { content }
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.bottom, 24)
            }
            .background(Color.bg)
        }
    }

    /// The optional subtitle and header actions under a large title (spec 3.1). The large title
    /// itself is the system's (`.navigationTitle`); this is the first block of the content, with
    /// no background, so it scrolls under the bar with the title. In a `List`, add `.plainListRow()`.
    ///
    ///     PageHeader {
    ///         Text("Monday, October 19 · 72°")
    ///     } actions: {
    ///         Button("Open Route in Google Maps") { … }.buttonStyle(.secondary)
    ///     }
    struct PageHeader<Subtitle: View, Actions: View>: View {
        @ViewBuilder var subtitle: Subtitle
        @ViewBuilder var actions: Actions

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) { subtitle }
                    .textRole(.body)
                    .foregroundStyle(Color.textMuted)
                HStack(spacing: 12) { actions }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    extension PageHeader where Actions == EmptyView {
        init(@ViewBuilder subtitle: () -> Subtitle) {
            self.subtitle = subtitle()
            actions = EmptyView()
        }
    }

    extension PageHeader where Subtitle == Text, Actions == EmptyView {
        init(subtitle: String) {
            self.subtitle = Text(subtitle)
            actions = EmptyView()
        }
    }

    extension View {
        /// A row in a `List` that draws its own background (the page header, a card, the sync bar).
        func plainListRow() -> some View {
            listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
                .listRowInsets(EdgeInsets())
        }

        /// A sheet's presentation (spec 3.15): grabber, the grouped gray behind its content, 20
        /// corners, and no swipe-down while there are unsaved changes.
        func sheetPresentation(
            dirty: Bool = false, detents: Set<PresentationDetent> = [.large]
        ) -> some View {
            presentationDetents(detents)
                .presentationDragIndicator(.visible)
                .modifier(SheetSurface(partial: detents != [.large]))
                .interactiveDismissDisabled(dirty)
        }
    }

    /// A sheet's background: on iOS 26 a half-height sheet (Move, Suggested Times) is Liquid
    /// Glass with the system's rounded corners, and a full one (forms) keeps the grouped gray;
    /// before iOS 26 always the gray with 20 corners.
    private struct SheetSurface: ViewModifier {
        var partial: Bool
        @Environment(\.drawsGlass) private var drawsGlass

        func body(content: Content) -> some View {
            if usesGlass(drawsGlass) {
                if partial { content } else { content.presentationBackground(Color.bg) }
            } else {
                content.presentationBackground(Color.bg).presentationCornerRadius(20)
            }
        }
    }

    // MARK: - Cards

    private struct CardBackground: ViewModifier {
        var insets: EdgeInsets
        @Environment(\.colorScheme) private var scheme
        @Environment(\.colorSchemeContrast) private var contrast

        func body(content: Content) -> some View {
            let shape = RoundedRectangle(cornerRadius: CGFloat(Radius.card), style: .continuous)
            let shadows = scheme == .light && contrast != .increased
            content
                .padding(insets)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background {
                    shape.fill(Color.surface)
                        .shadow(color: Color.navy.opacity(shadows ? 0.06 : 0), radius: 1, x: 0, y: 1)
                        .shadow(color: Color.navy.opacity(shadows ? 0.05 : 0), radius: 10, x: 0, y: 6)
                }
                .overlay {
                    if contrast == .increased { shape.strokeBorder(Color.controlBorder, lineWidth: 1) }
                }
        }
    }

    extension View {
        /// A soft card (spec 3.3): `surface`, radius 20, two soft shadows in light mode, no outline
        /// (a 1 pt outline instead of shadows with Increase Contrast). Padding 20 by default.
        func card(padding: CGFloat = CGFloat(Spacing.cardPadding)) -> some View {
            modifier(
                CardBackground(insets: EdgeInsets(top: padding, leading: padding, bottom: padding, trailing: padding)))
        }

        func card(_ insets: EdgeInsets) -> some View { modifier(CardBackground(insets: insets)) }

        /// A group inside a card (a schedule stop, a quote line): `well` fill, radius 16, flat.
        func well(padding: CGFloat = 16) -> some View {
            self.padding(padding)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous).fill(Color.well))
        }
    }

    // MARK: - Headings

    /// The label over a grouped list (spec 3.5): Barlow SemiBold 13, uppercase by style, muted.
    /// The copy stays sentence case: `SectionLabel("Your account")`.
    struct SectionLabel: View {
        var text: String

        init(_ text: String) { self.text = text }

        var body: some View {
            Text(text)
                .textRole(.sectionLabel)
                .foregroundStyle(Color.textMuted)
                .accessibilityAddTraits(.isHeader)
        }
    }

    /// A heading starting a part of a screen (spec 3.5): Barlow Bold 24, 12 above its content.
    struct SectionHeading: View {
        var text: String

        init(_ text: String) { self.text = text }

        var body: some View {
            Text(text)
                .textRole(.sectionHeading)
                .foregroundStyle(Color.text)
                .accessibilityAddTraits(.isHeader)
        }
    }

    /// A card's title (Barlow Bold 20).
    struct CardTitle: View {
        var text: String

        init(_ text: String) { self.text = text }

        var body: some View {
            Text(text).textRole(.cardTitle).foregroundStyle(Color.text).accessibilityAddTraits(.isHeader)
        }
    }

    // MARK: - Chips

    /// A solid status capsule (spec 3.6): footnote semibold, 10 side padding, `onStatus` text on
    /// the tone's color. The word is always there; color is never alone.
    struct Chip: View {
        var text: String
        var tone: Tone

        var body: some View {
            Text(text)
                .font(.role(.footnote).weight(.semibold))
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 10)
                .padding(.vertical, 2)
                .foregroundStyle(Color.onStatus)
                .background(Capsule().fill(tone.color))
        }
    }

    /// A job's status as a solid chip, colored per spec 3.6. `StatusChip(status: job.status)`
    struct StatusChip: View {
        var status: JobStatus

        var body: some View {
            Chip(text: status.label, tone: status.tone)
                .accessibilityLabel("Status: \(status.label)")
        }
    }

    /// A lock label on a schedule stop ("Locked", "Time locked", "Two techs"): `fill` with `text`.
    struct LockLabel: View {
        var text: String

        init(_ text: String) { self.text = text }

        var body: some View {
            Text(text)
                .font(.role(.footnote).weight(.semibold))
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 10)
                .padding(.vertical, 2)
                .foregroundStyle(Color.text)
                .background(Capsule().fill(Color.fill))
        }
    }

    // MARK: - Notices

    /// A message in a tinted block with a bar down its left (spec 3.12). Errors are announced.
    ///
    ///     Notice(kind: .warning, text: "No company number yet.", link: "Set Up a Number") { … }
    struct Notice: View {
        enum Kind { case info, warning, error, success }

        var kind: Kind
        var text: String
        var link: String?
        var action: (() -> Void)?

        init(kind: Kind, text: String, link: String? = nil, action: (() -> Void)? = nil) {
            self.kind = kind
            self.text = text
            self.link = link
            self.action = action
        }

        var body: some View {
            let shape = RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous)
            InlineLinkText(text: text, link: link, action: action)
                .textRole(.body)
                .foregroundStyle(Color.text)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(EdgeInsets(top: 12, leading: 24, bottom: 12, trailing: 16))
                .background(alignment: .leading) {
                    Capsule().fill(tone.color).frame(width: 4).padding(.vertical, 12).padding(.leading, 10)
                }
                .background(shape.fill(Color(tint: .noticeFill(tone))))
                .accessibilityElement(children: .combine)
                .onAppear {
                    if kind == .error { AccessibilityNotification.Announcement(text).post() }
                }
        }

        var tone: Tone {
            switch kind {
            case .info: .info
            case .warning: .warning
            case .error: .fail
            case .success: .pass
            }
        }
    }

    /// Text with an optional link at its end ("Nothing on your route today. Open the schedule.")
    /// that runs `action` when tapped. The link is `link`-colored, semibold and underlined.
    struct InlineLinkText: View {
        var text: String
        var link: String?
        var action: (() -> Void)?

        var body: some View {
            Text(attributed)
                .environment(
                    \.openURL,
                    OpenURLAction { url in
                        guard url.scheme == "sundeck-inline" else { return .systemAction }
                        action?()
                        return .handled
                    })
        }

        private var attributed: AttributedString {
            var out = AttributedString(text)
            if let link, action != nil {
                var tail = AttributedString(link)
                tail.link = URL(string: "sundeck-inline:action")
                tail.foregroundColor = Color.link
                tail.underlineStyle = .single
                tail.inlinePresentationIntent = .stronglyEmphasized
                out += AttributedString(" ") + tail
            }
            return out
        }
    }

    // MARK: - Empty states

    /// Nothing to show yet (spec 3.13): `emptyFill`, radius 16, 24 padding, centered muted body,
    /// an inline link where there's somewhere to go. Wording is the screen's own.
    ///
    ///     EmptyState(text: "Nothing on your route today.", link: "Open the schedule.") { … }
    struct EmptyState: View {
        var text: String
        var link: String?
        var action: (() -> Void)?

        init(text: String, link: String? = nil, action: (() -> Void)? = nil) {
            self.text = text
            self.link = link
            self.action = action
        }

        var body: some View {
            InlineLinkText(text: text, link: link, action: action)
                .textRole(.body)
                .foregroundStyle(Color.textMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(24)
                .background(
                    RoundedRectangle(cornerRadius: CGFloat(Radius.block), style: .continuous).fill(Color.emptyFill))
        }
    }

    // MARK: - Tips

    /// A one-time tip as a card (spec 3.11): lightbulb, title over message, a 44 close button in
    /// the corner. 20 below it to the next block.
    struct TipCard: View {
        var title: String
        var message: String
        var close: () -> Void

        var body: some View {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "lightbulb")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(Color.link)
                    .frame(width: 24, height: 24)
                    .padding(.top, 2)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).textRole(.bodyEmphasis).foregroundStyle(Color.text)
                    Text(message).textRole(.secondary).foregroundStyle(Color.textMuted)
                }
                .padding(.vertical, 2)
                Spacer(minLength: 0)
                Button {
                    withAnimation(Motion.smooth) { close() }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.textMuted)
                        .frame(width: minTarget, height: minTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close Tip")
            }
            .card(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 4))
            .transition(.opacity.combined(with: .scale(scale: 0.95)))
            .accessibilityElement(children: .contain)
        }
    }

    /// A tip from the walkthrough. Port of apps/mobile/src/ui/Tip.tsx.
    struct TipRow: View {
        var tip: Tip
        var close: () -> Void

        var body: some View {
            TipCard(title: tip.title, message: tip.message, close: close)
        }
    }

    // MARK: - Sync bar

    /// The sync bar's look (spec 3.17): a 44 capsule, full width, a 10 dot in the tone's color,
    /// the message in `secondary`, a chevron; the tone at 10% behind it.
    struct SyncBar: View {
        var message: SyncBarMessage
        var action: () -> Void

        var body: some View {
            let tone = message.tone.tone
            Button(action: action) {
                HStack(spacing: 10) {
                    Circle().fill(tone.color).frame(width: 10, height: 10)
                    Text(message.text)
                        .textRole(.secondary)
                        .foregroundStyle(Color.text)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    Chevron()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, minHeight: minTarget)
                .background(Capsule().fill(Color(tint: .syncFill(tone))))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(message.accessibilityLabel)
            .accessibilityHint("Opens sync details")
        }
    }

    /// The sync bar, hidden when everything is saved. Tapping it opens the sync details.
    /// Put it 16 under the large title block (in a `List`, add `.plainListRow()`).
    struct SyncBarRow: View {
        var open: (() -> Void)?
        @Environment(SyncService.self) private var sync
        @Environment(\.openRoute) private var openRoute

        var body: some View {
            VStack(spacing: 0) {
                if let message = syncBarMessage(sync.barStatus) {
                    SyncBar(message: message) {
                        if let open { open() } else { openRoute(.sync) }
                    }
                    .rollingNumber(message)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            // Slides away once everything is sent.
            .animation(Motion.smooth, value: syncBarMessage(sync.barStatus) == nil)
        }
    }

    /// More › On This Device › Appearance: Light | Dark, each segment at least 80 wide. Stored on
    /// this phone; the app applies it at the root.
    struct AppearanceRow: View {
        @Environment(AppEnvironment.self) private var app

        var body: some View {
            @Bindable var setting = app.appearance
            ListRow("Appearance") {
                Segmented(
                    selection: $setting.choice, options: Appearance.allCases, label: \.label, title: "Appearance",
                    minSegmentWidth: 80)
            }
        }
    }

    /// The row chevron: footnote semibold `textMuted` at 70%.
    struct Chevron: View {
        var body: some View {
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.textMuted.opacity(0.7))
                .accessibilityHidden(true)
        }
    }
#endif
