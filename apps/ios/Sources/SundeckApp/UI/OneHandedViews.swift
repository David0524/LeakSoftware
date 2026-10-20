#if os(iOS)
    import Combine
    import SundeckCore
    import SwiftUI
    import UIKit

    // Pieces for one-handed use in the field (owner, 2026-10-20;
    // docs/design/2026-10-20-one-handed-use.md): Undo where the button was, the bottom bars, the
    // sync bar pinned under the navigation bar, and "Saved" after text saves by itself.

    /// In place of Mark N Remaining for 5 seconds (spec 5): "Marked 4" in secondary text and an
    /// Undo pill. Not a toast or snackbar; it sits where the button was.
    struct UndoRow: View {
        var text: String
        var undo: () -> Void

        var body: some View {
            HStack(spacing: 12) {
                Text(text).textRole(.secondary).foregroundStyle(Color.textMuted)
                Button(UndoText.undo, action: undo).buttonStyle(.secondary)
                    .accessibilityHint("Puts it back as it was")
            }
            .frame(minHeight: minTarget)
            .onAppear { AccessibilityNotification.Announcement("\(text). \(UndoText.undo) available.").post() }
        }
    }

    extension View {
        /// The Undo window: `pending` clears after `UndoText.seconds`, or when the view goes away.
        func undoWindow(_ pending: Binding<MarkedUndo?>) -> some View {
            modifier(UndoWindow(pending: pending))
        }

        /// A bar pinned to the bottom of a screen or sheet (spec 1, 3, 8): the tab bar's frosted
        /// material with a hairline on top, page margins, above the keyboard when it's open.
        func bottomBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
            let content = bar()
            return safeAreaInset(edge: .bottom, spacing: 0) {
                content
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity)
                    .background(.bar)
                    .overlay(alignment: .top) { Hairline() }
            }
        }

        /// Whether the keyboard is open, for bars that hide while typing (spec 1).
        func trackingKeyboard(_ shown: Binding<Bool>) -> some View {
            onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
                shown.wrappedValue = true
            }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
                shown.wrappedValue = false
            }
        }

        /// The sync bar ("Offline · 3 changes on this phone") pinned under the navigation bar
        /// instead of scrolling away (spec 12). It still hides when everything is saved, and a tap
        /// still opens Sync.
        func pinnedSyncBar() -> some View {
            safeAreaInset(edge: .top, spacing: 0) { PinnedSyncBar() }
        }
    }

    private struct UndoWindow: ViewModifier {
        @Binding var pending: MarkedUndo?

        func body(content: Content) -> some View {
            content
                .task(id: pending) {
                    guard let current = pending else { return }
                    try? await Task.sleep(for: .seconds(UndoText.seconds))
                    guard !Task.isCancelled, pending == current else { return }
                    withAnimation(Motion.smooth) { pending = nil }
                }
                .onDisappear { pending = nil }
        }
    }

    private struct PinnedSyncBar: View {
        @Environment(SyncService.self) private var sync

        var body: some View {
            if syncBarMessage(sync.barStatus) != nil {
                SyncBarRow()
                    .padding(.horizontal, CGFloat(Spacing.pageMargin))
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity)
                    .background(Color.bg)
                    .transition(.opacity)
            }
        }
    }

    /// "Saved" in secondary text after typed text saves by itself (spec 4).
    struct SavedLabel: View {
        var body: some View {
            Text(Autosave.saved)
                .textRole(.secondary)
                .foregroundStyle(Color.textMuted)
                .transition(.opacity)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }
#endif

#if os(iOS)
    /// A row that folds a part of a card open and closed (owner, 2026-10-20: Report Text,
    /// Versions (N)): its name and a chevron that turns, 44 tall, the whole row tappable.
    struct DisclosureRow: View {
        var title: String
        @Binding var open: Bool
        var onToggle: () -> Void = {}
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            Button {
                onToggle()
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.25)) { open.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Text(title).textRole(.bodyMedium).foregroundStyle(Color.text)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.textMuted)
                        .rotationEffect(.degrees(open ? 90 : 0))
                        .accessibilityHidden(true)
                }
                .frame(maxWidth: .infinity, minHeight: minTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(open ? "Expanded" : "Collapsed")
        }
    }
#endif
