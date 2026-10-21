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
        /// A sideways drag is on: the row's own buttons don't take the lift as a tap.
        @State private var swiping = false
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
                    .swipeQuiet(swiping)
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
                        swiping = true
                        offset = min(0, start + value.translation.width)
                    }
                    .onEnded { value in
                        releaseSwipe($swiping)
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
        /// `.destructive` for Delete and Void in a menu (red, listed last; they ask first).
        var role: ButtonRole? = nil
        var action: () -> Void
        var id: String { title }
    }

    /// A row's touch-and-hold menu (gestures spec section 12): no preview of its own, titled with
    /// the row's name ("Grace Holloway · Job #1040"), only the actions the row can take, and
    /// Delete or Void last in red.
    struct RowMenu: View {
        var title: String?
        var items: [SwipeAction]

        var body: some View {
            if let title {
                Section(title) { buttons }
            } else {
                buttons
            }
        }

        @ViewBuilder private var buttons: some View {
            ForEach(items) { a in
                Button(a.title, systemImage: a.systemImage, role: a.role, action: a.action)
            }
        }
    }

    extension View {
        /// The row's touch-and-hold menu (`RowMenu`); nothing when it has no actions.
        @ViewBuilder func rowMenu(_ title: String?, _ items: [SwipeAction]) -> some View {
            if items.isEmpty {
                self
            } else {
                contextMenu { RowMenu(title: title, items: items) }
            }
        }

        /// Swipe actions of a custom row as VoiceOver actions ("Call", "Move…").
        func swipeAccessibilityActions(_ items: [SwipeAction]) -> some View {
            accessibilityActions {
                ForEach(items) { a in Button(a.title, action: a.action) }
            }
        }
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
        /// The menu's title, the row's name (gestures spec section 12).
        var menuTitle: String? = nil
        /// The menu's own items, when they differ from the swipes (Open, Move…, Copy Job Number).
        var menuItems: [SwipeAction]? = nil
        /// The trailing width where a swipe never starts: the Schedule's drag grip.
        var gripWidth: CGFloat = 0
        @ViewBuilder var content: Content
        @State private var rowWidth: CGFloat = 0
        @State private var offset: CGFloat = 0
        @State private var start: CGFloat = 0
        /// A sideways drag is on: the row's address, name and buttons don't take the lift as a
        /// tap (owner, 2026-10-21: "do not make the address clickable when swiping left/right on
        /// a card").
        @State private var swiping = false
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

        /// The first action sits on the outer edge (the most used, as iOS lists put it): trailing
        /// actions are drawn from the right.
        private func buttons(_ list: [SwipeAction], shown: CGFloat, trailing: Bool = false) -> some View {
            HStack(spacing: 0) {
                ForEach(trailing ? list.reversed() : list) { a in
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
                    buttons(actions, shown: -offset, trailing: true).frame(maxWidth: .infinity, alignment: .trailing)
                } else if offset > 0 {
                    buttons(leading, shown: offset).frame(maxWidth: .infinity, alignment: .leading)
                }
                content
                    .swipeQuiet(swiping)
                    .background(Color.surface)
                    .offset(x: offset)
                    .overlay {
                        if offset != 0 { Color.clear.contentShape(Rectangle()).onTapGesture { close() } }
                    }
            }
            .clipped()
            .onGeometryChange(for: CGFloat.self) {
                $0.size.width
            } action: {
                rowWidth = $0
            }
            .keepsHorizontalDrags()
            .simultaneousGesture(
                DragGesture(minimumDistance: 20)
                    .onChanged { value in
                        guard abs(value.translation.width) > abs(value.translation.height), startsOffGrip(value)
                        else { return }
                        swiping = true
                        let low = actions.isEmpty ? 0 : open * 1.3
                        let high = leading.isEmpty ? 0 : openLeading * 1.3
                        offset = min(high, max(low, start + value.translation.width))
                    }
                    .onEnded { value in
                        releaseSwipe($swiping)
                        guard startsOffGrip(value) else { return }
                        let end = start + value.translation.width
                        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
                            offset =
                                end < open / 2 && !actions.isEmpty
                                ? open : end > openLeading / 2 && !leading.isEmpty ? openLeading : 0
                        }
                        start = offset
                    }
            )
            .modifier(ActionsMenu(title: menuTitle, actions: menuItems ?? leading + actions, on: menu))
            .swipeAccessibilityActions(leading + actions)
        }

        /// A drag that starts on the grip picks the card up; it never opens the swipe.
        private func startsOffGrip(_ value: DragGesture.Value) -> Bool {
            gripWidth == 0 || offset != 0 || value.startLocation.x < rowWidth - gripWidth
        }

        private func close() {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { offset = 0 }
            start = 0
        }
    }

    extension View {
        /// While a row or page is dragged sideways its buttons and links are off, so the finger's
        /// lift isn't a tap, without looking dimmed (as Today's card, 2026-10-20).
        func swipeQuiet(_ swiping: Bool) -> some View {
            disabled(swiping).environment(\.pageSwiping, swiping)
        }
    }

    /// Buttons back on after the lift's tap would have landed.
    @MainActor func releaseSwipe(_ swiping: Binding<Bool>) {
        guard swiping.wrappedValue else { return }
        Task {
            try? await Task.sleep(for: .milliseconds(300))
            swiping.wrappedValue = false
        }
    }

    /// The row's actions in its context menu, when it has one.
    private struct ActionsMenu: ViewModifier {
        var title: String?
        var actions: [SwipeAction]
        var on: Bool

        @ViewBuilder func body(content: Content) -> some View {
            if on {
                content.rowMenu(title, actions)
            } else {
                content
            }
        }
    }
#endif
