#if os(iOS)
    import SwiftUI

    /// A row in our own grouped block that swipes left to show a red Delete (spec 3.16): 88 wide,
    /// `fail` with white semibold text; a full swipe deletes too. `delete` asks first (the caller's
    /// confirmation), and the row always has a visible way to do the same (Delete in its sheet).
    /// VoiceOver gets a Delete action. For rows in a `List`, use `.swipeActions` instead.
    ///
    ///     SwipeDeleteRow(name: "Pressure test", delete: { deleting = row }) { … }
    struct SwipeDeleteRow<Content: View>: View {
        /// Read with the action: "Delete Pressure test".
        var name: String
        /// The red button's word: "Delete", or "Remove" for a checklist item.
        var title = "Delete"
        var delete: () -> Void
        @ViewBuilder var content: Content
        @State private var offset: CGFloat = 0
        @State private var start: CGFloat = 0
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        private let width: CGFloat = 88

        var body: some View {
            ZStack(alignment: .trailing) {
                if offset < 0 {
                    Button {
                        close()
                        delete()
                    } label: {
                        Text(title)
                            .font(.role(.bodyEmphasis))
                            .foregroundStyle(Color.onHeader)
                            .frame(width: max(width, -offset))
                            .frame(maxHeight: .infinity)
                            .background(Color.fail)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHidden(true)
                }
                content
                    .background(Color.surface)
                    .offset(x: offset)
                    .overlay {
                        // While open, a tap on the row closes it instead of opening it.
                        if offset < 0 {
                            Color.clear.contentShape(Rectangle()).onTapGesture { close() }
                        }
                    }
            }
            .clipped()
            .keepsHorizontalDrags()
            .simultaneousGesture(
                DragGesture(minimumDistance: 20)
                    .onChanged { value in
                        guard abs(value.translation.width) > abs(value.translation.height) else { return }
                        offset = min(0, start + value.translation.width)
                    }
                    .onEnded { value in
                        let end = start + value.translation.width
                        if end < -width * 2.5 {
                            close()
                            delete()
                        } else {
                            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
                                offset = end < -width / 2 ? -width : 0
                            }
                            start = offset
                        }
                    }
            )
            .accessibilityAction(named: "\(title) \(name)", delete)
        }

        private func close() {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { offset = 0 }
            start = 0
        }
    }

    /// A row action revealed by swiping left (`SwipeActionsRow`).
    struct SwipeAction: Identifiable {
        var title: String
        var systemImage: String
        var tint: Color
        var action: () -> Void
        var id: String { title }
    }

    /// A row in our own grouped block that swipes left to show its actions (Call, Text), each 76
    /// wide in its tint with a white symbol and word, and right to show its `leading` ones
    /// (Complete). The same actions are in the row's context menu (touch and hold) and its screen,
    /// and VoiceOver gets each as an action. A full swipe never runs one. For rows in a `List`,
    /// use `.swipeActions` instead.
    struct SwipeActionsRow<Content: View>: View {
        var actions: [SwipeAction]
        /// Shown by swiping right (gestures spec section 5: Today's Complete).
        var leading: [SwipeAction] = []
        /// The context menu with the same actions; off where touch and hold drags the row instead
        /// (the Schedule's stops), or where the row has its own menu.
        var menu = true
        @ViewBuilder var content: Content
        @State private var offset: CGFloat = 0
        @State private var start: CGFloat = 0
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        private let width: CGFloat = 76
        private var open: CGFloat { -width * CGFloat(actions.count) }
        private var openLeading: CGFloat { width * CGFloat(leading.count) }

        var body: some View {
            if actions.isEmpty && leading.isEmpty {
                content
            } else {
                row
            }
        }

        private func buttons(_ list: [SwipeAction], shown: CGFloat) -> some View {
            HStack(spacing: 0) {
                ForEach(list) { a in
                    Button {
                        close()
                        a.action()
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: a.systemImage).font(.system(size: 18, weight: .semibold))
                            Text(a.title).font(.role(.footnote).weight(.semibold))
                        }
                        .foregroundStyle(Color.onHeader)
                        .frame(width: max(width, shown / CGFloat(list.count)))
                        .frame(maxHeight: .infinity)
                        .background(a.tint)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHidden(true)
                }
            }
        }

        private var row: some View {
            ZStack {
                if offset < 0 {
                    buttons(actions, shown: -offset).frame(maxWidth: .infinity, alignment: .trailing)
                } else if offset > 0 {
                    buttons(leading, shown: offset).frame(maxWidth: .infinity, alignment: .leading)
                }
                content
                    .background(Color.surface)
                    .offset(x: offset)
                    .overlay {
                        if offset != 0 { Color.clear.contentShape(Rectangle()).onTapGesture { close() } }
                    }
            }
            .clipped()
            .keepsHorizontalDrags()
            .simultaneousGesture(
                DragGesture(minimumDistance: 20)
                    .onChanged { value in
                        guard abs(value.translation.width) > abs(value.translation.height) else { return }
                        let low = actions.isEmpty ? 0 : open * 1.3
                        let high = leading.isEmpty ? 0 : openLeading * 1.3
                        offset = min(high, max(low, start + value.translation.width))
                    }
                    .onEnded { value in
                        let end = start + value.translation.width
                        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
                            offset =
                                end < open / 2 && !actions.isEmpty
                                ? open : end > openLeading / 2 && !leading.isEmpty ? openLeading : 0
                        }
                        start = offset
                    }
            )
            .modifier(ActionsMenu(actions: leading + actions, on: menu))
            .accessibilityActions {
                ForEach(leading + actions) { a in Button(a.title, action: a.action) }
            }
        }

        private func close() {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { offset = 0 }
            start = 0
        }
    }

    /// The row's actions in its context menu, when it has one.
    private struct ActionsMenu: ViewModifier {
        var actions: [SwipeAction]
        var on: Bool

        @ViewBuilder func body(content: Content) -> some View {
            if on {
                content.contextMenu {
                    ForEach(actions) { a in Button(a.title, systemImage: a.systemImage, action: a.action) }
                }
            } else {
                content
            }
        }
    }
#endif
