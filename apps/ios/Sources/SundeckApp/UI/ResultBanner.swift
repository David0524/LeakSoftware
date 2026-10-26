#if os(iOS)
    import SwiftUI
    import UIKit

    /// What a planning change did, said once at the top of the screen and gone again (owner,
    /// 2026-10-20, of Schedule's green "Planned: …" block: "That note looks horrible. Display it on
    /// a banner on the top of the screen maybe"). A symbol and one short line ("Optimized · 1 hr 6
    /// min less driving · Back by 4:28 PM"), a second caption line for a warning, and Undo when the
    /// change can be put back.
    struct ResultBanner: Identifiable, Equatable {
        enum Kind: Equatable { case success, warning, error }

        let id = UUID()
        var kind: Kind
        var title: String
        var detail: String? = nil
        /// Shows Undo, and stays twice as long so there's time to press it.
        var undoable = false
        /// What Undo does, for VoiceOver (Plan Week's by default).
        var undoHint: String? = nil
        /// How long it stays when not the usual (Undo after a removal: five seconds).
        var holdSeconds: Double? = nil

        var symbol: String { kind == .success ? "checkmark.circle.fill" : "exclamationmark.triangle.fill" }

        var color: Color {
            switch kind {
            case .success: Color.pass
            case .warning: Color.warning
            case .error: Color.fail
            }
        }

        /// How long it stays: 4 seconds, 8 with Undo (5 after a removal), longer with VoiceOver; errors until dismissed
        /// (feedback.md: people need to know when something didn't happen).
        @MainActor var seconds: Double? {
            guard kind != .error else { return nil }
            let base: Double = holdSeconds ?? (undoable ? 8 : 4)
            return UIAccessibility.isVoiceOverRunning ? base * 2.5 : base
        }

        var spoken: String { [title, detail].compactMap { $0 }.joined(separator: ". ") }
    }

    extension View {
        /// Shows `banner` at the top of this view, under the navigation bar: it slides down with a
        /// spring (a fade with Reduce Motion), goes by itself after a few seconds (errors stay),
        /// and a tap or a swipe up dismisses it. VoiceOver reads it out when it appears.
        func resultBanner(_ banner: Binding<ResultBanner?>, onUndo: (() -> Void)? = nil) -> some View {
            modifier(ResultBannerHost(banner: banner, onUndo: onUndo))
        }
    }

    private struct ResultBannerHost: ViewModifier {
        @Binding var banner: ResultBanner?
        var onUndo: (() -> Void)?
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        func body(content: Content) -> some View {
            content
                .overlay(alignment: .top) {
                    ZStack {
                        if let shown = banner {
                            ResultBannerView(
                                banner: shown,
                                onUndo: shown.undoable
                                    ? onUndo.map { undo in
                                        {
                                            dismiss()
                                            undo()
                                        }
                                    } : nil,
                                dismiss: dismiss
                            )
                            .id(shown.id)
                            .padding(.horizontal, 16)
                            .padding(.top, 8)
                            .transition(
                                reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                        }
                    }
                    .animation(
                        reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.42, dampingFraction: 0.82),
                        value: banner?.id)
                }
                .task(id: banner?.id) {
                    guard let shown = banner, let seconds = shown.seconds else { return }
                    try? await Task.sleep(for: .seconds(seconds))
                    if !Task.isCancelled, banner?.id == shown.id { banner = nil }
                }
                .onChange(of: banner?.id) { _, id in
                    guard id != nil, let shown = banner else { return }
                    AccessibilityNotification.Announcement(shown.spoken).post()
                }
        }

        private func dismiss() { banner = nil }
    }

    /// The banner itself: Liquid Glass on iOS 26 (it floats over the content, in the functional
    /// layer), the regular material before.
    private struct ResultBannerView: View {
        var banner: ResultBanner
        var onUndo: (() -> Void)?
        var dismiss: () -> Void
        @State private var pull: CGFloat = 0
        @Environment(\.drawsGlass) private var drawsGlass

        var body: some View {
            let shape = RoundedRectangle(cornerRadius: 26, style: .continuous)
            HStack(spacing: 12) {
                Image(systemName: banner.symbol)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(banner.color)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(banner.title)
                        .font(.role(.bodyEmphasis))
                        .foregroundStyle(Color.text)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)
                    if let detail = banner.detail {
                        Text(detail)
                            .textRole(.footnote)
                            .foregroundStyle(Color.textMuted)
                            .lineLimit(3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let onUndo {
                    Button("Undo", action: onUndo)
                        .accessibilityHint(banner.undoHint ?? "Puts every job back as it was")
                        .font(.role(.bodyEmphasis))
                        .foregroundStyle(Color.link)
                        .padding(.horizontal, 12)
                        .frame(minHeight: minTarget)
                        .contentShape(Capsule())
                        .buttonStyle(.plain)
                }
            }
            .padding(.leading, 16)
            .padding(.trailing, onUndo == nil ? 16 : 4)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
            .glassSurface(shape, interactive: true)
            .shadow(color: .black.opacity(usesGlass(drawsGlass) ? 0 : 0.12), radius: 16, y: 6)
            .contentShape(shape)
            .offset(y: min(0, pull))
            .onTapGesture(perform: dismiss)
            .gesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { pull = $0.translation.height }
                    .onEnded { value in
                        if value.translation.height < -16 || value.predictedEndTranslation.height < -48 {
                            dismiss()
                        } else {
                            withAnimation(Motion.snappy) { pull = 0 }
                        }
                    }
            )
            .accessibilityElement(children: .contain)
            .accessibilityLabel(banner.spoken)
            .accessibilityAddTraits(.isStaticText)
            .accessibilityAction(named: "Dismiss", dismiss)
        }
    }
#endif
