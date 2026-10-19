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
#endif
