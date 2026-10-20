#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Filter and chooser pills (spec 3.8): 44 tall capsules, body medium, 8 apart, in a row that
    // scrolls sideways edge to edge with the first pill 16 in. Unselected `fill` with `text`;
    // selected `primary` with `onPrimary` (decision 9).
    //
    //     FilterPills(selection: $filter, options: JobFilter.allCases, label: \.title)
    //
    // Place the row outside the screen's 16 margins (it brings its own).

    struct Pill: View {
        var title: String
        var selected: Bool
        /// Something dragged is over it (the Schedule's tech pills take a dropped stop).
        var targeted = false
        /// A tech's color, as a dot before the name (Whose Day, Whose Schedule).
        var dot: TechColor? = nil
        var action: () -> Void

        var body: some View {
            Button(action: action) {
                HStack(spacing: 8) {
                    if let dot { TechDot(color: dot) }
                    Text(title)
                }
                .textRole(.bodyMedium)
                .lineLimit(1)
                .foregroundStyle(selected ? Color.onPrimary : Color.text)
                .padding(.horizontal, 16)
                .frame(minHeight: minTarget)
                .background(Capsule().fill(selected ? Color.brandPrimary : targeted ? Color.tinted : Color.fill))
                .overlay { if targeted { Capsule().strokeBorder(Color.link, lineWidth: 2) } }
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selected ? [.isSelected] : [])
        }
    }

    struct FilterPills<Value: Hashable>: View {
        @Binding var selection: Value
        var options: [Value]
        var label: (Value) -> String
        /// Takes a dragged item's text on an option's pill (true when it's used); nil for none.
        /// Hovering a pill with it chooses that pill (spring loading).
        var canDrop: (Value) -> Bool = { _ in false }
        var onDrop: ((Value, String) -> Bool)?
        /// A tech's color for an option (a dot before its name), or nil.
        var dot: (Value) -> TechColor? = { _ in nil }
        @State private var targeted: Value?

        var body: some View {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(options, id: \.self) { option in
                        let pill = Pill(
                            title: label(option), selected: option == selection, targeted: targeted == option,
                            dot: dot(option)
                        ) { selection = option }
                        if let onDrop, canDrop(option) {
                            pill
                                .springLoadingBehavior(.enabled)
                                .dropDestination(for: String.self) { items, _ in
                                    items.first.map { onDrop(option, $0) } ?? false
                                } isTargeted: { over in
                                    if over { targeted = option } else if targeted == option { targeted = nil }
                                }
                        } else {
                            pill
                        }
                    }
                }
            }
            .contentMargins(.horizontal, CGFloat(Spacing.pageMargin), for: .scrollContent)
            .sensoryFeedback(.selection, trigger: selection)
        }
    }
#endif
