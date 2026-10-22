#if os(iOS)
    import SwiftUI

    // Inset grouped lists and their rows (spec 3.4).
    //
    // In a `ScrollView` screen (Today, the job's sections), use `Grouped`:
    //
    //     Grouped(label: "Customer", footer: "Shown on the report.") {
    //         Button { … } label: { ListRow("Riley Rivera", detail: "1423 Palm Ct", emphasized: true, chevron: true) }
    //             .buttonStyle(.row)
    //         ListRow("Tech", value: "Tony Tech")
    //         StackedRow(caption: "Why they called", value: "Pool water level dropping")
    //         ActionRow("Edit Contact Details") { … }
    //     }
    //
    // In a `List` screen (Jobs, More, Settings), use `Section` with `SectionLabel` as its header,
    // `.surfaceRow()` on each row and `.groupedList()` on the list.

    /// One inset grouped block: an optional section label above, rows on `surface` with hairlines
    /// between them (starting `separatorInset` in), an optional footer below. Flat, radius 12.
    struct Grouped<Content: View>: View {
        var label: String?
        var footer: String?
        /// Where the hairlines start: 16 (the text), 60 for findings (after the number circle).
        var separatorInset: CGFloat = 16
        @ViewBuilder var content: Content

        var body: some View {
            VStack(alignment: .leading, spacing: CGFloat(Spacing.labelToGroup)) {
                if let label { SectionLabel(label) }
                VStack(spacing: 0) {
                    Group(subviews: content) { rows in
                        ForEach(rows) { row in
                            if row.id != rows.first?.id { Hairline().padding(.leading, separatorInset) }
                            row
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .background(Color.surface)
                .clipShape(RoundedRectangle(cornerRadius: CGFloat(Radius.grouped), style: .continuous))
                if let footer {
                    Text(footer)
                        .textRole(.footnote)
                        .foregroundStyle(Color.textMuted)
                        .padding(.horizontal, 16)
                }
            }
        }
    }

    /// A 0.5 pt `separator` line.
    struct Hairline: View {
        var body: some View {
            Rectangle().fill(Color.separator).frame(height: 0.5).accessibilityHidden(true)
        }
    }

    /// How a row's value on the right reads.
    enum RowValueStyle {
        /// Body, `textMuted` ("Tech · Tony Tech").
        case muted
        /// Semibold `text`, tabular ("Detection fee · $649.00").
        case money
    }

    /// A list row (spec 3.4): optional icon, the label with an optional detail line under it, an
    /// optional value or trailing control, and a chevron when it opens something. At least 44
    /// tall, 16 side and 10 top and bottom padding, items 12 apart. At accessibility text sizes
    /// the value moves under the label.
    struct ListRow<Trailing: View>: View {
        var title: String
        var detail: String?
        var value: String?
        var valueStyle: RowValueStyle = .muted
        /// `bodyEmphasis` for a person's or customer's name.
        var emphasized = false
        var chevron = false
        /// An SF Symbol leading the row, in `link`.
        var icon: String?
        /// A drawn icon in place of a symbol (`withLeading(_:)`), in `link`, 28 wide.
        var leading: AnyView? = nil
        /// Follows the title on its line (the not-on-map symbol after a pool's address).
        var titleMark: Text? = nil
        @ViewBuilder var trailing: Trailing
        @Environment(\.dynamicTypeSize) private var typeSize

        var body: some View {
            HStack(spacing: CGFloat(Spacing.rowItems)) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 20))
                        .foregroundStyle(Color.link)
                        .frame(width: 28)
                        .accessibilityHidden(true)
                } else if let leading {
                    leading.foregroundStyle(Color.link).frame(width: 28).accessibilityHidden(true)
                }
                let layout =
                    typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                    : AnyLayout(HStackLayout(alignment: .center, spacing: CGFloat(Spacing.rowItems)))
                layout {
                    VStack(alignment: .leading, spacing: 2) {
                        (Text(title) + (titleMark ?? Text("")))
                            .textRole(emphasized ? .bodyEmphasis : .body)
                            .foregroundStyle(Color.text)
                        if let detail {
                            Text(detail).textRole(.secondary).foregroundStyle(Color.textMuted)
                        }
                    }
                    if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
                    if let value {
                        Text(value)
                            .font(.role(valueStyle == .money ? .bodyEmphasis : .body))
                            .monospacedDigit()
                            .foregroundStyle(valueStyle == .money ? Color.text : Color.textMuted)
                            .multilineTextAlignment(typeSize.isAccessibilitySize ? .leading : .trailing)
                    }
                    trailing
                }
                if chevron { Chevron() }
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    extension ListRow {
        /// The row with a drawn icon leading it (a cleaning's icon).
        func withLeading(_ view: some View) -> ListRow {
            var row = self
            row.leading = AnyView(view)
            return row
        }
    }

    extension ListRow where Trailing == EmptyView {
        init(
            _ title: String, detail: String? = nil, value: String? = nil, valueStyle: RowValueStyle = .muted,
            emphasized: Bool = false, chevron: Bool = false, icon: String? = nil
        ) {
            self.init(
                title: title, detail: detail, value: value, valueStyle: valueStyle, emphasized: emphasized,
                chevron: chevron, icon: icon, trailing: { EmptyView() })
        }
    }

    extension ListRow {
        /// A control row: label left, control right (a switch, segmented control, select).
        init(_ title: String, detail: String? = nil, icon: String? = nil, @ViewBuilder control: () -> Trailing) {
            self.init(title: title, detail: detail, icon: icon, trailing: control)
        }
    }

    /// A small muted caption above the body value ("Why they called" over "Pool water level
    /// dropping").
    struct StackedRow: View {
        var caption: String
        var value: String

        var body: some View {
            VStack(alignment: .leading, spacing: 2) {
                Text(caption).textRole(.secondary).foregroundStyle(Color.textMuted)
                Text(value).textRole(.body).foregroundStyle(Color.text)
            }
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(maxWidth: .infinity, minHeight: minTarget, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    /// A row that does something: `link` text ("Set Up Checklist"), or with `role: .destructive`
    /// centered `fail` text ("Sign Out").
    struct ActionRow: View {
        var title: String
        var role: ButtonRole?
        var action: () -> Void

        init(_ title: String, role: ButtonRole? = nil, action: @escaping () -> Void) {
            self.title = title
            self.role = role
            self.action = action
        }

        var body: some View {
            let destructive = role == .destructive
            Button(role: role, action: action) {
                Text(title)
                    .textRole(.body)
                    .foregroundStyle(destructive ? Color.fail : Color.link)
                    .frame(maxWidth: .infinity, alignment: destructive ? .center : .leading)
                    .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
                    .padding(.vertical, CGFloat(Spacing.rowVertical))
                    .frame(minHeight: minTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.row)
        }
    }

    /// A row that opens something, `link` text with a muted line under it (a customer's pool:
    /// "Chemical", "Last: FC 3 · pH 7.6 · …"). Use as a `.row` button's label.
    struct LinkDetailRow: View {
        var title: String
        var detail: String

        var body: some View {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).textRole(.body).foregroundStyle(Color.link)
                Text(detail).textRole(.secondary).monospacedDigit().foregroundStyle(Color.textMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, CGFloat(Spacing.rowHorizontal))
            .padding(.vertical, CGFloat(Spacing.rowVertical))
            .frame(minHeight: minTarget)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
    }

    /// A tapped row gets `rowPressed` behind it. `Button { … } label: { ListRow(…) }.buttonStyle(.row)`
    struct RowButtonStyle: ButtonStyle {
        func makeBody(configuration: Configuration) -> some View {
            configuration.label
                .background(configuration.isPressed ? Color.rowPressed : .clear)
        }
    }

    extension ButtonStyle where Self == RowButtonStyle {
        static var row: RowButtonStyle { RowButtonStyle() }
    }

    extension View {
        /// A `List` drawn as the spec's inset grouped lists: 16 margins, 24 between sections, the
        /// page's `bg` behind it. Give each row `.surfaceRow()`.
        func groupedList() -> some View {
            listStyle(.insetGrouped)
                .contentMargins(.horizontal, CGFloat(Spacing.pageMargin), for: .scrollContent)
                .listSectionSpacing(CGFloat(Spacing.betweenBlocks))
                .scrollContentBackground(.hidden)
                .background(Color.bg)
        }

        /// A `List` row on `surface` (the system's row color differs from ours in dark mode).
        func surfaceRow() -> some View {
            listRowBackground(Color.surface)
                .listRowSeparatorTint(Color.separator)
        }
    }
#endif
