#if os(iOS)
    import SwiftUI

    // One Save for a whole settings page (owner, 2026-10-22: "Let's remove all the save buttons
    // on that page and just have one floating one on the bottom"). It floats over the bottom of
    // the page like the website's and Android's Next Step bar: glass on iOS 26, the regular
    // material before. Save is dimmed until something changes, reads "Saving…" while it saves,
    // and then "Saved." shows above it until the next change; a problem shows there instead.
    // Hidden while the keyboard is up, as the Next Step bar is. Same on the website
    // (settings-forms.tsx SaveBar) and Android (ui/SaveBar.tsx).

    /// What the last Save said: "Saved." or what went wrong.
    struct SaveBarResult: Equatable {
        var text: String
        var error: Bool
    }

    /// The floating bar: what the last save said, then the Save pill.
    struct SaveBar: View {
        var changed: Bool
        var busy: Bool
        var result: SaveBarResult?
        var action: () -> Void

        /// "Saved." only while nothing has changed since; a problem until the next Save.
        private var line: SaveBarResult? {
            guard let result else { return nil }
            return result.error || !changed ? result : nil
        }

        var body: some View {
            VStack(spacing: 4) {
                if let line {
                    HStack(spacing: 6) {
                        if !line.error {
                            Image(systemName: "checkmark.circle.fill").accessibilityHidden(true)
                        }
                        Text(line.text).fixedSize(horizontal: false, vertical: true)
                    }
                    .textRole(.secondary)
                    .fontWeight(.semibold)
                    .foregroundStyle(line.error ? Color.fail : Color.pass)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, minHeight: 28)
                    .accessibilityElement(children: .combine)
                    .transition(.opacity)
                }
                Button(action: action) { BusyButtonLabel("Save", busy: busy, busyTitle: "Saving…") }
                    .buttonStyle(.primary(fullWidth: true, size: .field))
                    .disabled(!changed || busy)
            }
            .padding(8)
            .glassSurface(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            .animation(Motion.snappy, value: line)
            .onChange(of: result) { _, now in
                if let now { AccessibilityNotification.Announcement(now.text).post() }
            }
        }
    }

    extension View {
        /// The page's one Save, floating at the bottom; the page scrolls its last row above it.
        func saveBar(
            changed: Bool, busy: Bool, result: SaveBarResult?, action: @escaping () -> Void
        ) -> some View {
            modifier(SaveBarPlacement(changed: changed, busy: busy, result: result, action: action))
        }
    }

    private struct SaveBarPlacement: ViewModifier {
        var changed: Bool
        var busy: Bool
        var result: SaveBarResult?
        var action: () -> Void
        @State private var keyboardShown = false

        func body(content: Content) -> some View {
            content
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if !keyboardShown {
                        SaveBar(changed: changed, busy: busy, result: result, action: action)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .trackingKeyboard($keyboardShown)
        }
    }
#endif
