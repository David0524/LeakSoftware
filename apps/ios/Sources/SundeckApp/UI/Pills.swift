#if os(iOS)
    import SundeckCore
    import SwiftUI

    // Filter and chooser pills (spec 3.8): 32 tall capsules (owner, 2026-10-25: "shrink them") in a
    // 44 tall tap target, 15 medium text, 14 padding, 8 apart, in a row that
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

        /// The visible capsule's height.
        private static let capsuleHeight: CGFloat = 32

        var body: some View {
            Button(action: action) {
                HStack(spacing: 8) {
                    if let dot { TechDot(color: dot) }
                    Text(title)
                }
                .textRole(.secondary)
                .fontWeight(.medium)
                .lineLimit(1)
                .foregroundStyle(selected ? Color.onPrimary : Color.text)
                .padding(.horizontal, 14)
                .padding(.vertical, 4)
                // At least 32 tall; larger text grows it.
                .frame(minHeight: Self.capsuleHeight)
                .background(Capsule().fill(selected ? Color.brandPrimary : targeted ? Color.tinted : Color.fill))
                .overlay { if targeted { Capsule().strokeBorder(Color.link, lineWidth: 2) } }
                // The capsule is 32 tall inside the 44 tall tap target (owner, 2026-10-25).
                .frame(minHeight: minTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(selected ? [.isSelected] : [])
        }
    }

    /// Once per launch, across all rows: the first FilterPills row that scrolls nudges (a stored static
    /// can't live in the generic view).
    @MainActor private enum FilterPillsNudge {
        static var done = false
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
        @State private var position = ScrollPosition(edge: .leading)
        @State private var edges = Edges(more: false, atStart: true)
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        /// Where the row is scrolled: whether chips are past its trailing edge, and whether it's at its start.
        private struct Edges: Equatable {
            var more: Bool
            var atStart: Bool
        }

        /// How far the fade reaches in from the trailing edge, and how far the nudge slides.
        private static var fadeWidth: CGFloat { 40 }
        private static var nudgeDistance: CGFloat { 56 }

        /// Fades the last 40 pt while more chips are past the trailing edge (owner, 2026-10-25: "The names
        /// being scrollable here isn't really intuitive since they fit perfectly. Give a nudge").
        @ViewBuilder private var fadeMask: some View {
            if edges.more {
                HStack(spacing: 0) {
                    Color.black
                    LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: Self.fadeWidth)
                }
            } else {
                Color.black
            }
        }

        /// Slides the row a little way and back, once per launch, if it scrolls and sits at its start.
        private func nudgeIfNeeded() {
            guard edges.more, edges.atStart, !reduceMotion, !FilterPillsNudge.done else { return }
            FilterPillsNudge.done = true
            withAnimation(.easeInOut(duration: 0.35)) { position.scrollTo(x: Self.nudgeDistance) }
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(500))
                withAnimation(.spring(duration: 0.45)) { position.scrollTo(edge: .leading) }
            }
        }

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
            .scrollPosition($position)
            .onScrollGeometryChange(for: Edges.self) { geo in
                // Offsets start at minus the leading inset, so "at start" is the offset at or left of zero.
                // "More" needs a chip hidden by over 4 pt, past the row's 16 pt end margin: with only the
                // margin out of view, Schedule's row faded a chip that fits (CI screenshots, 2026-10-25).
                Edges(
                    more: geo.contentSize.width - (geo.contentOffset.x + geo.containerSize.width)
                        > CGFloat(Spacing.pageMargin) + 4,
                    atStart: geo.contentOffset.x <= 0)
            } action: { _, new in
                edges = new
            }
            .onChange(of: edges.more, initial: true) { nudgeIfNeeded() }
            .mask(fadeMask.animation(.easeInOut(duration: 0.2), value: edges.more))
            .contentMargins(.horizontal, CGFloat(Spacing.pageMargin), for: .scrollContent)
            .sensoryFeedback(.selection, trigger: selection)
        }
    }
#endif
